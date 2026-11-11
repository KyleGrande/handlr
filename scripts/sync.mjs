import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname, relative } from 'node:path';

const runtime = join(homedir(), '.local/share/herdr-context');
const manifestPath = join(runtime, 'install.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schema_version !== 1) throw new Error('Unsupported installation manifest.');
const hash = value => createHash('sha256').update(value).digest('hex');
// Refuse a modified personal file; sync never overwrites someone's edits.
for (const f of manifest.files) if (hash(await readFile(f.path)) !== f.hash) throw new Error(`Installed file was modified: ${f.path}. Reconcile it before syncing.`);
const writes = [];
for (const f of manifest.files) {
  let content;
  if (f.path.startsWith(join(runtime, 'dist') + '/')) content = await readFile(join('dist', relative(join(runtime, 'dist'), f.path)), 'utf8');
  for (const name of ['context']) {
    const root = join(manifest.app, 'mods', name);
    if (f.path.startsWith(root + '/') && !f.path.endsWith('/native/config.js')) content = await readFile(join('build/mods', name, relative(root, f.path)), 'utf8');
  }
  if (f.path === join(runtime, 'AGENT_GUIDE.md')) content = (await readFile('docs/AGENT_GUIDE.md', 'utf8')).replaceAll('{{CLI}}', manifest.launcher).replaceAll('{{HOME}}', manifest.home);
  if (content !== undefined && hash(content) !== f.hash) writes.push({ ...f, content });
}
for (const w of writes) {
  const tmp = join(dirname(w.path), `.context-sync-${randomUUID()}`);
  await writeFile(tmp, w.content, { mode: 0o600 }); await rename(tmp, w.path);
  manifest.files.find(f => f.path === w.path).hash = hash(w.content);
}
const temp = `${manifestPath}.${randomUUID()}`;
await writeFile(temp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); await rename(temp, manifestPath);
console.log(`Synced ${writes.length} managed files. Layout, tab bar, panel selection and saved records preserved.`);
