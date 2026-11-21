import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../mods/pane/main.js', import.meta.url), 'utf8');
function header(frame, focused) {
  const calls = [];
  const element = () => {
    const el = new Proxy({}, { get(_target, key) { return (...args) => {
      calls.push([key, ...args]);
      if (key === 'when' && args[0]) args[1](el);
      return el;
    }; } });
    return el;
  };
  const values = { View: class {}, div: element, h_flex: element,
    panes: () => [{ pane: 'p', focused, title: 'Terminal' }], props: () => ({ pane: 'p' }),
    theme: () => ({}), home: () => '/home', layout: () => ({ content: { tab: 'active', pane: frame } }) };
  const names = [...source.matchAll(/^import \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  const Pane = new Function(...names, source.replace(/^import .*;\n/gm, '').replace('export default class Pane', 'return class Pane'))(...names.map(n => values[n] ?? (() => undefined)));
  const pane = new Pane(); pane.init(); pane.render();
  return calls;
}

test('header fill follows the inner frame corners and rounds only the outer edge', () => {
  for (const [focused, expected] of [[false, 10], [true, 11]]) {
    const frame = { radius: 12, border: { width: 2 }, focus: { width: 1 }, header: { position: 'top' } };
    const top = header(frame, focused);
    assert.ok(top.some(([key, value]) => key === 'rounded_t' && value === expected));
    assert.ok(!top.some(([key]) => key === 'rounded_b'));
    const bottom = header({ ...frame, header: { position: 'bottom' } }, focused);
    assert.ok(bottom.some(([key, value]) => key === 'rounded_b' && value === expected));
    assert.ok(!bottom.some(([key]) => key === 'rounded_t'));
  }
  assert.ok(header({ radius: 1, border: { width: 2 } }, false).some(([key, value]) => key === 'rounded_t' && value === 0));
});
