import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../defaults/frame/settings/main.js', import.meta.url), 'utf8');
test('all three sliders coalesce changed values for their captured layout without saving untouched defaults', async () => {
  const timers = [], tasks = [], writes = [];
  let name = 'Handlr';
  let dark = false;
  const values = {
    View: class {}, window: () => ({ platform: 'macos' }), props: () => ({ section: 'look' }), startGlass() {},
    settings: () => ({ dark }), shared: () => name, glassBackground: () => 10, glassFrost: () => 20, glassTerminal: () => 90,
    InputState: { new: () => ({ on() {} }) },
    SliderState: { new: ({ value }) => { let changed; return { value: () => value, on(_event, callback) { changed = callback; }, change(next, cx) { value = next; changed(next, cx); } }; } },
    setGlassFinish: async (values, layout) => writes.push({ values, layout }),
  };
  const names = [...source.matchAll(/^import \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  const Settings = new Function(...names, source.replace(/^import .*;\n/gm, '').replace('export default class Settings', 'return class Settings'))(...names.map(n => values[n] ?? (() => undefined)));
  const cx = { focus_handle: () => ({ focus() {} }), notify() {}, spawn(fn) { tasks.push(fn(cx)); }, timer: { every() {}, after(_delay, callback) { timers.push(callback); } } };
  const view = new Settings(); view.load = async () => {}; view.init({}, cx);
  assert.deepEqual(Object.keys(view.glassSliders), ['background', 'frost', 'terminal']);
  view.glassSliders.background.change(42, cx);
  view.glassSliders.frost.change(60, cx);
  view.glassSliders.terminal.change(35, cx);
  name = 'another-layout';
  view.glassSliders.terminal.change(15, cx);
  for (const callback of timers.splice(0)) callback(cx);
  await Promise.all(tasks.splice(0));
  assert.deepEqual(writes.splice(0), [
    { layout: 'Handlr', values: { background: 42, frost: 60, terminal_light: 35 } },
    { layout: 'another-layout', values: { terminal_light: 15 } },
  ]);
  view.glassSliders.background.change(10, cx);
  for (const callback of timers.splice(0)) callback(cx);
  await Promise.all(tasks.splice(0));
  assert.deepEqual(writes, [{ layout: 'another-layout', values: { background: 10 } }]);
  writes.length = 0;
  dark = true; view.glassSliders.terminal.change(60, cx);
  dark = false; view.glassSliders.terminal.change(25, cx);
  for (const callback of timers.splice(0)) callback(cx);
  await Promise.all(tasks.splice(0));
  assert.deepEqual(writes, [{ layout: 'another-layout', values: { terminal_dark: 60, terminal_light: 25 } }]);
});
