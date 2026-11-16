import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { capture, compose } from '../../defaults/mods/layouts/library.js';
import { LibraryStore } from '../../defaults/mods/layouts/store.js';

const source = (await readFile(new URL('../../defaults/mods/layouts/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export default class Layouts', 'return class Layouts');
const document = JSON.parse(await readFile(new URL('../prototype/workspaces/panel-workspace-native.json', import.meta.url), 'utf8'));

async function panel() {
  let current = { document: structuredClone(document), revision: 0, space: 'space-a', workspace: 'work' };
  let name = 'Work', navigate = false;
  const files = new Map();
  const values = { View: class {}, capture, compose, LibraryStore, appHome: () => '/fixture',
    readTextFile: async () => { if (navigate) current.space = 'space-b'; return '{}'; },
    workspaceCommand: async (command, args) => {
      if (command === 'workspace.inspect') return structuredClone(current);
      assert.equal(command, 'workspace.import');
      if (args.expected_space !== current.space || args.expected_workspace !== current.workspace || args.expected_revision !== current.revision) throw new Error('Active space or revision changed');
      current.document = structuredClone(args.document); current.revision++;
      return structuredClone(current);
    },
  };
  const Layouts = new Function(...Object.keys(values), source)(...Object.values(values));
  const view = new Layouts(); view.name = { value: () => name };
  view.store = new LibraryStore('library', async path => files.get(path) ?? null, async (path, text, expected) => {
    assert.equal(files.get(path) ?? null, expected); files.set(path, text);
  });
  await view.store.load();
  return { view, current: () => current, name: value => { name = value; }, navigate: () => { navigate = true; } };
}

test('panel save/apply/update/delete flow preserves independent working arrangements', async () => {
  const f = await panel();
  await f.view.edit('save', 'preset');
  const saved = structuredClone(f.view.store.library.presets[0]);
  const originalExtent = f.current().document.zones[0].extent;
  f.current().document.zones[0].extent = 850;
  assert.equal(f.view.store.library.presets[0].snapshot.zones[0].extent, originalExtent);
  await f.view.apply(saved);
  assert.equal(f.current().document.zones[0].extent, originalExtent);
  f.current().document.zones[0].extent = 900;
  await f.view.edit('update', 'preset');
  assert.equal(f.view.store.library.presets[0].snapshot.zones[0].extent, 900);
  const before = structuredClone(f.current().document);
  await f.view.edit('delete', 'preset');
  assert.deepEqual(f.current().document, before);
  assert.equal(f.view.store.library.presets.length, 0);
});

test('navigation while checking mod availability rejects a stale preset apply', async () => {
  const f = await panel();
  await f.view.edit('save', 'preset');
  const before = structuredClone(f.current().document);
  f.navigate();
  await assert.rejects(f.view.apply(f.view.store.library.presets[0]), /space or revision changed/);
  assert.deepEqual(f.current().document, before);
  assert.equal(f.current().space, 'space-b');
});
