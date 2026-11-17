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
    const {newGlassState,reconcileGlass,glassCanBlur,glassBackgroundValue} = pure;
    ${source}; return {setGlass, setGlassBackground, glassBackground, disableAllGlass, glassEnabled, startGlass};`)(host, pure);
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
  assert.equal(f.root().terminal_opacity, 0);
  assert.equal(f.root().colors.surface, '#12345624');
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
  assert.equal(f.root().colors.background, '#ffffff6d');
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
    assert.equal(f.root().terminal_opacity, 1);
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

test('explicit Glass reset restores every layout without touching personal color overrides', async () => {
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

test('Settings toggles Glass and Seamless independently and immediately refreshes their combination', async () => {
  const text = (await readFile(new URL('../../defaults/frame/settings/main.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '').replace('export default class Settings', 'class Settings');
  const events = [];
  let enabled = false;
  const { Settings, toggleSeamless } = new Function('View', 'window', 'setGlass', 'glassEnabled', 'notify',
    text + '; return {Settings,toggleSeamless};')(
    class {}, () => ({ platform: 'macos' }), async value => { events.push(['glass', value]); enabled = value; },
    () => enabled, value => { throw new Error(value.body); });
  const view = new Settings();
  view.person = { colors: { chrome: '#123456', surface: '#654321', accent: '#abcdef' } };
  const original = structuredClone(view.person);
  toggleSeamless(view.person);
  view.save = async edit => { edit(view.person); return null; };
  let pending;
  const cx = { spawn: task => { pending = task(cx); }, notify() {} };
  view.appearancePreset(true, cx); await pending;
  assert.equal(enabled, true);
  assert.equal(view.person.seamless, true, 'Glass must not disable Seamless');
  view.appearancePreset(false, cx); await pending;
  assert.equal(enabled, true, 'Seamless must not disable Glass');
  assert.deepEqual(view.person, original);
  assert.deepEqual(events.at(-1), ['glass', true], 'refresh material after changing Seamless');
  view.appearancePreset(false, cx); await pending;
  view.appearancePreset(true, cx); await pending;
  assert.equal(enabled, false);
  assert.equal(view.person.seamless, true, 'disabling Glass keeps Seamless on');
  view.appearancePreset(false, cx); await pending;
  assert.deepEqual(view.person, original);
});

// Match the actual stacked paint path, rather than checking each alpha alone.
test('all resting panes retain visible glass through stacked backgrounds', () => {
  for (const [background, strength] of ['#17191d', '#ffffff'].flatMap(background => [0, 100].map(strength => [background, strength]))) {
    const colors = { ...palette, background, border: '#00000017' };
    const root = { id: 'terminals', content: { pane: { background: 'background' } } };
    const { root: glass } = pure.reconcileGlass(root, { ...pure.newGlassState(root), background: strength }, colors, {}, true);
    const opacity = color => parseInt(color.slice(-2), 16) / 255;
    const stacked = layers => 1 - layers.reduce((left, alpha) => left * (1 - alpha), 1);
    const base = [opacity(glass.colors.background), opacity(glass.colors.canvas), opacity(glass.colors.canvas)];
    const panel = stacked([...base, opacity(glass.colors.surface), opacity(glass.colors.surface), opacity(glass.colors.background)]);
    const terminal = stacked([...base, opacity(glass.content.pane.background), glass.terminal_opacity, glass.terminal_opacity]);
    assert.ok(panel < .82, 'nested panel backgrounds must remain translucent');
    assert.ok(terminal < .75, 'resting terminal backgrounds must remain translucent');
    assert.equal(glass.content.pane.background, glass.colors.background.slice(0, 7) + '4d');
    assert.equal(glass.colors.border, colors.border);
    assert.equal(glass.colors.foreground, undefined, 'text stays under theme control');
  }
});

test('floating terminal cards restore authored looks and retain independent edits', async () => {
  const original = { id: 'root', children: [
    { id: 'tabs', content: { mod: 'tabs' } },
    { id: 'terminal', content: { pane: { radius: 7, shadow: 'sm', background: 'background' } } },
  ] };
  const f = fixture('Handlr', original);
  await f.api.setGlass(true);
  assert.equal(f.root().children[1].content.pane.shadow, 'sm');
  assert.equal(f.root().children[1].content.pane.radius, 12);
  await f.api.setGlass(true);
  await f.api.setGlass(false);
  assert.deepEqual(f.root(), original);
  await f.api.setGlass(true);
  f.edit(root => { root.children[1].content.pane.shadow = 'lg'; });
  await f.api.setGlass(false);
  assert.equal(f.root().children[1].content.pane.shadow, 'lg');
  assert.equal(f.root().children[1].content.pane.radius, 7);
});

test('opaque fallback removes glass shadows and disabling restores absent card fields', async () => {
  const original = { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } }, { id: 'terminal', content: { pane: {} } }] };
  const f = fixture('Handlr', original);
  await f.api.setGlass(true);
  f.signal({ code: 0, stdout: 'reduced' });
  await f.api.setGlass(true);
  assert.equal(f.root().children[1].content.pane.shadow, undefined);
  f.signal({ code: 0, stdout: 'blur' });
  await f.api.setGlass(true);
  assert.equal(f.root().children[1].content.pane.shadow, 'sm');
  await f.api.setGlass(false);
  assert.deepEqual(f.root(), original);
});

test('material adapts smoke and terminal tint to the theme without changing text colors', () => {
  const dark = pure.glassMaterial(palette, true);
  const light = pure.glassMaterial({ ...palette, background: '#ffffff', surface: '#ffffff' }, true);
  assert.ok(parseInt(dark.background.slice(-2), 16) < 130, 'dark backdrop must remain glass rather than a dense smoke layer');
  assert.equal(light.background, '#ffffff6d');
  assert.equal(dark.background.slice(0, 7), '#2e3034', 'lift the dark terminal above black');
  assert.equal(light.terminal_opacity, dark.terminal_opacity, 'all resting terminals use the same light fill');
  assert.equal(dark.border, palette.border);
});

test('card journal recovers either side of an interrupted write without losing authored looks', () => {
  const original = { id: 'terminal', content: { pane: { radius: 8 } } };
  const planned = pure.reconcileGlass(original, pure.newGlassState(original), palette, {}, true);
  for (const current of [original, planned.root]) {
    const recovered = pure.reconcileGlass(current, JSON.parse(JSON.stringify(planned.state)), palette, {}, true);
    const disabled = { ...recovered.state, enabled: false, pending: false };
    const restored = pure.reconcileGlass(recovered.root, disabled, palette, {}, true);
    assert.deepEqual(restored.root, original);
  }
});

test('glass pane backgrounds restore authored fills and retain independent edits', async () => {
  const original = { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } },
    { id: 'terminal', content: { pane: { background: '#112233', radius: 8 } } }] };
  const f = fixture('Handlr', original);
  await f.api.setGlass(true);
  assert.equal(f.root().children[1].content.pane.background, '#2e30344d');
  await f.api.setGlass(false);
  assert.deepEqual(f.root(), original);
  await f.api.setGlass(true);
  f.edit(root => { root.children[1].content.pane.background = '#33445566'; });
  await f.api.setGlass(false);
  assert.equal(f.root().children[1].content.pane.background, '#33445566');
});

test('Glass journals a denser focus fill while every resting terminal stays translucent', async () => {
  const original = { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } },
    { id: 'terminal', content: { pane: { background: '#112233', focus_background: '#abcdef99' } } }] };
  const f = fixture('Handlr', original);
  await f.api.setGlass(true);
  const pane = () => f.root().children[1].content.pane;
  assert.equal(pane().background, '#2e30344d');
  assert.equal(pane().focus_background, '#2e30345e');
  assert.equal(f.root().terminal_opacity, 0);
  f.current.dark = false;
  await f.api.setGlass(true);
  assert.equal(pane().focus_background, '#ffffff5e');
  f.signal({ code: 0, stdout: 'reduced' });
  await f.api.setGlass(true);
  assert.equal(pane().focus_background, original.children[1].content.pane.focus_background);
  await f.api.setGlass(false);
  assert.deepEqual(f.root(), original);
});

test('independent focused-fill edits survive disabling Glass', async () => {
  const f = fixture('Handlr', { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } },
    { id: 'terminal', content: { pane: {} } }] });
  await f.api.setGlass(true);
  f.edit(root => { root.children[1].content.pane.focus_background = '#11223388'; });
  await f.api.setGlass(false);
  assert.equal(f.root().children[1].content.pane.focus_background, '#11223388');
});

test('combined presets clear panel layers and outlines while keeping floating terminal cards', () => {
  const original = { id: 'terminals', content: { pane: { background: 'background', shadow: 'lg' } } };
  const initial = pure.newGlassState(original);
  const glass = pure.reconcileGlass(original, initial, palette, {}, true);
  glass.state.pending = false;
  const combined = pure.reconcileGlass(glass.root, glass.state, palette, { chrome: '#00000000', surface: '#00000000', border: '#00000000' }, true, true);
  for (const key of ['chrome', 'surface', 'border']) assert.equal(combined.root.colors[key], '#00000000');
  assert.equal(combined.root.content.pane.shadow, 'sm');
  assert.equal(combined.root.content.pane.background, '#2e30344d');
  assert.equal(combined.root.content.pane.focus_background, '#2e30345e');
  assert.equal(combined.root.window_blur, true);
  combined.state.pending = false;
  const back = pure.reconcileGlass(combined.root, combined.state, palette, {}, true, false);
  assert.deepEqual(back.root, glass.root, 'turning Seamless off restores Glass without recapturing its own styling');
  back.state.enabled = false; back.state.pending = false;
  assert.deepEqual(pure.reconcileGlass(back.root, back.state, palette, {}, false).root, original);
});

test('Glass can start alongside Seamless and disable without changing Seamless settings', async () => {
  const f = fixture();
  const person = { seamless: true, seamless_colors: { surface: '#112233' }, colors: { chrome:'#00000000', surface:'#00000000', border:'#00000000' } };
  f.files.set('/app/settings.json', JSON.stringify(person));
  await f.api.setGlass(true);
  assert.equal(f.root().colors.surface, '#00000000');
  await f.api.setGlass(false);
  assert.deepEqual(JSON.parse(f.files.get('/app/settings.json')), person);
  assert.equal(f.root().colors, undefined);
});

test('combined mode preserves independent edits and selects opaque accessibility fallback', () => {
  const original = { id: 'terminal', content: { pane: {} } };
  const glass = pure.reconcileGlass(original, pure.newGlassState(original), palette, {}, true, true);
  glass.root.colors.surface = '#123456';
  glass.state.pending = false;
  const reduced = pure.reconcileGlass(glass.root, glass.state, palette, {}, false, true);
  assert.equal(reduced.root.colors.surface, '#123456');
  assert.equal(reduced.root.colors.background, '#17191dff');
  assert.equal(reduced.root.window_blur, false);
  assert.equal(reduced.root.terminal_opacity, 1);
  assert.equal(reduced.root.content.pane.focus_background, undefined);
});


test('background strength defaults to resting-terminal frost and spans the former backdrop', () => {
  for (const background of ['#17191d', '#ffffff']) {
    const colors = { ...palette, background };
    const low = pure.glassMaterial(colors, true, 0);
    const high = pure.glassMaterial(colors, true);
    const opacity = color => parseInt(color.slice(-2), 16) / 255;
    const resting = 1 - (1 - opacity(low.background)) * (1 - .14) * .9 * .9;
    assert.ok(Math.abs(opacity(high.background) - resting) < .004);
    assert.ok(opacity(pure.glassMaterial(colors, true, 50).background) > opacity(low.background));
    assert.deepEqual(pure.glassMaterial(colors, false, 0), pure.glassMaterial(colors, false, 100));
    assert.equal(pure.glassBackgroundValue(-10), 0);
    assert.equal(pure.glassBackgroundValue(200), 100);
    assert.equal(pure.glassBackgroundValue(null), 100);
  }
});

test('background slider persists per layout through refresh, Seamless, and restores original colors', async () => {
  const f = fixture();
  await f.api.setGlass(true);
  const denser = f.root().colors.background;
  await f.api.setGlassBackground(0);
  assert.equal(f.api.glassBackground(), 0);
  assert.equal(f.root().colors.background, '#2e30343d');
  await f.api.setGlass(true);
  assert.equal(f.api.glassBackground(), 0);
  f.files.set('/app/settings.json', JSON.stringify({ seamless: true }));
  await f.api.setGlassBackground(100);
  assert.equal(f.root().colors.background, denser);
  assert.equal(f.root().colors.surface, '#00000000');
  await f.api.setGlass(false);
  assert.equal(f.root().colors, undefined);
});


test('resting and focused glass cards own their rounded fill without rectangular terminal backgrounds', () => {
  for (const seamless of [false, true]) {
    const original = { id: 'terminal', content: { pane: {} } };
    const { root } = pure.reconcileGlass(original, pure.newGlassState(original), palette, {}, true, seamless);
    const pane = root.content.pane;
    assert.equal(root.terminal_opacity, 0, 'both rectangular terminal background passes are transparent');
    assert.equal(pane.radius, 12);
    assert.equal(pane.shadow, 'sm', 'resting cards float even in Seamless');
    assert.equal(pane.background, '#2e30344d');
    assert.equal(pane.focus_background, '#2e30345e');
  }
});
