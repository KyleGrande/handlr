import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { resolveObservedApp, validateObservedApp } from './observe.js';
import { requireValue as check, type Profile, type Checkout, type Rig, type Plan, type Endpoint, type ResolvedService, type ExternalCheck } from './types.js';
const exec = promisify(execFile);
export const expandHome = (p: string) => p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
export async function checkout(directory: string): Promise<Checkout> {
  const git = async (...args: string[]) => {
    try { return (await exec('git', ['-C', expandHome(directory), ...args])).stdout.trim(); }
    catch { throw new Error(`Checkout missing or invalid: ${directory}; select an existing Git worktree`); }
  };
  const root = await fs.realpath(await git('rev-parse', '--show-toplevel'));
  const repository = await fs.realpath(path.resolve(expandHome(directory), await git('rev-parse', '--git-common-dir')));
  const optionalGit = async (...args: string[]) => {
    try { return (await exec('git', ['-C', root, ...args])).stdout.trim(); }
    catch (error) {
      if ((error as {code?: number}).code === 1) return '';
      throw new Error(`Cannot read Git HEAD in ${root}; inspect the repository without changing its history`);
    }
  };
  const branch = await optionalGit('symbolic-ref', '--quiet', '--short', 'HEAD');
  const commit = await optionalGit('rev-parse', '--verify', '--quiet', 'HEAD');
  check(branch || commit, `Cannot read Git HEAD in ${root}`);
  return { root, repository, branch: branch || `detached ${commit.slice(0,7)}`, ...(!commit ? {unborn: true} : {}) };
}
/** Stable review identity covers configuration and concrete checkouts, never secret values or free-port observations. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function available(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createServer();
    socket.once('error', () => resolve(false));
    socket.listen(port, '127.0.0.1', () => socket.close(() => resolve(true)));
  });
}
export function validate(profile: Profile): string[] {
  check(profile.version === 1, 'Profile version must be 1');
  check(Array.isArray(profile.repos) && profile.repos.length && new Set(profile.repos).size === profile.repos.length, 'Declare unique repo IDs');
  check(profile.services && typeof profile.services === 'object' && !Array.isArray(profile.services), 'Declare services as an object');
  check(profile.observed_apps === undefined || profile.observed_apps && typeof profile.observed_apps === 'object' && !Array.isArray(profile.observed_apps), 'Invalid observed_apps');
  check(Object.keys(profile.services).length || Object.keys(profile.observed_apps ?? {}).length, 'Declare services or observed_apps');
  const ids = /^[a-zA-Z0-9_-]+$/;
  for (const id of [...profile.repos, ...Object.keys(profile.services), ...Object.keys(profile.observed_apps ?? {})]) check(typeof id === 'string' && ids.test(id) && !['__proto__','constructor','prototype'].includes(id), `Invalid ID ${id}`);
  for (const [id, app] of Object.entries(profile.observed_apps ?? {})) {
    validateObservedApp(app, id);
    check(profile.repos.includes(app.repo), `${id}: unknown observed app repo`);
    check(!Object.hasOwn(profile.services, id), `${id}: observed app ID conflicts with a managed service`);
  }
  const endpoints = new Set<string>();
  for (const [id, service] of Object.entries(profile.services)) {
    check(profile.repos.includes(service.repo), `${id}: unknown repo`);
    check(Array.isArray(service.argv) && service.argv.length && service.argv.every(a => typeof a === 'string'), `${id}: argv must be a nonempty string array`);
    check(!path.isAbsolute(service.directory ?? '.'), `${id}: directory must be relative`);
    for (const [name, endpoint] of Object.entries(service.endpoints ?? {})) {
      check(ids.test(name), `${id}: invalid endpoint ID`);
      check(['http', 'https', 'tcp'].includes(endpoint.protocol ?? 'http'), `${id}.${name}: invalid protocol`);
      const range = endpoint.range ?? [3000, 4999];
      check(range.length === 2 && range.every(p => Number.isInteger(p) && p >= 1024 && p <= 65535) && range[0] <= range[1], `${id}.${name}: invalid range`);
      check(endpoint.port === undefined || Number.isInteger(endpoint.port) && endpoint.port >= 1024 && endpoint.port <= 65535, `${id}.${name}: invalid port`);
      endpoints.add(`${id}.${name}`);
    }
    if (service.readiness) {
      check(service.endpoints?.[service.readiness.endpoint], `${id}: readiness endpoint missing`);
      check(['http', 'tcp'].includes(service.readiness.kind ?? 'http'), `${id}: invalid readiness kind`);
      check(Number.isFinite(service.readiness.timeout ?? 20) && (service.readiness.timeout ?? 20) > 0 && (service.readiness.timeout ?? 20) <= 600, `${id}: invalid readiness deadline`);
    }
  }
  for (const [id, service] of Object.entries(profile.services)) {
    for (const [key, binding] of Object.entries(service.env ?? {})) {
      check(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key), `${id}: invalid environment key`);
      check(typeof binding === 'string' || binding && typeof binding === 'object', `${id}.${key}: invalid binding`);
      if (typeof binding === 'string') continue;
      check(['endpoint', 'external', 'secret_env', 'secret_file'].filter(k => k in binding).length === 1, `${id}.${key}: choose one binding source`);
      check(Object.keys(binding).every(k => ['endpoint', 'external', 'origin', 'path', 'secret_env', 'secret_file', 'probe'].includes(k)), `${id}.${key}: unknown binding field`);
      if (binding.path !== undefined) check(typeof binding.path === 'string' && (binding.path === '' || binding.path.startsWith('/')), `${id}.${key}: appended path must begin with /`);
      if (binding.origin !== undefined) check(typeof binding.origin === 'boolean', `${id}.${key}: origin must be boolean`);
      if (binding.secret_env || binding.secret_file) check(!binding.path && !binding.origin && !binding.probe, `${id}.${key}: secret bindings do not accept URL options`);
      if (binding.probe) {
        check(binding.external, `${id}.${key}: external probes require an external URL`);
        check(['http', 'tcp'].includes(binding.probe.kind ?? 'http'), `${id}.${key}: invalid external probe kind`);
        check(Number.isFinite(binding.probe.timeout ?? 20) && (binding.probe.timeout ?? 20) > 0 && (binding.probe.timeout ?? 20) <= 600, `${id}.${key}: invalid external probe deadline`);
        check(!binding.probe.path || typeof binding.probe.path === 'string' && binding.probe.path.startsWith('/'), `${id}.${key}: external probe path must begin with /`);
      }
      if (binding.endpoint) check(endpoints.has(binding.endpoint), `${id}: unknown endpoint ${binding.endpoint}`);
      if (binding.external) {
        let valid = false; try { const u = new URL(binding.external); valid = ['http:', 'https:', 'tcp:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch {}
        if (binding.probe && (binding.probe.kind ?? 'http') === 'http') check(/^https?:/.test(binding.external), `${id}.${key}: HTTP probe requires HTTP(S) URL`);
        check(valid, `${id}.${key}: external must be a URL without credentials; use a secret source for credentials`);
      }
    }
    for (const [, token] of JSON.stringify(service).matchAll(/\$\{([^}]+)\}/g))
      check(token === 'rig.id' || token.endsWith('.port') && endpoints.has(token.slice(0, -5)), `${id}: unknown token ${token}`);
  }
  if (profile.setup) {
    check(typeof profile.setup.approved === 'boolean' && Array.isArray(profile.setup.questions) && profile.setup.questions.every(q => typeof q === 'string' && /^[a-zA-Z0-9_-]+$/.test(q) && !['__proto__','constructor','prototype'].includes(q)) && new Set(profile.setup.questions).size === profile.setup.questions.length, 'Invalid setup questions');
    check(profile.setup.decisions && typeof profile.setup.decisions === 'object' && !Array.isArray(profile.setup.decisions) && Object.values(profile.setup.decisions).every(d => typeof d === 'string'), 'Invalid setup decisions');
  }
  const order: string[] = [], visiting = new Set<string>();
  const visit = (id: string) => {
    check(profile.services[id], `Unknown readiness dependency ${id}`);
    check(!visiting.has(id), 'Readiness dependency cycle');
    if (order.includes(id)) return;
    visiting.add(id);
    for (const dependency of profile.services[id].depends_on ?? []) {
      check(profile.services[dependency]?.readiness, `${id}: prerequisite ${dependency} needs a readiness probe`);
      visit(dependency);
    }
    visiting.delete(id); order.push(id);
  };
  Object.keys(profile.services).forEach(visit);
  return order;
}
export async function resolve(rig: Rig, reserved: ReadonlySet<number> | ReadonlyMap<number, string> = new Set(), checkPorts = true, ownedPorts = new Set<number>(), override?: Profile): Promise<Plan> {
  const profile: Profile = override ?? JSON.parse(await fs.readFile(rig.profile, 'utf8'));
  const order = validate(profile);
  check(Object.keys(rig.checkouts).sort().join() === [...profile.repos].sort().join(), 'Select exactly one concrete checkout per repo slot');
  const checkouts: Record<string, Checkout> = {};
  for (const repo of profile.repos) checkouts[repo] = await checkout(rig.checkouts[repo]);
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical({profile, checkouts, id:rig.id}))).digest('hex');
  const approved = rig.approval?.fingerprint === fingerprint;
  const setup = profile.setup ? {...profile.setup, approved, decisions: approved ? {...profile.setup.decisions, ...rig.approval!.decisions} : profile.setup.decisions} : undefined;
  const endpoints: Record<string, Endpoint> = {}, used = new Set(reserved.keys());
  for (const [id, service] of Object.entries(profile.services)) {
    for (const [name, endpoint] of Object.entries(service.endpoints ?? {})) {
      const key = `${id}.${name}`, saved = rig.ports[key];
      const range = endpoint.range ?? [3000,4999];
      const preferred = endpoint.port ?? (saved !== undefined && saved >= range[0] && saved <= range[1] ? saved : undefined);
      let port = preferred;
      if (preferred !== undefined) {
        const owner = reserved instanceof Map ? reserved.get(preferred) : undefined;
        if (owner) throw new Error(`${key}: preferred port ${preferred} is occupied by rig ${owner}`);
        check(!used.has(preferred) && (!checkPorts || ownedPorts.has(preferred) || await available(preferred)), `${key}: preferred port ${preferred} is occupied; stop its owner or choose another port`);
      }
      else {
        const [lo, hi] = endpoint.range ?? [3000, 4999];
        for (let p = lo; p <= hi; p++) if (!used.has(p) && (!checkPorts || ownedPorts.has(p) || await available(p))) { port = p; break; }
      }
      check(port !== undefined, `${key}: no available ports`);
      used.add(port); const protocol = endpoint.protocol ?? 'http';
      endpoints[key] = { port, host: '127.0.0.1', protocol, url: `${protocol}://127.0.0.1:${port}` };
    }
  }
  const expand = (value: string) => value.replace(/\$\{([^}]+)\}/g, (_, token: string) => token === 'rig.id' ? rig.id : String(endpoints[token.slice(0, -5)].port));
  const services: Record<string, ResolvedService> = {};
  for (const id of order) {
    const spec = profile.services[id], root = checkouts[spec.repo].root;
    let cwd: string;
    try { cwd = await fs.realpath(path.join(root, spec.directory ?? '.')); check((await fs.stat(cwd)).isDirectory(), `${id}: directory missing`); }
    catch { throw new Error(`${id}: service directory missing`); }
    check(cwd === root || cwd.startsWith(root + path.sep), `${id}: service directory escapes checkout`);
    const external_checks: ExternalCheck[] = [];
    const external_bindings: {key:string;url:string}[] = [];
    const env: Record<string,string> = {}, secrets: ResolvedService['secrets'] = {};
    for (const [key, binding] of Object.entries(spec.env ?? {})) {
      if (typeof binding === 'string') env[key] = expand(binding);
      else if (binding.secret_env || binding.secret_file) { secrets[key] = binding; env[key] = '<secret>'; }
      else {
        let url = binding.endpoint ? endpoints[binding.endpoint].url : binding.external!;
        if (binding.origin) { const parsed = new URL(url); url = `${parsed.protocol}//${parsed.host}`; }
        const parsed = new URL(url);
        if (binding.path) parsed.pathname = parsed.pathname.replace(/\/$/, '') + binding.path;
        env[key] = binding.path ? parsed.toString() : url.replace(/\/$/, '');
        if (binding.external) external_bindings.push({key,url:env[key]});
        if (binding.probe) {
          const target = new URL(env[key]);
          if (binding.probe.path) { target.pathname = binding.probe.path; target.search = ''; target.hash = ''; }
          external_checks.push({key, url: target.toString(), kind: binding.probe.kind ?? 'http', timeout: binding.probe.timeout ?? 20});
        }
      }
    }
    const item = { id, repo: spec.repo, cwd, argv: spec.argv.map(expand), env, secrets,
      ...(external_checks.length ? { external_checks } : {}), depends_on: spec.depends_on ?? [], readiness: spec.readiness, data_scope: spec.data_scope ?? 'Service defaults; review shared infrastructure',
      endpoints: Object.fromEntries(Object.entries(endpoints).filter(([key]) => key.startsWith(id + '.'))) };
    services[id] = { ...item, fingerprint: createHash('sha256').update(JSON.stringify(item)).digest('hex'), ...(external_bindings.length ? {external_bindings} : {}) };
  }
  const observed_apps = Object.fromEntries(Object.entries(profile.observed_apps ?? {}).map(([id, app]) => [id, resolveObservedApp(app, checkouts[app.repo].root)]));
  return { id: rig.id, name: rig.name, checkouts, services, ...(Object.keys(observed_apps).length ? {observed_apps} : {}), order, endpoints, assignments: 'proposed, unreserved', review:{fingerprint, approved}, ...(setup ? {setup} : {}) };
}
export async function launchEnv(service: ResolvedService): Promise<Record<string,string>> {
  const env = { ...service.env };
  for (const [key, source] of Object.entries(service.secrets)) {
    check(typeof source !== 'string', 'Invalid secret binding');
    if (source.secret_env) { check(process.env[source.secret_env] !== undefined, `Missing secret source for ${key}`); env[key] = process.env[source.secret_env]!; }
    else {
      try { env[key] = (await fs.readFile(path.resolve(service.cwd, expandHome(source.secret_file!)), 'utf8')).replace(/\n$/, ''); }
      catch { throw new Error(`Missing secret file for ${key}`); }
    }
  }
  return env;
}
export function publicPlan(plan: Plan) {
  return { ...plan, services: Object.fromEntries(Object.entries(plan.services).map(([id, s]) => { const { secrets, ...rest } = s; return [id, rest]; })) };
}
