import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../../defaults/frame/palette/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export default class Palette', 'class Palette');

test('Create Tab Group chooses two panels before submitting one transaction', () => {
  const calls = [], closed = [];
  const Palette = new Function('View', 'run', 'closeOverlay', 'props', 'localStorage', `${source}; return Palette;`)(
    class {}, (name, args) => calls.push({ name, args }), id => closed.push(id), () => ({ overlay: 'palette' }), { setItem() {} });
  const palette = new Palette();
  palette.recent = []; palette.input = { set_value() {}, focus() {} };
  const cx = { notify() {} };
  const transaction = { expected_revision: 4, commands: [{ op: 'move_section', section_id: 'files', view_id: 'new-tab', index: 0 }] };
  palette.go({ choices: [{ name: 'workspace.apply', args: {}, title: 'Files', group: 'Choose first panel', choices: [
    { name: 'workspace.apply', args: { transaction }, title: 'Changes', group: 'Choose second panel' },
  ] }] }, cx);
  assert.equal(palette.rows()[0].e.title, 'Files');
  assert.equal(calls.length, 0); assert.equal(closed.length, 0);
  palette.go(palette.rows()[0].e, cx);
  assert.equal(palette.rows()[0].e.title, 'Changes');
  assert.equal(calls.length, 0); assert.equal(closed.length, 0);
  palette.go(palette.rows()[0].e, cx);
  assert.deepEqual(calls, [{ name: 'workspace.apply', args: { transaction } }]);
  assert.deepEqual(closed, ['palette']);
});
