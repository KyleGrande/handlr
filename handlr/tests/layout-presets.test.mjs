import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, compose, emptyLibrary, editLibrary, validateSnapshot, presetName } from '../../mods/layouts/library.js';
import { LibraryStore } from '../../mods/layouts/store.js';

function workspace() {
  return {
    version: 1,
    panels: {
      files: { id: 'files', content: { kind: 'mod', name: 'files', props: { draft: 'local' } },
        binding: { kind: 'pinned', machine_id: 'machine-1', checkout_id: 'space-1' }, storage_namespace: 'files-data' },
    },
    groups: [{ id: 'group', active_view_id: 'view', views: [{ id: 'view', title: 'Files', sections: [
      { id: 'section', panel_id: 'files', collapsed: false, weight: 1, min_extent: 72 },
    ] }] }],
    zones: ['left', 'right', 'top', 'bottom'].map(edge => ({ edge, extent: 320, hidden: edge !== 'left', groups: edge === 'left' ? [{ group_id: 'group', weight: 1 }] : [] })),
    floating: [], focused_panel_id: 'files', maximized_group_id: 'group', theme: 'local-theme',
  };
}

test('snapshot contains composition without panel data, bindings, theme or terminal ownership', () => {
  const doc = workspace(), snapshot = capture(doc);
  assert.deepEqual(snapshot.panels, [{ id: 'files', mod: 'files' }]);
  assert.deepEqual(snapshot.groups, doc.groups);
  for (const value of ['local', 'space-1', 'files-data', 'local-theme']) assert.ok(!JSON.stringify(snapshot).includes(value));
  doc.groups[0].views[0].title = 'Changed';
  assert.equal(snapshot.groups[0].views[0].title, 'Files');
});

test('two applied working copies evolve independently and preserve their own data and bindings', () => {
  const snapshot = capture(workspace());
  const a = workspace(), b = workspace();
  b.panels.files.binding.checkout_id = 'space-2'; b.panels.files.content.props.draft = 'other';
  const first = compose(snapshot, a), second = compose(snapshot, b);
  first.zones[0].extent = 900;
  assert.equal(second.zones[0].extent, 320);
  assert.equal(snapshot.zones[0].extent, 320);
  assert.deepEqual(first.panels, a.panels); assert.deepEqual(second.panels, b.panels);
  assert.equal(first.theme, 'local-theme');
  assert.equal(first.focused_panel_id, null); assert.ok(!Object.hasOwn(first, 'maximized_group_id'));
});

test('applying keeps hidden panel records and data even when absent from the preset', () => {
  const doc = workspace(), snapshot = capture(doc);
  doc.panels.notes = { id: 'notes', content: { kind: 'mod', name: 'notes', props: { draft: 'keep' } } };
  assert.deepEqual(compose(snapshot, doc).panels.notes, doc.panels.notes);
});

test('missing or reassigned panels fail without touching current composition', () => {
  const doc = workspace(), snapshot = capture(doc);
  doc.panels.files.content.name = 'notes';
  const before = structuredClone(doc);
  assert.throws(() => compose(snapshot, doc), /unavailable/);
  assert.deepEqual(doc, before);
  delete doc.panels.files;
  assert.throws(() => compose(snapshot, doc), /unavailable/);
});

test('retained hidden panel identities cannot be reused by preset containers', () => {
  const doc = workspace(), snapshot = capture(doc);
  doc.panels.group = { id: 'group', content: { kind: 'mod', name: 'notes' } };
  assert.throws(() => compose(snapshot, doc), /identity conflicts/);
});

test('terminals fail explicitly; close history is excluded from reusable composition', () => {
  const doc = workspace(); doc.panels.files.content = { kind: 'terminal', address: 't1', machine_id: 'm1' };
  assert.throws(() => capture(doc), /Terminal panels/);
  const closed = workspace(); closed.closed_panels = { files: {} };
  assert.equal(Object.hasOwn(capture(closed), 'closed_panels'), false);
});

for (const [label, damage] of [
  ['version', s => { s.version = 99; }],
  ['unknown data', s => { s.panels[0].props = { secret: true }; }],
  ['duplicate identity', s => { s.groups[0].id = 'files'; }],
  ['missing panel', s => { s.groups[0].views[0].sections[0].panel_id = 'absent'; }],
  ['selected view', s => { s.groups[0].active_view_id = 'absent'; }],
  ['nonfinite dimensions', s => { s.zones[0].extent = Infinity; }],
  ['missing zone', s => { s.zones.pop(); }],
  ['duplicate zone', s => { s.zones.push(structuredClone(s.zones[0])); }],
  ['unplaced group', s => { s.zones[0].groups = []; }],
  ['double placement', s => { s.floating.push({ group_id: 'group', x: 0, y: 0, width: 500, height: 500 }); }],
]) test(`reject malformed snapshot: ${label}`, () => {
  const snapshot = capture(workspace()); damage(snapshot);
  assert.throws(() => validateSnapshot(snapshot));
});

