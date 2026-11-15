import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { integrate, consolidate, mergePanelDrafts } from './integration.mjs';

const arg = process.argv.slice(2);
if (arg.length !== 2 || arg[0] !== '--layout' || !/^[a-zA-Z0-9_-]+$/.test(arg[1])) throw new Error('Usage: npm run prepare-install -- --layout PERSONAL_LAYOUT');
const app = resolve(process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app'));
const runtime = join(homedir(), '.local/share/herdr-context');
let home = resolve(process.env.CONTEXT_HOME || join(homedir(), '.local/state/herdr-context'));
const launcher = join(homedir(), '.local/bin/herdr-context');
const layoutPath = join(app, 'layouts', `${arg[1]}.json`);
const installed = JSON.parse(await readFile(join(app, 'installed.json'), 'utf8'));
if (`layout:${arg[1]}` in installed) throw new Error('Refusing to edit a shipped layout. Clone it first.');
const original = await readFile(layoutPath, 'utf8'), layout = JSON.parse(original);
function find(n, id) { if (n.id === id) return n; for (const c of n.children ?? []) { const f = find(c, id); if (f) return f; } }
const sourceMod = find(layout, 'tabs')?.content?.mod;
if (!sourceMod || !/^[a-zA-Z0-9_-]+$/.test(sourceMod)) throw new Error('No compatible current tab bar.');
const tabFile = join(app, 'mods', sourceMod, 'main.js');
const tabSource = await readFile(tabFile, 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
let previous;
if (sourceMod === 'context-tabs') {
  previous = JSON.parse(await readFile(join(runtime, 'install.json'), 'utf8'));
  if (previous.app !== app || previous.layoutPath !== layoutPath) throw new Error('Installation does not own this layout.');
  for (const f of previous.files) if (hash(await readFile(f.path)) !== f.hash) throw new Error(`Managed file changed: ${f.path}. Reconcile it first.`);
  home = resolve(process.env.CONTEXT_HOME || previous.home);
}
const declarations = [];
for (const name of ['context']) {
  const { button } = JSON.parse(await readFile(`build/mods/${name}/mod.json`, 'utf8'));
  declarations.push({ name, button });
}
declarations.sort((a, b) => a.button.order - b.button.order);
const integrated = previous ? consolidate(layout, tabSource) : integrate(layout, tabSource, declarations);
const writes = [];
const guards = [{ path: tabFile, hash: hash(tabSource) }];
async function add(path, content, mode = 0o600, existingAllowed = false) {
  let old = null;
  try { old = await readFile(path, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const managed = previous?.files.find(f => f.path === path);
  if (old !== null && !existingAllowed && (!managed || managed.hash !== hash(old))) throw new Error(`Destination already exists: ${path}. Use sync for a managed install.`);
  writes.push({ path, content, mode, expected: old === null ? null : hash(old) });
}
async function tree(source, destination) {
  for (const f of await readdir(source, { withFileTypes: true })) {
    if (f.isDirectory()) await tree(join(source, f.name), join(destination, f.name));
    else await add(join(destination, f.name), await readFile(join(source, f.name), 'utf8'));
  }
}
await tree('dist', join(runtime, 'dist'));
await add(join(runtime, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
const command = `#!/bin/sh\nexport CONTEXT_HOME="\${CONTEXT_HOME:-${home.replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`')}}"\nexec ${quote(process.execPath)} ${quote(join(runtime, 'dist/cli.js'))} "$@"\n`;
await add(launcher, command, 0o700);
const guide = (await readFile('docs/AGENT_GUIDE.md', 'utf8')).replaceAll('{{CLI}}', launcher).replaceAll('{{HOME}}', home);
await add(join(runtime, 'AGENT_GUIDE.md'), guide);
for (const name of ['context']) {
  await tree(`build/mods/${name}`, join(app, 'mods', name));
  const entry = writes.find(w => w.path === join(app, 'mods', name, 'native/config.js'));
  entry.content = `export const config = ${JSON.stringify({ node: process.execPath, cli: join(runtime, 'dist/cli.js'), requests: join(app, 'data/context-requests'), home, launcher })};\n`;
}
// Copy the current header's own assets; references still point to that shipped/personal mod.
await add(join(app, 'mods/context-tabs/main.js'), integrated.source);
if (!previous) await add(join(app, 'mods/context-tabs/mod.json'), JSON.stringify({ place: 'none', cloned_from: { name: sourceMod } }) + '\n');
const tabStore = join(app, 'data', sourceMod, 'store.json');
try {
  const raw = await readFile(tabStore, 'utf8');
  if (previous) {
    const store = JSON.parse(raw), panels = JSON.parse(store.panels ?? '{}');
    for (const id of Object.keys(panels)) if (['context-notes', 'context-tags'].includes(panels[id])) panels[id] = 'context';
    store.panels = JSON.stringify(panels);
    await add(tabStore, JSON.stringify(store), 0o600, true);
    const oldStores = [];
    for (const name of ['context-notes', 'context-tags']) {
      const path = join(app, 'data', name, 'store.json');
      try { const text = await readFile(path, 'utf8'); guards.push({ path, hash: hash(text) }); oldStores.push(JSON.parse(text)); }
      catch (e) { if (e.code !== 'ENOENT') throw e; oldStores.push({}); }
    }
    await add(join(app, 'data/context/store.json'), JSON.stringify(mergePanelDrafts(...oldStores)));
  } else await add(join(app, 'data/context-tabs/store.json'), raw);
} catch (e) { if (e.code !== 'ENOENT') throw e; }
await add(layoutPath, JSON.stringify(integrated.layout, null, 2) + '\n', 0o600, true);
const plan = { schema_version: 1, app, runtime, home, launcher, layoutPath, sourceMod, guards, writes, previous };
await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/install-plan.json', JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
await writeFile('.artifacts/layout-before.json', original);
await writeFile('.artifacts/layout-after.json', JSON.stringify(integrated.layout, null, 2) + '\n');
await mkdir('build/mods/context-tabs', { recursive: true });
await writeFile('build/mods/context-tabs/main.js', integrated.source);
await writeFile('build/mods/context-tabs/mod.json', '{"place":"none"}\n');
console.log(`Prepared ${writes.length} guarded writes. Adds one Context panel to ${arg[1]}; preserves layout state, Rigs, panes, records and legacy drafts. Review .artifacts/layout-{before,after}.json. Nothing installed.`);
