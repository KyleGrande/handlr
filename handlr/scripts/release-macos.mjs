// Local Handlr release: keep the existing isolated workspace/session, compile
// with Cargo's optimized profile, sign the bundle and optionally install it.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('This local installer requires macOS.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
};
const env = { ...process.env };
// A local fork must not replace itself with an upstream Herdr update.
delete env.HERDR_APP_RELEASE;
run(process.execPath, ['scripts/toolchain.mjs', 'cargo', 'build', '--release', '--locked', '--manifest-path', '../Cargo.toml'], { env });
const source = join(root, '.checks/Handlr.app/Contents/Info.plist');
const converted = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', source], { encoding: 'utf8' });
if (converted.status !== 0) throw new Error('The isolated Handlr configuration must be prepared first.');
const info = JSON.parse(converted.stdout);
Object.assign(info, { CFBundleIdentifier: 'dev.handlr.app', CFBundleName: 'Handlr', CFBundleDisplayName: 'Handlr', CFBundleIconFile: 'Handlr' });
info.LSEnvironment.PATH = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
const app = join(root, 'dist/Handlr.app');
rmSync(app, { recursive: true, force: true });
mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
mkdirSync(join(app, 'Contents/Resources'), { recursive: true });
cpSync(join(root, '../target/release/herdr-app'), join(app, 'Contents/MacOS/Herdr'));
cpSync(join(root, 'assets/icons/Handlr.icns'), join(app, 'Contents/Resources/Handlr.icns'));
for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES']) cpSync(join(root, '..', name), join(app, 'Contents/Resources', name));
writeFileSync(join(app, 'Contents/Info.plist'), JSON.stringify(info));
run('/usr/bin/plutil', ['-convert', 'xml1', join(app, 'Contents/Info.plist')]);
run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--strict', app]);
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, join(root, 'dist/Handlr-macos-arm64.zip')]);
if (process.argv.includes('--install')) {
  const destination = join(homedir(), 'Applications/Handlr.app');
  mkdirSync(dirname(destination), { recursive: true });
  const staged = `${destination}.staging`;
  rmSync(staged, { recursive: true, force: true });
  cpSync(app, staged, { recursive: true });
  if (existsSync(destination)) renameSync(destination, `${destination}.backup-${Date.now()}`);
  renameSync(staged, destination);
  run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', destination]);
  console.log(`Installed ${destination}`);
}
console.log(`Built ${app}`);
