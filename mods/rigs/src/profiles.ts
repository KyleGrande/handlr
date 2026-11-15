import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { expandHome, resolve, validate } from './profile.js';
import { requireValue as check, type Profile, type Registry, type Rig } from './types.js';

export const revision = (value: string) => createHash('sha256').update(value).digest('hex');
export const rigRevision = (rig: Rig) => revision(JSON.stringify([rig.id,rig.name,rig.profile,rig.checkouts]));
export const isActive = (rig: Rig) => rig.claimed || Object.values(rig.launches).some(launch => launch.state !== 'exited');
export async function profilePath(file: string) {
  const absolute = path.resolve(expandHome(file));
  try { return await fs.realpath(absolute); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return absolute; throw error; }
}
export async function profileReferences(registry: Registry, file: string) {
  const refs: Rig[] = [];
  for (const rig of Object.values(registry.rigs)) if (await profilePath(rig.profile) === file) refs.push(rig);
  return refs;
}
export function rememberProfile(registry: Registry, file: string) {
  registry.profiles = [...new Set([...(registry.profiles ?? []),file])];
}
export class Profiles {
  constructor(readonly store = new Store()) {}
  async describe(file: string, registry?: Registry) {
    registry ??= await this.store.load();
    file = await profilePath(file);
    let content: string | null = null;
    try { content = await fs.readFile(file,'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const refs = await profileReferences(registry,file);
    return {path:file, content, revision:content === null ? 'missing' : revision(content),
      rigs:refs.map(rig => ({id:rig.id,name:rig.name,active:isActive(rig),checkouts:rig.checkouts})), missing:content === null};
  }
  async list() {
    const registry = await this.store.load();
    const paths = new Set<string>();
    for (const file of [...(registry.profiles ?? []),...Object.values(registry.rigs).map(rig => rig.profile)]) paths.add(await profilePath(file));
    const profiles = [];
    for (const file of [...paths].sort()) {
      const item = await this.describe(file,registry);
      let repos: string[] = [], services = 0, apps = 0, error: string | undefined;
      try { const parsed: Profile = JSON.parse(item.content!); validate(parsed); repos = parsed.repos; services = Object.keys(parsed.services).length; apps = Object.keys(parsed.observed_apps ?? {}).length; }
      catch { error = item.missing ? 'Profile file missing' : 'Invalid profile; edit to repair'; }
      const {content, ...metadata} = item;
      profiles.push({...metadata,repos,services,apps,...(error ? {error} : {})});
    }
    return {profiles,rig_names:Object.values(registry.rigs).map(rig => rig.name)};
  }
  async register(file: string) {
    return this.store.lock('registry', async () => {
      const registry = await this.store.load(), item = await this.describe(file,registry);
      check(item.content !== null, 'Profile file missing'); validate(JSON.parse(item.content));
      rememberProfile(registry,item.path); await this.store.save(registry);
      return item;
    });
  }
  async update(file: string, content: string, expected: string) {
    const candidate: Profile = JSON.parse(content); validate(candidate);
    return this.store.lock('registry', async () => {
      const registry = await this.store.load(), item = await this.describe(file,registry);
      check(item.content !== null && expected === item.revision, 'Profile changed or is missing; reopen it before saving');
      const refs = await profileReferences(registry,item.path);
      check(!refs.some(isActive), `Stop rigs using this profile before editing: ${refs.filter(isActive).map(rig => rig.name).join(', ')}`);
      for (const rig of refs) {
        // Validate existing mappings against the candidate without publishing it or reserving resources.
        try { await resolve(rig,new Set(),false,new Set(),candidate); }
        catch (error) { throw new Error(`${rig.name}: ${(error as Error).message}; keep shared repo slots compatible or assign this rig another profile first`); }
      }
      const temporary = path.join(path.dirname(item.path),`.rig-profile-${randomUUID()}.tmp`);
      try {
        const mode = (await fs.stat(item.path)).mode & 0o777;
        const handle = await fs.open(temporary,'wx',mode);
        try { await handle.writeFile(content); await handle.chmod(mode); await handle.sync(); }
        finally { await handle.close(); }
        check(revision(await fs.readFile(item.path,'utf8')) === expected, 'Profile changed; reopen it before saving');
        await fs.rename(temporary,item.path);
      } finally { await fs.rm(temporary,{force:true}); }
      rememberProfile(registry,item.path); await this.store.save(registry);
      return this.describe(item.path,registry);
    });
  }
  async delete(file: string, expected: string) {
    return this.store.lock('registry', async () => {
      const registry = await this.store.load(), item = await this.describe(file,registry);
      check(expected === item.revision, 'Profile changed; reopen it before deleting');
      check(!item.rigs.length, `Profile is used by rigs: ${item.rigs.map(rig => rig.name).join(', ')}. Delete those rigs or assign another profile first`);
      if (!item.missing) await fs.unlink(item.path);
      const retained: string[] = [];
      for (const saved of registry.profiles ?? []) if (await profilePath(saved) !== item.path) retained.push(saved);
      registry.profiles = retained; await this.store.save(registry);
      return {deleted:true,profile:item.path};
    });
  }
}