test('save, rename, duplicate, update and delete remain explicit immutable transactions', () => {
  const original = emptyLibrary(), snapshot = capture(workspace());
  const saved = editLibrary(original, 0, { op: 'save', id: 'one', name: ' Coding ', snapshot });
  assert.equal(original.presets.length, 0); assert.equal(saved.presets[0].name, 'Coding');
  const renamed = editLibrary(saved, 1, { op: 'rename', id: 'one', name: 'Work' });
  const duplicated = editLibrary(renamed, 2, { op: 'duplicate', id: 'one', newId: 'two', name: 'Review' });
  const changed = structuredClone(snapshot); changed.zones[0].extent = 500;
  const updated = editLibrary(duplicated, 3, { op: 'update', id: 'one', snapshot: changed });
  assert.equal(updated.presets[1].snapshot.zones[0].extent, 320);
  assert.equal(duplicated.presets[0].snapshot.zones[0].extent, 320);
  const working = compose(updated.presets[0].snapshot, workspace());
  const deleted = editLibrary(updated, 4, { op: 'delete', id: 'one' });
  assert.equal(deleted.presets.length, 1); assert.equal(working.zones[0].extent, 500);
  assert.equal(JSON.parse(JSON.stringify(updated)).presets[0].snapshot.zones[0].extent, 500);
});

test('revision conflicts, collisions and invalid updates leave the library unchanged', () => {
  const saved = editLibrary(emptyLibrary(), 0, { op: 'save', id: 'one', name: 'Work', snapshot: capture(workspace()) });
  const before = structuredClone(saved);
  assert.throws(() => editLibrary(saved, 0, { op: 'delete', id: 'one' }), /changed/);
  assert.throws(() => editLibrary(saved, 1, { op: 'duplicate', id: 'one', newId: 'two', name: 'WORK' }), /already has/);
  assert.throws(() => editLibrary(saved, 1, { op: 'update', id: 'one', snapshot: {} }), /version/);
  assert.deepEqual(saved, before);
});

test('names reject blank, multiline and oversized labels', () => {
  for (const name of ['', ' ', 'a\nb', 'a\tb', 'x'.repeat(121), null]) assert.throws(() => presetName(name));
  assert.equal(presetName('  Work  '), 'Work');
});

function storage() {
  const files = new Map(); let fail = null;
  return { files, fail: path => { fail = path; }, create: () => new LibraryStore('presets',
    async path => files.get(path) ?? null,
    async (path, value, expected) => {
      if (path === fail) throw new Error('disk full');
      assert.equal(files.get(path) ?? null, expected, 'concurrent edit');
      files.set(path, value);
    }) };
}

test('failed primary write leaves the published library unchanged and a recoverable backup', async () => {
  const disk = storage(), store = disk.create(); await store.load();
  disk.fail('presets');
  await assert.rejects(store.edit({ op:'save', id:'one', name:'Work', snapshot:capture(workspace()) }), /disk full/);
  assert.equal(store.library.revision, 0);
  assert.equal(JSON.parse(disk.files.get('presets.last-good')).revision, 0);
  disk.files.set('presets', 'partial write');
  const reopened = disk.create(); await reopened.load();
  assert.equal(reopened.library.revision, 0); assert.match(reopened.warning, /Recovered/);
});

test('two panel copies cannot overwrite a concurrent library edit', async () => {
  const disk = storage(), first = disk.create(), second = disk.create();
  await first.load(); await second.load();
  await first.edit({ op:'save', id:'one', name:'Work', snapshot:capture(workspace()) });
  await assert.rejects(second.edit({ op:'save', id:'two', name:'Other', snapshot:capture(workspace()) }), /concurrent edit/);
  assert.equal(JSON.parse(disk.files.get('presets')).presets[0].id, 'one');
  assert.equal(second.library.revision, 0);
});

test('malformed primary and backup are preserved rather than replaced by an empty library', async () => {
  const disk = storage(); disk.files.set('presets', 'broken'); disk.files.set('presets.last-good', 'broken');
  const store = disk.create(); await assert.rejects(store.load(), /Repair/);
  assert.equal(store.library, undefined); assert.equal(disk.files.get('presets'), 'broken');
});
