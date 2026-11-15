import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as pure from '../../defaults/frame/settings/glass-state.js';

const source = (await readFile(new URL('../../defaults/frame/settings/glass.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
const palette = {
  background: '#17191d', canvas: '#111316', chrome: '#0b0d10', surface: '#17191d',
  popover: '#24272b', raised: '#30343a', border: '#ffffff18', foreground: '#eeeeef', accent: '#abcdef',
};

function fixture(name = 'Handlr', original = { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } }] }) {
  const files = new Map([[`/app/layouts/${name}.json`, JSON.stringify(original)], ['/app/settings.json', '{}']]);
  const values = { layout: name };
  const current = { dark: true, theme_dark: 'dark', theme_light: 'light' };
  let signal = { code: 0, stdout: 'blur' };
  const host = {
    appHome: () => '/app', readTextFile: async path => files.get(path) ?? null,
    writeTextFile: async (path, text, expected) => { assert.equal(files.get(path) ?? null, expected, 'guard every write'); files.set(path, text); },
    shared: key => values[key], setShared: (key, value) => { values[key] = structuredClone(value); },
    window: () => ({ platform: 'macos' }), exec: async () => signal,
    settings: () => current, themes: () => [{ name: 'dark', colors: palette }, { name: 'light', colors: { ...palette, background: '#ffffff', canvas: '#f0f0eb', surface: '#ffffff', border: '#00000017' } }],
    layouts: () => [...files.keys()].filter(key => key.startsWith('/app/layouts/')).map(key => key.slice(13, -5)),
    layout: () => original, notify: () => {}, run: (command, args) => { assert.equal(command, 'layout.switch'); values.layout = args.name; },
  };
  const api = new Function('host', 'pure', `const {${Object.keys(host).join(',')}} = host;
    const {newGlassState,reconcileGlass,glassCanBlur} = pure;
    ${source}; return {setGlass, disableAllGlass, glassEnabled, startGlass};`)(host, pure);
  return { api, files, values, current, signal: value => { signal = value; },
    root: () => JSON.parse(files.get(`/app/layouts/${values.layout}.json`)),
    edit: edit => { const root = JSON.parse(files.get(`/app/layouts/${values.layout}.json`)); edit(root); files.set(`/app/layouts/${values.layout}.json`, JSON.stringify(root)); },
  };
}

test('Glass is opt-in, round trips through persisted state, and preserves custom colors and layout', async () => {
  const original = { id: 'root', window_blur: false, terminal_opacity: 0.9, theme: { light: 'paper', dark: 'ink' }, colors: { surface: '#123456', accent: '#654321' }, children: [{ content: { mod: 'tabs' } }] };
  const f = fixture('Handlr', original);
  assert.equal(f.api.glassEnabled(), false);
  await f.api.setGlass(true);
  assert.equal(f.api.glassEnabled(), true);
  assert.equal(f.root().window_blur, true);
  assert.equal(f.root().terminal_opacity, 1);
  assert.equal(f.root().colors.surface, '#123456cc');
  assert.deepEqual(f.root().theme, original.theme);
  assert.deepEqual(f.root().children, original.children);
  // The state and root have crossed JSON file boundaries before restoration.
  await f.api.setGlass(false);
  assert.deepEqual(f.root(), original);
});

test('independent edits and deletions survive material refresh, appearance changes and disabling', async () => {
  const f = fixture();
  await f.api.setGlass(true);
  f.edit(root => { root.colors.surface = '#998877'; delete root.colors.chrome; root.colors.accent = '#334455'; root.children.push({ id: 'new-panel' }); root.terminal_opacity = 0.8; });
  f.current.dark = false;
  await f.api.setGlass(true);
  assert.equal(f.root().colors.background, '#ffffff66');
  assert.equal(f.root().colors.surface, '#998877');
  assert.equal(f.root().colors.chrome, undefined);
  await f.api.setGlass(false);
  assert.deepEqual(f.root().colors, { surface: '#998877', accent: '#334455' });
  assert.equal(f.root().terminal_opacity, 0.8);
  assert.equal(f.root().children.at(-1).id, 'new-panel');
});

test('reduced transparency and failed native queries select opaque material', async () => {
  for (const result of [{ code: 0, stdout: 'reduced' }, { code: 1, stdout: '' }, { code: 0, stdout: 'unknown' }]) {
    const f = fixture(); f.signal(result);
    await f.api.setGlass(true);
    assert.equal(f.root().window_blur, false);
    for (const key of ['background', 'canvas', 'chrome', 'surface', 'popover', 'raised']) assert.match(f.root().colors[key], /ff$/);
    f.signal({ code: 0, stdout: 'blur' });
    await f.api.setGlass(true);
    assert.equal(f.root().window_blur, true);
    await f.api.setGlass(false);
    assert.equal(f.root().window_blur, undefined);
  }
  assert.equal(pure.glassCanBlur('linux', { code: 0, stdout: 'blur' }), false);
});

