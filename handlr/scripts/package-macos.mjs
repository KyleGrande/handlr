// Package an already-built Apple Silicon binary for distribution, without
// copying a developer's app home, sessions, environment or local plist.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Package on Apple Silicon macOS.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..');
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: repo, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
};
const out = join(root, 'dist/public');
const app = join(out, 'Handlr.app');
const resources = join(app, 'Contents/Resources');
rmSync(app, { recursive: true, force: true });
mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
mkdirSync(join(resources, 'first-run/layouts'), { recursive: true });
mkdirSync(join(resources, 'first-run/workspaces'), { recursive: true });
cpSync(join(repo, 'target/release/herdr-app'), join(app, 'Contents/MacOS/Herdr'));
cpSync(join(repo, 'assets/icons/Herdr.icns'), join(resources, 'Handlr.icns'));
for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES']) cpSync(join(repo, name), join(resources, name));
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
if (commit.status !== 0) throw new Error('Cannot identify source commit.');
writeFileSync(join(resources, 'build-info.json'), JSON.stringify({ source_commit: commit.stdout.trim(), upstream: 'b67715e', platform: 'macos-arm64' }, null, 2));

// Start with bundled panels only. Optional Context, Toolbox and Rigs mods
// remain separate installs, rather than references to the developer's copies.
const doc = JSON.parse(readFileSync(join(root, 'prototype/workspaces/panel-workspace-native.json')));
const bundled = new Set(['files', 'changes', 'spaces', 'agents']);
doc.panels = Object.fromEntries(Object.entries(doc.panels).filter(([, p]) => bundled.has(p.content.name)));
for (const group of doc.groups) {
  for (const view of group.views) view.sections = view.sections.filter(s => doc.panels[s.panel_id]);
  group.views = group.views.filter(v => v.sections.length);
  group.active_view_id = group.views[0]?.id;
}
doc.groups = doc.groups.filter(g => g.views.length);
for (const zone of doc.zones) {
  zone.groups = zone.groups.filter(r => doc.groups.some(g => g.id === r.group_id));
  zone.hidden = zone.groups.length === 0;
}
const layout = JSON.parse(readFileSync(join(root, 'prototype/layouts/panel-workspace-native.json')));
layout.workspace = 'Handlr';
cpSync(join(root, 'prototype/layouts/panel-workspace-native.svg'), join(resources, 'first-run/layouts/panel-workspace-native.svg'));
for (const [name, value] of Object.entries({ 'settings.json': { core_session: 'own' }, 'shared.json': { layout: 'Handlr' },
  'layouts/Handlr.json': layout, 'workspaces/Handlr.json': doc })) {
  writeFileSync(join(resources, 'first-run', name), JSON.stringify(value, null, 2) + '\n');
}
const launcher = `#!/bin/sh
set -eu
app_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export HERDR_APP_HOME="\${HERDR_APP_HOME:-$HOME/Library/Application Support/Handlr}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/workspaces" "$HERDR_APP_HOME/core"
for name in settings.json shared.json layouts/Handlr.json layouts/panel-workspace-native.svg workspaces/Handlr.json; do
  if [ ! -e "$HERDR_APP_HOME/$name" ]; then
    cp -n "$app_dir/Resources/first-run/$name" "$HERDR_APP_HOME/$name"
  fi
done
exec "$app_dir/MacOS/Herdr" "$@"
`;
writeFileSync(join(app, 'Contents/MacOS/Handlr'), launcher);
chmodSync(join(app, 'Contents/MacOS/Handlr'), 0o755);
const info = { CFBundleExecutable: 'Handlr', CFBundleIdentifier: 'dev.handlr.app', CFBundleName: 'Handlr',
  CFBundleDisplayName: 'Handlr', CFBundleIconFile: 'Handlr', CFBundlePackageType: 'APPL',
  CFBundleShortVersionString: '0.1.0', CFBundleVersion: '1', NSPrincipalClass: 'NSApplication', NSHighResolutionCapable: true,
  NSMicrophoneUsageDescription: 'Terminal programs running in Handlr can use the microphone.',
  NSCameraUsageDescription: 'Terminal programs running in Handlr can use the camera.',
  NSAppleEventsUsageDescription: 'Terminal programs running in Handlr can use AppleScript to control other apps.' };
writeFileSync(join(app, 'Contents/Info.plist'), JSON.stringify(info));
run('plutil', ['-convert', 'xml1', join(app, 'Contents/Info.plist')]);
run('codesign', ['--force', '--sign', '-', app]);
run('codesign', ['--verify', '--strict', app]);
const zip = join(out, 'Handlr-macos-arm64.zip');
rmSync(zip, { force: true });
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
writeFileSync(join(out, 'SHA256SUMS.txt'), createHash('sha256').update(readFileSync(zip)).digest('hex') + '  Handlr-macos-arm64.zip\n');
console.log(`Packaged ${zip}`);
