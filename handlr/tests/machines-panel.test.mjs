import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../mods/machines/main.js', import.meta.url), 'utf8');

function harness() {
  const nodes = [], calls = [], pending = [];
  const data = { layouts: [{ name: null, layout: 'ready' }], spaces: [], terminals: [] };
  let result = { code: 0, stdout: '{"machines":[]}' };
  let asks = 0;
  const element = () => {
    const node = { content: [] };
    const el = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'id') target.id = args[0];
        if (key === 'on_click') target.click = args[0];
        if (key === 'child') target.content.push(args[0]);
        if (key === 'children') target.content.push(...args[0]);
        if (key === 'when' && args[0]) args[1](el);
        return el;
      };
    }});
    nodes.push(node);
    return el;
  };
  const cx = { notify() {}, timer: { every() {} }, spawn(fn) { pending.push(fn(cx)); } };
  const values = {
    View: class {}, div: element, svg: element, v_flex: element, h_flex: element,
    theme: () => ({}), machines: () => data.layouts, spaces: () => data.spaces,
    terminals: () => data.terminals, run: (...args) => calls.push(args),
    hc: async args => { assert.deepEqual(args, ['machine', 'ls', '--json']); asks++; return result; },
  };
  const names = [...source.matchAll(/^import \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  const Machines = new Function(...names, source.replace(/^import .*;\n/gm, '').replace('export default class Machines', 'return class Machines'))(...names.map(n => values[n]));
  const view = new Machines();
  view.init(null, cx);
  return { view, data, nodes, calls, cx, asks: () => asks, result: r => { result = r; }, flush: () => Promise.all(pending.splice(0)) };
}

test('refresh excludes temporary machines, retains last good data after failure, and recovers', async () => {
  const h = harness();
  h.view.refresh(h.cx);
  assert.equal(h.asks(), 1, 'overlapping requests are suppressed');
  await h.flush();
  h.result({ code: 0, stdout: JSON.stringify({ machines: [{ name: 'server' }, { name: 'sandbox', temporary: true }] }) });
  h.view.refresh(h.cx);
  await h.flush();
  assert.deepEqual(h.view.list.map(m => m.name), ['server']);
  for (const result of [{ code: 1, stderr: 'offline' }, { code: 0, stdout: '{}' }, { code: 0, stdout: '{invalid' }]) {
    h.result(result);
    h.view.refresh(h.cx);
    await h.flush();
    assert.ok(h.view.error);
    assert.equal(h.view.loading, false);
    assert.deepEqual(h.view.list.map(m => m.name), ['server']);
    h.view.render();
  }
  h.result({ code: 0, stdout: '{"machines":[]}' });
  h.view.refresh(h.cx);
  await h.flush();
  assert.equal(h.view.error, null);
  assert.deepEqual(h.view.list, []);
});

test('counts separate local and similarly named remote machines and include undocked terminals', async () => {
  const h = harness();
  await h.flush();
  h.view.list = [{ name: 'build' }, { name: 'build.prod' }];
  h.data.spaces = [{ id: 's1', machine: null }, { id: 'build/s2', machine: 'build' }];
  h.data.terminals = ['t1', 'build/t2', 'build.prod/t3', 'build.prod/t4', 'temporary/t5'].map(address => ({ address }));
  assert.deepEqual(h.view.rows().map(m => [m.name, m.spaces.length, m.terminals]), [[null, 1, 1], ['build', 1, 1], ['build.prod', 0, 2]]);
});

test('space actions use exact remote identity and unavailable layouts disable navigation', async () => {
  const h = harness();
  await h.flush();
  h.view.list = [{ name: 'build', state: 'connected' }];
  h.data.layouts.push({ name: 'build', layout: 'ready' });
  h.data.spaces.push({ id: 'build/s1', machine: 'build', name: 'Deploy', active: true });
  h.view.render();
  h.nodes.find(n => n.id === 'machine-1-space-0').click();
  h.nodes.find(n => n.id === 'machine-new-1').click();
  h.nodes.find(n => n.id === 'machines-add').click();
  h.nodes.find(n => n.id === 'machines-settings').click();
  assert.deepEqual(h.calls, [
    ['space.select', { id: 'build/s1' }], ['space.new', { machine: 'build' }],
    ['mod.open', { name: 'machine-add' }], ['app.settings', { section: 'machines' }],
  ]);
  h.nodes.find(n => n.id === 'machine-1').click(null, h.cx);
  h.nodes.length = 0;
  h.view.render();
  assert.equal(h.nodes.some(n => n.id === 'machine-1-space-0'), false);
  h.nodes.find(n => n.id === 'machine-1').click(null, h.cx);
  h.data.layouts[1].layout = 'unavailable';
  h.nodes.length = 0;
  h.view.render();
  assert.equal(h.nodes.find(n => n.id === 'machine-1-space-0').click, undefined);
  assert.equal(h.nodes.some(n => n.id === 'machine-new-1'), false);
});
