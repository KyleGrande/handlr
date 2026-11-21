import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readMods, modCommand, modPanels } from '../../mods/frame/settings/mods.js';

const execute = promisify(execFile);
const source = await readFile(new URL('../../mods/frame/settings/main.js', import.meta.url), 'utf8');

test('inventory reads actual installed entry points, treats paths as data, and isolates bad manifests', async () => {
  const base = await mkdtemp(join(tmpdir(), 'handlr-mods-'));
  const home = join(base, "app ' $(touch SHOULD_NOT_EXIST)");
  try {
    for (const name of ['rigs', 'custom panel', 'broken', '.hidden', 'unfinished']) {
      await mkdir(join(home, 'mods', name), { recursive: true });
      if (name !== 'unfinished') await writeFile(join(home, 'mods', name, 'main.js'), '');
    }
    await writeFile(join(home, 'mods/rigs/mod.json'), JSON.stringify({ title: 'Rigs', workspace_header: true }));
    await writeFile(join(home, 'mods/custom panel/mod.json'), JSON.stringify({ title: 'Custom panel', overlay: {} }));
    await writeFile(join(home, 'mods/broken/mod.json'), '{');
    await writeFile(join(home, 'installed.json'), JSON.stringify({ rigs: {} }));
    await writeFile(join(home, 'mod-ownership.json'), JSON.stringify({ rigs: { user_owned: true, pending: true } }));
    const list = await readMods({ home, platform: 'macos',
      exec: async (command, args, options) => ({ code: 0, ...await execute(command, args, { timeout: options.timeout, cwd: base }) }),
      readTextFile: async path => { try { return await readFile(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    });
    assert.deepEqual(list.map(mod => mod.id), ['rigs', 'broken', 'custom panel']);
    assert.deepEqual([list[0].kind, list[0].pending, list[0].panel, list[0].openable], ['Customized', true, true, true]);
    assert.equal(list[1].openable, false);
    assert.ok(list[1].error);
    assert.equal(list[2].kind, 'Personal');
    await assert.rejects(readFile(join(base, 'SHOULD_NOT_EXIST')), { code: 'ENOENT' });
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('failed discovery and unreadable ownership do not become empty or healthy lists', async () => {
  const io = { home: '/app', platform: 'linux', exec: async () => ({ code: 1, stderr: 'offline' }), readTextFile: async () => null };
  await assert.rejects(readMods(io), /offline/);
  await assert.rejects(readMods({ ...io, exec: async () => ({ code: 0, stdout: 'files\0' }), readTextFile: async () => '[]' }), /JSON object/);
});

function harness() {
  let inventory = [{ id: 'context', panel: true, openable: true }];
  const calls = [];
  let workspace = 'Handlr';
  let controlError = null;
  let inspectHook = () => {};
  const snapshot = { revision: 7, document: { panels: {
    a: { id: 'a', content: { kind: 'mod', name: 'context' } },
    b: { id: 'b', content: { kind: 'mod', name: 'context' } },
    c: { id: 'c', content: { kind: 'mod', name: 'rigs' } },
  }, groups: [{ views: [{ sections: [{ panel_id: 'a' }, { panel_id: 'b' }, { panel_id: 'c' }] }] }] } };
  const pending = [];
  const cx = { notify() {}, spawn(fn) { pending.push(fn(cx)); } };
  const values = { View: class {}, window: () => ({ platform: 'macos' }), appHome: () => '/app',
    readMods: async () => { if (inventory instanceof Error) throw inventory; return inventory; },
    modPanels, modCommand: async (_exec, name, args) => {
      calls.push(['control', name, args]);
      if (name === 'workspace.inspect') { inspectHook(); return structuredClone(snapshot); }
      if (controlError) throw controlError;
      if (name === 'workspace.apply') for (const group of snapshot.document.groups) for (const view of group.views) {
        view.sections = view.sections.filter(section => !args.transaction.commands.some(command => command.panel_id === section.panel_id));
      }
      return {};
    },
    layout: () => ({ workspace }), props: () => ({ overlay: 'settings' }),
    run: (...args) => calls.push(['run', ...args]), closeOverlay: id => calls.push(['close', id]) };
  const names = [...source.matchAll(/^import \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  const Settings = new Function(...names, source.replace(/^import .*;\n/gm, '').replace('export default class Settings', 'return class Settings'))(...names.map(n => values[n] ?? (() => undefined)));
  const view = new Settings();
  return { view, calls, cx, snapshot, flush: () => Promise.all(pending.splice(0)),
    failControl: value => { controlError = value; }, inspectHook: fn => { inspectHook = fn; },
    inventory: value => { inventory = value; }, workspace: value => { workspace = value; } };
}

test('refresh preserves the last successful mod list after failure and recovers without actions', async () => {
  const h = harness();
  await h.view.loadMods();
  const previous = h.view.modList;
  h.inventory(new Error('Core is unavailable'));
  await h.view.loadMods();
  assert.equal(h.view.modList, previous);
  assert.match(h.view.modError, /Core is unavailable/);
  assert.equal(h.view.modLoading, false);
  h.inventory([]);
  await h.view.loadMods();
  assert.equal(h.view.modError, null);
  assert.deepEqual(h.view.modList, []);
  assert.ok(h.calls.every(call => call[0] === 'control' && call[1] === 'workspace.inspect'));
});

test('Disable hides every open instance at the fresh revision, retaining unrelated panels and registered identities', async () => {
  const h = harness();
  await h.view.loadModWorkspace();
  h.snapshot.revision = 9;
  h.view.setModEnabled({ id: 'context', panel: true }, false, h.cx);
  await h.flush();
  const apply = h.calls.find(call => call[1] === 'workspace.apply');
  assert.deepEqual(apply[2], { transaction: { expected_revision: 9, commands: [{ op: 'hide_panel', panel_id: 'a' }, { op: 'hide_panel', panel_id: 'b' }] } });
  assert.deepEqual(modPanels(h.snapshot.document, 'context'), []);
  assert.deepEqual(modPanels(h.snapshot.document, 'rigs'), ['c']);
  assert.deepEqual(Object.keys(h.snapshot.document.panels), ['a', 'b', 'c']);
  assert.equal(h.view.modBusy, false);
});

test('Enable reuses workspace.open; revision conflicts preserve actual membership and report failure', async () => {
  const h = harness();
  await h.view.loadModWorkspace();
  h.view.setModEnabled({ id: 'context', panel: true }, true, h.cx);
  await h.flush();
  assert.ok(h.calls.some(call => call[1] === 'workspace.open' && call[2].name === 'context'));
  h.failControl(new Error('workspace revision conflict'));
  h.view.setModEnabled({ id: 'context', panel: true }, false, h.cx);
  await h.flush();
  assert.match(h.view.modWorkspaceError, /revision conflict/);
  assert.deepEqual(modPanels(h.view.modWorkspace.document, 'context'), ['a', 'b']);
});

test('switching workspace during inspection cancels a pending toggle', async () => {
  const h = harness();
  await h.view.loadModWorkspace();
  h.inspectHook(() => h.workspace('another-workspace'));
  h.view.setModEnabled({ id: 'context', panel: true }, false, h.cx);
  await h.flush();
  assert.ok(!h.calls.some(call => call[1] === 'workspace.apply'));
  assert.match(h.view.modWorkspaceError, /workspace changed/);
});

test('workspace commands pass JSON as an argv value and surface host rejection', async () => {
  const calls = [];
  const exec = async (...args) => { calls.push(args); return { code: 0, stdout: '{"revision":1}' }; };
  await modCommand(exec, 'workspace.open', { name: "a ' $(touch unwanted)" });
  assert.deepEqual(calls[0][1], ['do', 'workspace.open', '{"name":"a \' $(touch unwanted)"}']);
  await assert.rejects(modCommand(async () => ({ code: 0, stdout: '{"error":"stale revision"}' }), 'workspace.inspect'), /stale revision/);
});

test('Open docks panels in a workspace and uses overlays elsewhere; layout components stay inert', () => {
  const h = harness();
  h.view.openMod({ id: 'context', panel: true, openable: true });
  assert.deepEqual(h.calls.splice(0), [['close', 'settings'], ['run', 'workspace.open', { name: 'context' }]]);
  h.workspace(null);
  h.view.openMod({ id: 'context', panel: true, openable: true });
  assert.deepEqual(h.calls.splice(0), [['close', 'settings'], ['run', 'mod.open', { name: 'context' }]]);
  h.view.openMod({ id: 'tabs', openable: false });
  assert.deepEqual(h.calls, []);
});
