import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../mods/frame/settings/main.js', import.meta.url), 'utf8');
function harness(raw) {
  const nodes = [];
  const element = () => {
    const node = { children: [] };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'id') target.id = args[0];
        if (key === 'on_click') target.click = args[0];
        if (key === 'child') target.children.push(args[0]);
        if (key === 'when' && args[0]) args[1](proxy);
        return proxy;
      };
    }});
    nodes.push(node);
    return proxy;
  };
  let disk = raw;
  const values = {
    View: class {}, window: () => ({ platform: 'macos' }),
    div: element, v_flex: element, h_flex: element,
    appHome: () => '/handlr',
    readTextFile: async () => disk,
    writeTextFile: async (_path, text, expected) => { assert.equal(disk, expected); disk = text; },
  };
  const names = [...source.matchAll(/^import \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  const Settings = new Function(...names, source.replace(/^import .*;\n/gm, '').replace('export default class Settings', 'return class Settings'))(...names.map(n => values[n] ?? (() => {})));
  const view = new Settings();
  view.person = JSON.parse(raw);
  return { view, nodes, disk: () => JSON.parse(disk) };
}

for (const [before, after] of [[undefined, 'shared'], ['shared', 'own'], ['own', 'shared']]) {
  test(`session switch persists ${before ?? 'default'} → ${after} and preserves layout preferences`, async () => {
    const h = harness(JSON.stringify({ font_size: 17, ...(before ? { core_session: before } : {}) }));
    h.view.coreSession({});
    let pending;
    h.nodes.find(n => n.id === 'st-core-session').click(null, {
      spawn: fn => { pending = fn({ notify() {} }); },
    });
    await pending;
    assert.deepEqual(h.disk(), { font_size: 17, core_session: after });
    const text = h.nodes.flatMap(n => n.children).filter(v => typeof v === 'string').join('\n');
    assert.match(text, /Quit and reopen Handlr/);
    assert.match(text, /add Handlr’s separate session as a machine in Herdr/);
    assert.match(text, /Running terminals and agents stay alive/);
  });
}
