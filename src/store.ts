import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { TicketError } from './errors.js';
import type { Store } from './types.js';
export const emptyStore = (): Store => ({schema_version:1,revision:0,tickets:[],checkouts:[],items:[],edges:[],watches:[],observations:[],connections:[]});
export function storePath(): string {
  return resolve(process.env.HERDR_TICKET_STORE ?? join(homedir(), '.local/share/herdr-ticket/store.json'));
}
export function validateStore(s: Store): void {
  const bad = () => { throw new TicketError('invalid_storage','Ticket storage is invalid or unsupported; it was left untouched.',6); };
  if (!s || s.schema_version !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0) bad();
  for (const key of ['tickets','checkouts','items','edges','watches','observations','connections'] as const) if (!Array.isArray(s[key])) bad();
  const ids = (records: {id:string}[]) => {
    const found = new Set<string>();
    for (const r of records) { if (!r || typeof r.id !== 'string' || found.has(r.id)) bad(); found.add(r.id); }
    return found;
  };
  const ts = ids(s.tickets), cs = ids(s.checkouts), its = ids(s.items); ids(s.edges);
  for (const t of s.tickets) {
    if (typeof t.name !== 'string' || typeof t.archived !== 'boolean' || !Array.isArray(t.mappings) || !Array.isArray(t.item_ids)) bad();
    ids(t.mappings);
    if (new Set(t.mappings.map(m => m.name)).size !== t.mappings.length || t.mappings.some(m => !cs.has(m.checkout_id)) || t.item_ids.some(id => !its.has(id))) bad();
  }
  for (const c of s.checkouts) if (![c.machine_id,c.repository_id,c.path,c.git_dir,c.fingerprint].every(v => typeof v === 'string' && v.length > 0)) bad();
  for (const i of s.items) {
    try { const u = new URL(i.url); if (!['https:','http:'].includes(u.protocol) || u.username || u.password) bad(); } catch { bad(); }
    if (!['task','pr','link'].includes(i.kind) || !['github','jira','url'].includes(i.provider)) bad();
  }
  for (const e of s.edges) {
    const t = s.tickets.find(t => t.id === e.ticket_id);
    const valid = (id:string) => !!t && (t.item_ids.includes(id) || t.mappings.some(m => m.checkout_id === id));
    if (!ts.has(e.ticket_id) || !valid(e.from) || !valid(e.to) || typeof e.confirmed !== 'boolean') bad();
  }
  if (s.watches.some(id => !its.has(id))) bad();
  for (const o of s.observations) if (!its.has(o.item_id) || typeof o.source !== 'string' || !o.data || !Array.isArray(o.omitted)) bad();
}
export async function loadStore(path = storePath()): Promise<Store> {
  try {
    if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('oversize');
    const result = JSON.parse(await readFile(path,'utf8')) as Store; validateStore(result); return result;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    if (e instanceof TicketError) throw e;
    throw new TicketError('unreadable_storage','Cannot read Ticket storage. No data was changed.',6);
  }
}
export async function updateStore<T>(edit: (store: Store) => T | Promise<T>, expected?: number, path = storePath()): Promise<T> {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const lock = `${path}.lock`;
  let handle;
  try { handle = await open(lock,'wx',0o600); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new TicketError('storage_busy','Another writer holds the store lock. Retry; after a crash inspect and remove the abandoned lock.',6); throw e; }
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await handle.writeFile(JSON.stringify({pid:process.pid,created_at:new Date().toISOString()}));
    const store = await loadStore(path);
    if (expected !== undefined && store.revision !== expected) throw new TicketError('revision_conflict','Ticket changed. Reload before editing.',7);
    const result = await edit(store); store.revision++; validateStore(store);
    const file = await open(temp,'wx',0o600);
    try { await file.writeFile(JSON.stringify(store,null,2)+'\n'); await file.sync(); } finally { await file.close(); }
    await rename(temp,path);
    return result;
  } finally { await unlink(temp).catch(() => {}); await handle.close(); await unlink(lock); }
}
