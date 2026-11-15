import test from 'node:test';
import assert from 'node:assert/strict';
import { integrate, consolidate, mergePanelDrafts } from '../scripts/integration.mjs';

test('integration retains Rigs, pane styling, panel sizing, menus and existing buttons', () => {
  const tree = { id: 'root', theme: 'custom', children: [
    { id: 'rigs', content: { mod: 'rigs', props: { nodeId: 'rigs' } }, size: { weight: 1.7 } },
    { id: 'tabs', content: { mod: 'tabs', props: { custom: true } } },
    { id: 'main', content: { tab: 'active', pane: { gap: 17, header: { height: 31 } } } },
    { id: 'panel', hidden: true, size: { px: 464 }, children: [{ id: 'panel-body', type: 'stack', active: 'changes', children: [
      { id: 'files', content: { mod: 'files' } }, { id: 'changes', content: { mod: 'changes' } },
    ] }] },
  ] };
  const source = 'menu unchanged\nconst enabled = shared("workspace.panels") ?? ["files", "changes"];\n files changes\n      .when(w?.buttons, windows)';
  const declarations = [{ name: 'context', button: { label: 'Context', icon: 'context.svg' } }];
  const result = integrate(tree, source, declarations);
  assert.deepEqual(tree.children[1].content.mod, 'tabs');
  assert.deepEqual(result.layout.children[0], tree.children[0]);
  assert.deepEqual(result.layout.children[2], tree.children[2]);
  assert.deepEqual(result.layout.children[1].content, { mod: 'context-tabs', props: { custom: true } });
  const panel = result.layout.children[3]; assert.equal(panel.size.px, 464); assert.equal(panel.hidden, true);
  assert.equal(panel.children[0].active, 'changes'); assert.equal(panel.children[0].children.length, 3);
  assert.ok(result.source.includes('menu unchanged')); assert.ok(result.source.includes('files changes'));
  assert.ok(result.source.includes('.child(panelButton("context"'));
  assert.throws(() => integrate(tree, 'incompatible', declarations));
});

test('consolidating two installed panels changes only Context children/buttons and preserves active panel choice', () => {
  const base = { id: 'root', children: [{ id: 'tabs', content: { mod: 'tabs' } }, { id: 'panel', size: { px: 464 }, children: [{ id: 'panel-body', type: 'stack', active: 'files', children: [{ id: 'files' }, { id: 'changes' }] }] }] };
  const source = 'const enabled = shared("workspace.panels") ?? ["files", "changes"];\n      .when(w?.buttons, rest)';
  const old = integrate(base, source, ['notes', 'tags'].map(n => ({ name: `context-${n}`, button: { label: n === 'notes' ? 'Notes' : 'Tags', icon: `${n}.svg` } })));
  old.layout.children[1].children[0].active = 'context-tags';
  const result = consolidate(old.layout, old.source);
  const body = result.layout.children[1].children[0];
  assert.deepEqual(body.children.map(c => c.id), ['files', 'changes', 'context']);
  assert.equal(body.active, 'context'); assert.equal(result.layout.children[1].size.px, 464);
  assert.equal((result.source.match(/child\(panelButton/g) ?? []).length, 1);
  assert.ok(result.source.includes('"Context", "mods/context/context.svg"'));
  assert.throws(() => consolidate(result.layout, result.source));
});
test('combining old views retains note/tag drafts, preserves stale revision checks and keeps originals', () => {
  const a = { record: { revision: 1 }, patch: { notes: 'unfinished text' }, generation: 2 };
  const b = { record: { revision: 2 }, patch: { tags: ['pending'] }, generation: 4 };
  const notes = { 'drafts-v1': JSON.stringify([['owner', a]]) };
  const tags = { 'drafts-v1': JSON.stringify([['owner', b]]), 'pending-tags-v1': '{"owner":"unfinished tag"}' };
  const merged = mergePanelDrafts(notes, tags), draft = JSON.parse(merged['drafts-v1'])[0][1];
  assert.deepEqual(draft.patch, { notes: 'unfinished text', tags: ['pending'] });
  assert.equal(draft.record.revision, 1); assert.equal(merged['pending-tags-v1'], tags['pending-tags-v1']);
  assert.deepEqual(JSON.parse(merged['legacy-panel-drafts-v1']), { notes, tags });
});
