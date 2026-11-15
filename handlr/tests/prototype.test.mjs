import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collapseActions, find } from '../prototype/mods/workspace-prototype/actions.js';

const fresh = async () => JSON.parse(await readFile(new URL('../prototype/layouts/panel-workspace-prototype.json', import.meta.url)));
function apply(root, commands) {
  for (const [name, args] of commands) {
    const node = find(root, args.id);
    assert.ok(node, args.id);
    if (name === 'layout.resize') node.size = 'weight' in args ? { weight: args.weight } : { px: args.px };
    else if (name === 'layout.hide') node.hidden = true;
    else if (name === 'layout.show') node.hidden = false;
    else assert.fail(`Unexpected command ${name}`);
  }
}

test('layout IDs are unique; every selected view is a direct member', async () => {
  const root = await fresh(), seen = new Set();
  function visit(node) {
    assert.ok(node.id);
    assert.ok(!seen.has(node.id), node.id);
    seen.add(node.id);
    if (node.type === 'stack') assert.ok(node.children.some(child => child.id === node.active));
    for (const child of node.children ?? []) visit(child);
  }
  visit(root);
});

test('native layout uses the shipped terminal center and a matching workspace document', async () => {
  const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
  const native = await load('../prototype/layouts/panel-workspace-native.json');
  const main = await load('../../defaults/layouts/main.json');
  const document = await load(`../prototype/workspaces/${native.workspace}.json`);
  assert.equal(document.version, 1);
  const expectedTabs = structuredClone(main.children[1].children[0]);
  expectedTabs.id = '@workspace/tabs';
  const expectedBody = structuredClone(main.children[1].children[1]);
  expectedBody.id = '@workspace/terminal-body';
  expectedBody.children = [expectedBody.children[0]];
  expectedBody.children[0].id = '@workspace/active-tab';
  assert.deepEqual(native.children, [expectedTabs, expectedBody]);
  assert.deepEqual(native.terminal_padding, main.terminal_padding);
  const preview = await readFile(new URL(`../prototype/${native.preview}`, import.meta.url), 'utf8');
  assert.match(preview, /<svg\b/);
});

test('stable zones are outside the center tab and have independent stacks', async () => {
  const root = await fresh();
  assert.deepEqual(root.children.map(n => n.id), ['prototype-left', 'prototype-center', 'prototype-right']);
  for (const side of [root.children[0], root.children[2]]) {
    assert.equal(side.children.length, 2);
    assert.ok(side.children.every(group => group.type === 'stack'));
  }
  assert.equal(find(root, 'prototype-active-tab').content.tab, 'active');
  assert.deepEqual(find(root, 'prototype-code').children.map(n => n.id), ['prototype-changes', 'prototype-files']);
});

test('collapse saves a user-resized weight, leaves other regions untouched, and restores it', async () => {
  const root = await fresh();
  const neighbors = JSON.stringify([root.children[1], root.children[2], find(root, 'prototype-navigation-group')]);
  const section = find(root, 'prototype-files');
  section.size = { weight: 3.75 };
  const collapse = collapseActions(root, section.id, 'prototype-files-body', null);
  assert.deepEqual(collapse.preferred, { weight: 3.75 });
  apply(root, collapse.commands);
  assert.equal(find(root, 'prototype-files-body').hidden, true);
  assert.deepEqual(section.size, { px: 28 });
  const expand = collapseActions(root, section.id, 'prototype-files-body', collapse.preferred);
  apply(root, expand.commands);
  assert.deepEqual(section.size, { weight: 3.75 });
  assert.equal(find(root, 'prototype-files-body').hidden, false);
  assert.equal(JSON.stringify([root.children[1], root.children[2], find(root, 'prototype-navigation-group')]), neighbors);
});

test('all Code sections can collapse and restore after a serialized restart', async () => {
  let root = await fresh();
  const preferred = {};
  for (const id of ['prototype-changes', 'prototype-files']) {
    const change = collapseActions(root, id, `${id}-body`, null);
    preferred[id] = change.preferred;
    apply(root, change.commands);
  }
  root = JSON.parse(JSON.stringify(root));
  for (const id of Object.keys(preferred)) {
    assert.deepEqual(find(root, id).size, { px: 28 });
    apply(root, collapseActions(root, id, `${id}-body`, preferred[id]).commands);
    assert.deepEqual(find(root, id).size, preferred[id]);
  }
});

test('invalid destinations leave the input unchanged', async () => {
  const root = await fresh(), before = JSON.stringify(root);
  assert.equal(collapseActions(root, 'missing', 'prototype-files-body', null), null);
  assert.equal(collapseActions(root, 'prototype-context', 'prototype-files-body', null), null);
  assert.equal(JSON.stringify(root), before);
});

test('corrupt saved sizes fall back to a usable positive weight', async () => {
  const root = await fresh();
  apply(root, collapseActions(root, 'prototype-files', 'prototype-files-body', null).commands);
  for (const bad of [null, {}, { weight: -1 }, { px: 0 }, { weight: NaN }]) {
    const change = collapseActions(root, 'prototype-files', 'prototype-files-body', bad);
    assert.deepEqual(change.preferred, { weight: 1 });
  }
});

test('collapsing preserves mod identity and props', async () => {
  const root = await fresh(), body = find(root, 'prototype-context-body');
  const before = JSON.stringify(body);
  const change = collapseActions(root, 'prototype-context', body.id, null);
  apply(root, change.commands);
  apply(root, collapseActions(root, 'prototype-context', body.id, change.preferred).commands);
  const { hidden, ...restored } = body;
  assert.equal(hidden, false);
  assert.equal(JSON.stringify(restored), before);
});
