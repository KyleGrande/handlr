import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../../defaults/mods/tabs/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export default class Tabs', 'class Tabs');

function fixture() {
  const calls = [], store = {}, sharedStore = {};
  let name = 'workspace-a';
  let root = { id: '@workspace/root', children: ['left', 'right', 'top', 'bottom', 'top_center', 'bottom_center'].map(edge => ({
    id: `@workspace/zone/${edge}`, hidden: edge === 'right', size: { px: 280 }, children: [{ id: `${edge}-panel`, content: { mod: 'files' } }],
  })) };
  const find = (node, id) => node.id === id ? node : node.children?.map(n => find(n, id)).find(Boolean);
  const values = {
    View: class {}, shared: key => key === 'layout' ? name : sharedStore[key], setShared: (key, value) => { sharedStore[key] = structuredClone(value); },
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
    run(command, args) {
      // Match the host contract: unknown arguments throw before a request is queued.
      if (command === 'pane.focus') {
        assert.ok(Object.keys(args).every(key => ['pane', 'terminal'].includes(key)), 'pane.focus accepts pane or terminal, not id');
        assert.ok(args.pane || args.terminal);
      }
      calls.push([command, args]);
      if (command === 'layout.hide' || command === 'layout.show') find(root, args.id).hidden = command === 'layout.hide';
    },
    spaces: () => [{ active: true, tabs: [{ id: 'active-tab', active: true }] }],
    panes: () => [{ tab: 'other-tab', pane: 'other', terminal: 'one' }, { tab: 'active-tab', pane: 'active', terminal: 'two' }],
  };
  const DockVisibility = new Function(...Object.keys(values), `${source}; return DockVisibility;`)(...Object.values(values));
  return { root, calls, store, create: () => new DockVisibility(), switch: value => { name = value; }, reproject() { root = structuredClone(root); for (const node of root.children) node.hidden = false; this.root = root; } };
}

test('terminal-only restores the exact prior visibility, sizes and panel identities', () => {
  const f = fixture(), control = f.create(), before = structuredClone(f.root);
  control.terminalOnly(f.root);
  assert.ok(f.root.children.every(n => n.hidden));
  assert.deepEqual(f.calls.at(-1), ['pane.focus', { pane: 'active' }]);
  control.terminalOnly(f.root);
  assert.deepEqual(f.root, before);
  assert.ok(f.calls.every(([command]) => ['layout.hide', 'layout.show', 'pane.focus'].includes(command)));
});

test('top and bottom toggles include full-width and center-only docks', () => {
  const f = fixture(), control = f.create();
  for (const edge of ['top', 'bottom']) {
    control.toggle(f.root, edge);
    assert.deepEqual(f.calls.slice(-2).map(([, args]) => args.id), [`@workspace/zone/${edge}`, `@workspace/zone/${edge}_center`]);
    assert.ok(f.calls.slice(-2).every(([command]) => command === 'layout.hide'));
    control.toggle(f.root, edge);
    assert.ok(f.calls.slice(-2).every(([command]) => command === 'layout.show'));
  }
});

test('visibility and restore snapshot survive reloads and workspace reprojection', () => {
  const f = fixture(), before = structuredClone(f.root);
  f.create().terminalOnly(f.root);
  f.reproject();
  const restoredControl = f.create();
  restoredControl.sync(f.root);
  assert.ok(f.root.children.every(n => n.hidden));
  restoredControl.terminalOnly(f.root);
  assert.deepEqual(f.root, before);
});

test('a workspace has independent visibility and empty docks are not offered', () => {
  const f = fixture(), control = f.create();
  control.toggle(f.root, 'left');
  f.switch('workspace-b'); f.reproject();
  control.sync(f.root);
  assert.equal(f.root.children[0].hidden, false);
  f.root.children[0].children = [];
  assert.equal(control.docks(f.root).find(d => d.edge === 'left').nodes.length, 0);
  f.root.children[0].children = [{ id: 'new-panel' }];
  f.switch('workspace-a'); control.sync(f.root);
  assert.equal(f.root.children[0].hidden, true);
});

test('an individual side toggle leaves terminal-only mode and malformed storage recovers', () => {
  const f = fixture();
  f.store['dock-visibility'] = 'broken';
  const control = f.create();
  control.terminalOnly(f.root);
  control.toggle(f.root, 'left');
  assert.equal(control.state(f.root).restore, null);
  assert.equal(f.root.children[0].hidden, false);
  assert.equal(f.root.children[1].hidden, true);
});

test('legacy sidebar and panel remain reversible without native workspace zones', () => {
  const f = fixture(), control = f.create();
  const root = { id: 'root', children: [{ id: 'sidebar', children: [{}] }, { id: 'panel', hidden: true, children: [{}] }] };
  const docks = control.docks(root);
  assert.deepEqual(docks.filter(d => d.nodes.length).map(d => d.edge), ['left', 'right']);
  assert.deepEqual(docks.find(d => d.edge === 'left').nodes.map(n => n.id), ['sidebar']);
});

test('titlebar and fullscreen controls share the restore snapshot', () => {
  const f = fixture(), before = structuredClone(f.root);
  const titlebar = f.create(), fullscreen = f.create();
  titlebar.terminalOnly(f.root);
  assert.ok(fullscreen.state(f.root).restore);
  fullscreen.terminalOnly(f.root);
  assert.deepEqual(f.root, before);
  assert.equal(titlebar.state(f.root).restore, null);
});

test('native visibility migrates once, then lets Open Panel reveal its dock', () => {
  const f = fixture();
  f.store['dock-visibility'] = JSON.stringify({ 'workspace-a': { hidden: { '@workspace/zone/left': true }, restore: null } });
  const control = f.create();
  control.sync(f.root);
  assert.equal(f.root.children[0].hidden, true, 'saved visibility migrates through layout.hide');
  assert.equal(control.state(f.root).workspaceVisibility, true);
  f.calls.length = 0;
  // Native workspace.open reveals the dock in its own transaction.
  f.root.children[0].hidden = false;
  f.create().sync(f.root);
  assert.equal(f.root.children[0].hidden, false);
  assert.deepEqual(f.calls, [], 'neither copy may re-hide an explicitly opened panel');
});

test('native workspace updates do not replay old visibility commands', () => {
  const f = fixture(), control = f.create();
  control.sync(f.root);
  control.toggle(f.root, 'left');
  const before = structuredClone(f.root);
  f.calls.length = 0;
  control.sync(f.root);
  f.create().sync(f.root);
  assert.deepEqual(f.root, before);
  assert.deepEqual(f.calls, []);
});
