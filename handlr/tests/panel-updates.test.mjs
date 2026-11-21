import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../../mods/frame/mod-updates/main.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export default class PanelUpdates', 'class PanelUpdates');

function fixture(appText = 'app update') {
  const calls = [], writes = [], closed = [], tasks = [];
  const update = { name: 'files', files: ['main.js'], version: 'app-hash', user_version: 'user-hash' };
  const EditorState = { new(options) {
    let text = options.value; const events = {};
    return { options, value: () => text, on: (name, fn) => { events[name] = fn; },
      set_value(value) { text = value; events.change?.({}, cx); }, release() {} };
  } };
  const cx = { notify() {}, focus_handle: () => ({ focus() {} }), spawn(fn) { tasks.push(fn(cx)); } };
  const Review = new Function('View', 'EditorState', 'props', 'settings', 'appHome', 'readTextFile', 'writeTextFile', 'run', 'closeOverlay', `${source}; return PanelUpdates;`)(
    class {}, EditorState, () => ({ overlay: 'updates', updates: [update] }), () => ({}), () => '/home',
    async path => path.includes('/app-provided/') ? appText : 'user code',
    async (...args) => { writes.push(args); }, (...args) => calls.push(args), id => closed.push(id));
  const review = new Review(); review.init({}, cx);
  return { review, cx, calls, writes, closed, update, settle: () => Promise.all(tasks) };
}

test('review edits only the user version with a concurrent-write guard', async () => {
  const f = fixture(); await f.settle();
  assert.equal(f.review.app.options.readonly, true);
  f.review.user.set_value('merged code');
  f.review.resolve('keep', f.cx); assert.equal(f.calls.length, 0);
  f.review.close(f.cx); assert.equal(f.closed.length, 0);
  f.review.save(f.cx); await f.settle();
  assert.deepEqual(f.writes, [['/home/mods/files/main.js', 'merged code', 'user code']]);
  assert.equal(f.review.dirty, false);
  assert.equal(f.review.app.value(), 'app update');
  f.review.resolve('keep', f.cx);
  assert.deepEqual(f.calls, [['mod.update', { name: 'files', action: 'keep', version: 'app-hash', user_version: 'user-hash' }]]);
});

test('using the update sends both version guards and closing does not resolve it', async () => {
  const f = fixture(); await f.settle();
  f.review.close(f.cx); assert.deepEqual(f.closed, ['updates']); assert.equal(f.calls.length, 0);
  f.review.resolve('use', f.cx);
  assert.deepEqual(f.calls, [['mod.update', { name: 'files', action: 'use', version: 'app-hash', user_version: 'user-hash' }]]);
  assert.equal(f.writes.length, 0);
});

test('binary updates stay available without an editable text preview', async () => {
  const f = fixture('binary\0data'); await f.settle();
  assert.match(f.review.note, /Binary files/);
  assert.equal(f.review.user, null); assert.equal(f.review.app, null);
  assert.equal(f.calls.length, 0);
});
