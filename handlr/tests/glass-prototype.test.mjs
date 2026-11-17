import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { materialTheme, paper, preparePrototype, prototypeLayout } from '../scripts/glass-prototype.mjs';

test('material variants preserve palette and text colors while adapting glass tint', () => {
  for (const background of ['#17191d', '#ffffff']) {
    const palette = { ...paper, background, colors: { foreground: '#112233', accent: '#456789', border: '#12345678' } };
    const original = structuredClone(palette);
    for (const glass of [true, false]) {
      const theme = materialTheme(palette, glass);
      for (const key of ['background', 'foreground', 'selection', 'cursor', 'ansi']) assert.deepEqual(theme[key], palette[key]);
      for (const key of ['foreground', 'accent', 'border']) assert.equal(theme.colors[key], palette.colors[key]);
      if (!glass || background === '#ffffff') assert.equal(theme.colors.background.slice(0, 7), background);
      else assert.equal(theme.colors.background.slice(0, 7), '#2e3034');
      assert.equal(theme.colors.background.slice(-2), glass ? (background === '#ffffff' ? 'df' : '78') : 'ff');
      for (const key of ['popover', 'raised']) assert.match(theme.colors[key], /ff$/);
    }
    assert.deepEqual(palette, original);
  }
});

test('invalid palettes and layout-owned looks fail instead of silently replacing them', () => {
  for (const invalid of [{ ...paper, background: 'red' }, { ...paper, ansi: [] }, { ...paper, colors: { surface: 'red' } }]) {
    assert.throws(() => materialTheme(invalid, true));
  }
  for (const layout of [{ colors: {} }, { children: [{ theme: 'ink' }] }, { terminal_opacity: 0.5 }]) {
    assert.throws(() => prototypeLayout(layout, 'glass'), /without/);
  }
});

test('personal variants leave the original layout intact and give terminals translucent backgrounds', () => {
  const layout = { id: 'root', children: [{ content: { pane: { background: 'background' } } }] };
  const original = structuredClone(layout);
  const glass = prototypeLayout(layout, 'glass');
  assert.equal(glass.window_blur, true);
  assert.equal(glass.terminal_opacity, 0);
  assert.equal(glass.children[0].content.pane.background, 'glass-rest');
  assert.equal(prototypeLayout(layout, 'opaque').window_blur, false);
  assert.deepEqual(layout, original);
});

test('each run isolates app and Core data, starts opaque and gates glass to macOS', async () => {
  const created = [];
  try {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const result = await preparePrototype({ platform });
      assert.ok(!created.includes(result.home));
      created.push(result.home);
      const read = async file => JSON.parse(await readFile(join(result.home, file), 'utf8'));
      assert.equal((await read('shared.json')).layout, 'glass-study-opaque');
      assert.equal((await read('settings.json')).core_session, 'own');
      const workspace = await read('workspaces/Handlr.json');
      assert.equal((await read('layouts/glass-study-opaque.json')).workspace, 'Handlr');
      for (const group of workspace.groups) {
        assert.ok(group.views.some(view => view.id === group.active_view_id));
        for (const view of group.views) for (const section of view.sections) assert.ok(workspace.panels[section.panel_id]);
      }
      assert.deepEqual(Object.values(workspace.panels).map(panel => panel.content.name).sort(), ['agents', 'changes', 'files', 'spaces']);
      for (const key of ['HERDR_APP_HOME', 'HC_SOCKET', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME', 'XDG_RUNTIME_DIR']) {
        assert.ok(result.env[key].startsWith(result.home));
      }
      assert.equal((await read('layouts/glass-study-opaque.json')).window_blur, false);
      if (platform === 'darwin') assert.equal((await read('layouts/glass-study-glass.json')).window_blur, true);
      else await assert.rejects(read('layouts/glass-study-glass.json'), { code: 'ENOENT' });
    }
  } finally {
    for (const home of created) await rm(home, { recursive: true, force: true });
  }
});