test('bundled layouts are cloned rather than rewritten', async () => {
  const f = fixture('main');
  const shipped = f.files.get('/app/layouts/main.json');
  await f.api.setGlass(true);
  assert.equal(f.values.layout, 'main-glass');
  assert.equal(f.files.get('/app/layouts/main.json'), shipped);
  assert.deepEqual(f.root().theme, { light: 'light', dark: 'dark' });
  await f.api.setGlass(false);
  assert.equal(f.files.get('/app/layouts/main.json'), shipped);
});

test('Seamless transition restores every layout before capturing personal color overrides', async () => {
  const f = fixture();
  await f.api.setGlass(true);
  f.values.layout = 'second';
  f.files.set('/app/layouts/second.json', JSON.stringify({ id: 'second' }));
  await f.api.setGlass(true);
  await f.api.disableAllGlass();
  assert.deepEqual(JSON.parse(f.files.get('/app/glass.json')).layouts, {});
  assert.deepEqual(JSON.parse(f.files.get('/app/layouts/second.json')), { id: 'second' });
  assert.equal(JSON.parse(f.files.get('/app/layouts/Handlr.json')).colors, undefined);
});

test('a pending journal recovers either side of an interrupted layout write', () => {
  const root = { id: 'root', colors: { surface: '#123456' } };
  const planned = pure.reconcileGlass(root, pure.newGlassState(root), palette, {}, true);
  for (const current of [root, planned.root]) {
    const recovered = pure.reconcileGlass(current, JSON.parse(JSON.stringify(planned.state)), palette, {}, true);
    assert.deepEqual(recovered.state.protected, {});
    recovered.state.enabled = false;
    assert.deepEqual(pure.reconcileGlass(recovered.root, recovered.state, palette, {}, false).root, root);
  }
});

test('invalid state is not overwritten', async () => {
  const f = fixture();
  f.files.set('/app/glass.json', '{');
  await assert.rejects(f.api.setGlass(true));
  assert.equal(f.files.get('/app/glass.json'), '{');
});

test('guard failure leaves a recoverable journal and preserves the concurrent edit', async () => {
  const f = fixture();
  const originalSet = f.files.set.bind(f.files);
  let conflict = true;
  f.files.set = (path, value) => {
    originalSet(path, value);
    if (path === '/app/glass.json' && conflict && JSON.parse(value).layouts.Handlr?.pending) {
      conflict = false;
      originalSet('/app/layouts/Handlr.json', JSON.stringify({ id: 'root', colors: { background: '#123456' } }));
    }
    return f.files;
  };
  await assert.rejects(f.api.setGlass(true));
  assert.equal(f.root().colors.background, '#123456');
  await f.api.setGlass(false);
  assert.equal(f.root().colors.background, '#123456');
});

test('layout names matching object prototype properties retain their own restoration state', async () => {
  const f = fixture('__proto__');
  await f.api.setGlass(true);
  await f.api.setGlass(false);
  assert.equal(f.root().colors, undefined);
});

test('manual blur disable selects opaque fills and survives disabling Glass', async () => {
  const f = fixture();
  await f.api.setGlass(true);
  f.edit(root => { root.window_blur = false; });
  await f.api.setGlass(true);
  assert.equal(f.root().colors.background, '#17191dff');
  await f.api.setGlass(false);
  assert.equal(f.root().window_blur, false);
});

test('controller copies remain synchronized across the mod module sandbox', async () => {
  for (const file of ['glass.js', 'glass-state.js']) {
    assert.equal(await readFile(new URL(`../../defaults/frame/settings/${file}`, import.meta.url), 'utf8'),
      await readFile(new URL(`../../defaults/mods/tabs/${file}`, import.meta.url), 'utf8'), 'run node handlr/scripts/sync-glass.mjs');
  }
});

test('Settings transitions restore Seamless before Glass captures its baseline', async () => {
  const text = (await readFile(new URL('../../defaults/frame/settings/main.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '').replace('export default class Settings', 'class Settings');
  const events = [];
  let enabled = false;
  const { Settings, toggleSeamless } = new Function('View', 'window', 'setGlass', 'disableAllGlass', 'glassEnabled', 'notify',
    text + '; return {Settings,toggleSeamless};')(
    class {}, () => ({ platform: 'macos' }), async value => { events.push(['glass', value]); enabled = value; },
    async () => { events.push(['restore-all']); enabled = false; }, () => enabled, value => { throw new Error(value.body); });
  const view = new Settings();
  view.person = { colors: { chrome: '#123456', surface: '#654321', accent: '#abcdef' } };
  const original = structuredClone(view.person);
  toggleSeamless(view.person);
  view.save = async edit => { edit(view.person); events.push(['saved', structuredClone(view.person)]); return null; };
  let pending;
  const cx = { spawn: task => { pending = task(cx); }, notify() {} };
  view.appearancePreset(true, cx); await pending;
  assert.deepEqual(view.person, original);
  assert.deepEqual(events.at(-1), ['glass', true]);
  view.appearancePreset(false, cx); await pending;
  assert.equal(enabled, false);
  assert.equal(view.person.seamless, true);
  assert.deepEqual(events.at(-2), ['restore-all']);
  toggleSeamless(view.person);
  assert.deepEqual(view.person, original);
});
