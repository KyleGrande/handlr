import { readFile, writeFile, mkdir, rename, chmod } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

const plan = JSON.parse(await readFile('.artifacts/install-plan.json', 'utf8'));
if (plan.schema_version !== 1) throw new Error('Unsupported install plan.');
const hash = text => createHash('sha256').update(text).digest('hex');
const originals = new Map();
for (const guard of plan.guards) if (hash(await readFile(guard.path)) !== guard.hash) throw new Error('Host tab bar changed. Prepare installation again.');
for (const write of plan.writes) {
  let old = null;
  try { old = await readFile(write.path, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if ((old === null ? null : hash(old)) !== write.expected) throw new Error(`Destination changed since preparation: ${write.path}`);
  originals.set(write.path, old);
}
const stamp = new Date().toISOString().replaceAll(':', '-');
const backup = join(plan.runtime, 'backups', stamp);
await mkdir(backup, { recursive: true, mode: 0o700 });
await writeFile(join(backup, 'originals.json'), JSON.stringify([...originals], null, 2), { mode: 0o600 });
await mkdir(join(plan.app, 'data/context-requests'), { recursive: true, mode: 0o700 });
await chmod(join(plan.app, 'data/context-requests'), 0o700);
// Modules first, layout last: the live app cannot see incomplete panel entry points.
for (const w of plan.writes) {
  await mkdir(dirname(w.path), { recursive: true, mode: 0o700 });
  const tmp = join(dirname(w.path), `.context-install-${randomUUID()}`);
  await writeFile(tmp, w.content, { mode: w.mode });
  await rename(tmp, w.path);
}
const files = new Map((plan.previous?.files ?? []).map(f => [f.path, f]));
for (const w of plan.writes.filter(w => !w.path.includes('/data/'))) files.set(w.path, { path: w.path, hash: hash(w.content) });
const manifest = { schema_version: 1, app: plan.app, runtime: plan.runtime, home: plan.home, launcher: plan.launcher, layoutPath: plan.layoutPath,
  backup, files: [...files.values()] };
await writeFile(join(plan.runtime, 'install.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
console.log(`Installed Context. Guide: ${plan.runtime}/AGENT_GUIDE.md. Backup: ${backup}.`);
