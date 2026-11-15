import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { RigError, type Registry } from './types.js';

export class Store {
  constructor(readonly home = process.env.RIG_HOME ?? path.join(os.homedir(), '.local/state/herdr-rigs')) {}
  async lock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.home, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(path.join(this.home, name), {
      realpath: false, stale: 10000, update: 2000,
      retries: { retries: 120, minTimeout: 100, maxTimeout: 250 },
    });
    try { return await fn(); } finally { await release(); }
  }

  async load(): Promise<Registry> {
    try { return JSON.parse(await fs.readFile(path.join(this.home, 'registry.json'), 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, rigs: {} }; throw new RigError('Cannot read registry; preserve the file and repair it before continuing'); }
  }
  async save(registry: Registry) {
    const temporary = path.join(this.home, `.${randomUUID()}.tmp`);
    const file = await fs.open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(registry, null, 2)); await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, path.join(this.home, 'registry.json'));
    const directory = await fs.open(this.home, 'r'); try { await directory.sync(); } finally { await directory.close(); }
  }
}
