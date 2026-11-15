import { mkdir, open, readFile, rename, rm, link } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ContextError, emptyRecord, fail, patch, record, revision, target, targetKey } from './model.js';
import type { AgentLifetime, ContextRecord, ContextTarget } from './types.js';

export const contextHome = () => resolve(process.env.CONTEXT_HOME || join(homedir(), '.local/state/herdr-context'));
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

/** Serializes compare/rename across processes. Crash locks fail closed; never steal them. */
export class Store {
  constructor(public home = contextHome()) {}
  file(t: ContextTarget) { return join(this.home, 'records', createHash('sha256').update(targetKey(t)).digest('hex') + '.json'); }
  /** Publish a complete immutable binding with create-if-absent semantics.
   * Both panels and concurrent CLIs get the same UUID for one verified process.
   * A replacement process gets another binding; the old record remains intact. */
  async agentForLifetime(lifetime: AgentLifetime): Promise<ContextTarget> {
    const key = JSON.stringify(lifetime);
    const directory = join(this.home, 'bindings');
    const path = join(directory, createHash('sha256').update(key).digest('hex') + '.json');
    const read = async () => {
      let data;
      try { data = JSON.parse(await readFile(path, 'utf8')); }
      catch (e) { if (missing(e)) throw e; fail('corrupt_record', 'An agent binding is unreadable; it was preserved.'); }
      if (data.schema_version !== 1 || JSON.stringify(data.lifetime) !== key) fail('corrupt_record', 'Invalid agent binding; it was preserved.');
      const owner = target(data.target);
      if (owner.kind !== 'agent' || owner.machine !== lifetime.machine) fail('corrupt_record', 'Invalid agent binding owner.');
      return owner;
    };
    try { return await read(); } catch (e) { if (!missing(e)) throw e; }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temp = join(directory, `.${randomUUID()}.tmp`);
    const owner: ContextTarget = { kind: 'agent', machine: lifetime.machine, id: randomUUID() };
    try {
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ schema_version: 1, lifetime, target: owner }) + '\n'); await handle.sync(); }
      finally { await handle.close(); }
      try { await link(temp, path); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      const dir = await open(directory, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      return await read();
    } finally { await rm(temp, { force: true }); }
  }
  async read(t: ContextTarget): Promise<ContextRecord> {
    t = target(t);
    let raw: string;
    try { raw = await readFile(this.file(t), 'utf8'); }
    catch (e) { if (missing(e)) return emptyRecord(t); throw e; }
    try { return record(JSON.parse(raw), t); }
    catch (e) { if (e instanceof ContextError) throw e; fail('corrupt_record', 'The stored record is invalid JSON; it was preserved.'); }
  }
  async write(t: ContextTarget, expected: number, update: unknown): Promise<ContextRecord> {
    t = target(t); expected = revision(expected); const p = patch(update);
    await mkdir(join(this.home, 'records'), { recursive: true, mode: 0o700 });
    const lock = join(this.home, 'write.lock'), deadline = Date.now() + 5000;
    for (;;) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (Date.now() >= deadline) fail('locked', 'Storage is locked. Retry; after a crashed writer, stop all writers before removing write.lock.');
        await delay(30);
      }
    }
    const temp = join(this.home, 'records', `.${randomUUID()}.tmp`);
    try {
      const current = await this.read(t);
      if (current.revision !== expected) throw new ContextError('conflict', 'Context changed in another editor. Your draft has not been saved.', current.revision);
      const now = new Date().toISOString();
      const next: ContextRecord = { ...current, ...p, revision: expected + 1, created_at: current.created_at ?? now, updated_at: now };
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(next, null, 2) + '\n'); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temp, this.file(t));
      const dir = await open(join(this.home, 'records'), 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      return next;
    } finally { await rm(temp, { force: true }); await rm(lock, { recursive: true }); }
  }
}
