import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const packager = readFileSync(new URL('../scripts/package-macos.mjs', import.meta.url), 'utf8');
const launcher = new Function(`return ${packager.match(/const launcher = (`[\s\S]*?`);/)[1]};`)();

function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'handlr-config-')));
  const app = join(home, 'app/Contents');
  mkdirSync(join(app, 'MacOS'), { recursive: true });
  mkdirSync(join(app, 'Resources/first-run/layouts'), { recursive: true });
  mkdirSync(join(app, 'Resources/first-run/workspaces'), { recursive: true });
  for (const name of ['settings.json', 'shared.json', 'layouts/Handlr.json', 'layouts/panel-workspace-native.svg', 'workspaces/Handlr.json']) {
    writeFileSync(join(app, 'Resources/first-run', name), name.endsWith('.svg') ? '<svg/>' : '{}');
  }
  writeFileSync(join(app, 'MacOS/Handlr'), launcher);
  writeFileSync(join(app, 'MacOS/Herdr'), '#!/bin/sh\nprintf "%s" "$HERDR_APP_HOME"\n', { mode: 0o755 });
  return {
    home,
    launch(overrides = {}) {
      const env = { ...process.env, HOME: home };
      delete env.HERDR_APP_HOME; delete env.XDG_CONFIG_HOME;
      Object.assign(env, overrides);
      const result = spawnSync('/bin/sh', [join(app, 'MacOS/Handlr')], { env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    },
    cleanup() { rmSync(home, { recursive: true, force: true }); },
  };
}

test('public launcher migrates legacy settings and keeps old paths usable', () => {
  const f = fixture();
  try {
    const legacy = join(f.home, 'Library/Application Support/Handlr');
    mkdirSync(join(legacy, 'mods/personal'), { recursive: true });
    writeFileSync(join(legacy, 'settings.json'), '{"custom":true}');
    writeFileSync(join(legacy, 'mods/personal/main.js'), 'personal code');
    const current = join(f.home, '.config/handlr');
    assert.equal(f.launch(), current);
    assert.equal(realpathSync(legacy), current);
    assert.equal(readFileSync(join(current, 'settings.json'), 'utf8'), '{"custom":true}');
    assert.equal(readFileSync(join(legacy, 'mods/personal/main.js'), 'utf8'), 'personal code');
    assert.equal(f.launch(), current);
  } finally { f.cleanup(); }
});

test('existing new home is never overwritten or merged with legacy data', () => {
  const f = fixture();
  try {
    const legacy = join(f.home, 'Library/Application Support/Handlr');
    const current = join(f.home, '.config/handlr');
    for (const p of [legacy, current]) mkdirSync(p, { recursive: true });
    writeFileSync(join(legacy, 'settings.json'), 'legacy');
    writeFileSync(join(current, 'settings.json'), 'current');
    assert.equal(f.launch(), current);
    assert.equal(readFileSync(join(legacy, 'settings.json'), 'utf8'), 'legacy');
    assert.equal(readFileSync(join(current, 'settings.json'), 'utf8'), 'current');
  } finally { f.cleanup(); }
});

test('explicit app home wins over XDG without moving the legacy home', () => {
  const f = fixture();
  try {
    const legacy = join(f.home, 'Library/Application Support/Handlr');
    mkdirSync(legacy, { recursive: true });
    const custom = join(f.home, 'custom home');
    assert.equal(f.launch({ HERDR_APP_HOME: custom, XDG_CONFIG_HOME: join(f.home, 'xdg') }), custom);
    assert.equal(realpathSync(legacy), legacy);
    assert.ok(!existsSync(join(f.home, 'xdg/handlr')));
  } finally { f.cleanup(); }
});

test('public default follows XDG_CONFIG_HOME when set', () => {
  const f = fixture();
  try {
    const xdg = join(f.home, 'custom config');
    assert.equal(f.launch({ XDG_CONFIG_HOME: xdg }), join(xdg, 'handlr'));
  } finally { f.cleanup(); }
});
