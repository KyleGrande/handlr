import { randomUUID } from 'node:crypto';
import { probeURL, waitExternal } from './probe.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.js';
import { Core, type CoreAPI } from './core.js';
import { rigConnections, type ConnectionRig } from './connections.js';
import { ProcessObserver } from './observe.js';
import { isActive, profilePath, rememberProfile, rigRevision } from './profiles.js';
import { available, checkout, launchEnv, publicPlan, resolve } from './profile.js';
import { now, requireValue as check, type Launch, type Registry, type Rig, type Terminal, type ResolvedService, type Plan } from './types.js';

function reservedPorts(registry: Registry, excludedRig: string) {
  const ports = new Map<number, string>();
  for (const rig of Object.values(registry.rigs)) {
    if (rig.id === excludedRig || !rig.claimed) continue;
    for (const endpoint of Object.values(rig.allocation?.endpoints ?? {})) ports.set(endpoint.port, rig.name);
  }
  return ports;
}

export function owned(launch: Launch, terminals: Terminal[]): Terminal | undefined {
  const matches = terminals.filter(t => Object.entries(launch.labels).every(([k,v]) => t.labels[k] === v));
  check(matches.length <= 1, `${launch.service}: multiple terminals match launch; inspect Core before continuing`);
  const terminal = matches[0];
  check(!launch.terminal || !terminals.some(t => t.address === launch.terminal) || !!terminal,
    `${launch.service}: recorded terminal labels changed; ownership unresolved, inspect Core`);
  check(!terminal || !launch.terminal || terminal.address === launch.terminal, `${launch.service}: terminal identity changed`);
  return terminal;
}
function reconcile(rig: Rig, terminals: Terminal[]) {
  for (const launch of Object.values(rig.launches)) {
    if (launch.state === 'exited') continue;
    const terminal = owned(launch, terminals);
    if (terminal) {
      launch.terminal = terminal.address;
      launch.state = terminal.state === 'finished' ? 'exited' : terminal.reason === 'spawn_pending' ? 'unknown' : 'running';
    } else {
      // A lost launch is never silently replaced. Explicit down confirms absence.
      launch.state = 'unknown';
      launch.error = 'Launch not found in Core; run down to reconcile before starting a replacement';
    }
  }
}
export async function probe(service: ResolvedService, timeout = 1000): Promise<boolean> {
  if (!service.readiness) return true;
  const p = service.readiness, endpoint = service.endpoints[`${service.id}.${p.endpoint}`];
  return probeURL(endpoint.url + (p.path ?? '/'), p.kind ?? 'http', timeout);
}
export class Rigs {
  constructor(readonly store = new Store(), readonly core: CoreAPI = new Core(), readonly observer = new ProcessObserver()) {}
  async get(name: string) {
    const registry = await this.store.load();
    const rig = (Object.hasOwn(registry.rigs, name) ? registry.rigs[name] : undefined) ?? Object.values(registry.rigs).find(r => r.name === name);
    check(rig, `Unknown rig ${name}; create it first`); return rig;
  }
  async write(rig: Rig) { await this.store.lock('registry', async () => { const data = await this.store.load(); data.rigs[rig.id] = rig; await this.store.save(data); }); }
  async create(name: string, profile: string, selections: Record<string,string>) {
    check(typeof name === 'string' && name.trim().length > 0, 'Choose a nonempty rig name');
    const rig: Rig = { id: randomUUID(), name, profile:await profilePath(profile), checkouts: selections, ports: {}, launches: {}, claimed: false };
    return this.store.lock('registry', async () => {
      const data = await this.store.load(); check(!Object.values(data.rigs).some(r => r.name === name), `Rig ${name} already exists`);
      const plan = await resolve(rig, new Set(), false);
      rig.checkouts = Object.fromEntries(Object.entries(plan.checkouts).map(([id,c]) => [id,c.root]));
      rig.checkout_bindings = plan.checkouts;
      rememberProfile(data,rig.profile);
      data.rigs[rig.id] = rig; await this.store.save(data);
      return { id: rig.id, name: rig.name, plan: publicPlan(plan) };
    });
  }
  async definition(name: string) {
    const rig = await this.get(name);
    return {id:rig.id,name:rig.name,profile:rig.profile,checkouts:rig.checkouts,active:isActive(rig),revision:rigRevision(rig)};
  }
  async appTool(name: string, appId: string, action: string) {
    check(action === 'rebuild' || action === 'relaunch', 'Use an explicit rebuild or relaunch action');
    const rig = await this.get(name);
    return this.store.lock(rig.id, async () => {
      const plan = await this.plan(name), app = plan.observed_apps?.[appId];
      check(app?.development && app.cwd && !app.machine, 'No local development actions configured for this app');
      const argv = app.development[action];
      check(argv?.length, 'This development action is not configured');
      const terminals = await this.core.terminals();
      check(!terminals.some(t => t.state === 'live' && t.labels?.['rig.app-tool'] === rig.id && t.labels?.['rig.app'] === appId), 'An app development action is already running');
      const terminal = await this.core.start(argv, app.cwd, {}, {'rig.app-tool':rig.id,'rig.app':appId,'rig.app-action':action});
      return {terminal:terminal.address,action,app:appId};
    });
  }
  async delete(name: string, expected?: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => this.store.lock('registry', async () => {
      const data = await this.store.load(), rig = data.rigs[initial.id];
      check(rig, 'Rig already deleted');
      check(!expected || expected === rigRevision(rig), 'Rig changed; reopen it before deleting');
      check(!isActive(rig), 'Stop and reconcile this rig before deleting it');
      rememberProfile(data,await profilePath(rig.profile));
      delete data.rigs[rig.id]; await this.store.save(data);
      return {deleted:true,id:rig.id,name:rig.name,profile:rig.profile};
    }));
  }
  async configure(name: string, selections: Record<string,string>, options: {name?:string;profile?:string;revision?:string} = {}) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => this.store.lock('registry', async () => {
      const data = await this.store.load(), rig = data.rigs[initial.id]; check(rig, 'Rig already deleted');
      check(!options.revision || options.revision === rigRevision(rig), 'Rig changed; reopen it before saving');
      const nextName = options.name ?? rig.name;
      check(typeof nextName === 'string' && nextName.trim(), 'Choose a nonempty rig name');
      check(!Object.values(data.rigs).some(other => other.id !== rig.id && other.name === nextName), `Rig ${nextName} already exists`);
      const nextProfile = options.profile ? await profilePath(options.profile) : rig.profile;
      const mappings = options.profile ? selections : {...rig.checkouts,...selections};
      const material = nextProfile !== rig.profile || JSON.stringify(Object.entries(mappings).sort()) !== JSON.stringify(Object.entries(rig.checkouts).sort());
      check(!material || !isActive(rig), 'Stop and reconcile the rig before changing its profile or worktrees; renaming is allowed while running');
      const oldProfile = rig.profile;
      rig.name = nextName; rig.profile = nextProfile; rig.checkouts = mappings;
      if (material) {
        rig.ports = {}; delete rig.allocation; rig.launches = {}; delete rig.error;
        // Keep the fact that approval is required even for a previously approved manual profile.
        if (rig.approval) rig.approval = {fingerprint:'',decisions:{}};
      }
      const plan = await resolve(rig, new Set(), false);
      rig.checkouts = Object.fromEntries(Object.entries(plan.checkouts).map(([id,c]) => [id,c.root]));
      rig.checkout_bindings = plan.checkouts;
      if (rig.allocation) rig.allocation.name = nextName;
      rememberProfile(data,await profilePath(oldProfile)); rememberProfile(data,rig.profile);
      data.rigs[rig.id] = rig; await this.store.save(data); return publicPlan(plan);
    }));
  }
  async plan(name: string) {
    const rig = await this.get(name);
    const reserved = reservedPorts(await this.store.load(), rig.id);
    return publicPlan(await resolve(rig, reserved, true, this.ownedPorts(rig)));
  }
  async approve(name: string, fingerprint: string, decisions: Record<string,string> = {}) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => {
      const rig = await this.get(initial.id), plan = await resolve(rig, new Set(), false);
      check(fingerprint === plan.review.fingerprint, 'Preview changed; run plan again and review the current configuration before approving');
      const questions = plan.setup?.questions ?? [];
      check(Object.keys(decisions).every(key => questions.includes(key)), 'Unknown setup decision; review the current plan');
      const reviewed = {...plan.setup?.decisions, ...decisions};
      check(questions.every(question => reviewed[question]?.trim()), 'Setup review incomplete: supply a decision for each question with --decision key=value');
      rig.approval = {fingerprint, decisions:reviewed};
      await this.write(rig);
      return publicPlan(await resolve(rig, new Set(), false));
    });
  }
  ownedPorts(rig: Rig) {
    return new Set(Object.entries(rig.launches).filter(([,launch]) => launch.state === 'running').flatMap(([id]) => Object.values(rig.allocation?.services[id]?.endpoints ?? {}).map(endpoint => endpoint.port)));
  }
  async up(name: string, reviewedFingerprint?: string, serviceId?: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => this.upLocked(await this.get(initial.id),reviewedFingerprint,serviceId));
  }
  async restart(name: string, reviewedFingerprint?: string, serviceId?: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => {
      const rig = await this.get(initial.id), plan = await resolve(rig,new Set(),false);
      check(plan.order.length, 'This rig only observes external apps; there are no managed services to restart');
      if (serviceId) check(Object.hasOwn(plan.services,serviceId), `Unknown service ${serviceId}`);
      if (reviewedFingerprint) check(reviewedFingerprint === plan.review.fingerprint,'Preview changed; review the current configuration before restarting');
      if (plan.setup || rig.approval) check(plan.review.approved,'Setup review incomplete or stale: approve the current configuration before restarting');
      const selected = new Set<string>();
      const include = (id: string) => { if (selected.has(id)) return; selected.add(id); for (const dependency of plan.services[id].depends_on) include(dependency); };
      if (serviceId) include(serviceId); else plan.order.forEach(include);
      for (const id of selected) await launchEnv(plan.services[id]);
      // Hold the same rig lease throughout stop/start and retain reservations until replacement or explicit down.
      await this.downLocked(rig,serviceId,true);
      return this.upLocked(await this.get(rig.id),reviewedFingerprint,serviceId);
    });
  }
  async upLocked(rig: Rig, reviewedFingerprint?: string, serviceId?: string) {
      const operation = randomUUID();
      reconcile(rig, await this.core.terminals());
      await this.write(rig);
      check(!Object.values(rig.launches).some(l => l.state === 'unknown' || l.state === 'intent'), 'Unresolved launch; run down to reconcile, then up');
      let plan: Plan, order: string[] = [];
      // Cross-rig worktree and port claims are committed together, before any launch.
      await this.store.lock('registry', async () => {
        const data = await this.store.load();
        const reserved = reservedPorts(data, rig.id);
        plan = await resolve(rig, reserved, true, this.ownedPorts(rig));
        check(plan.order.length, 'This rig only observes external apps; there are no managed services to start');
        const selected = new Set<string>();
        const include = (id: string) => {
          check(Object.hasOwn(plan.services,id), `Unknown service ${id}`);
          if (selected.has(id)) return;
          selected.add(id);
          for (const dependency of plan.services[id].depends_on) include(dependency);
        };
        if (serviceId) include(serviceId); else plan.order.forEach(include);
        order = plan.order.filter(id => selected.has(id));
        if (reviewedFingerprint) check(reviewedFingerprint === plan.review.fingerprint, 'Preview changed; run plan again before starting');
        if (plan.setup || rig.approval) check(plan.review.approved, 'Setup review incomplete or stale: review rig plan, then run rig approve with its review fingerprint');
        for (const other of Object.values(data.rigs)) if (other.id !== rig.id && other.claimed) {
          for (const selection of Object.values(plan.checkouts))
            check(!Object.values(other.allocation?.checkouts ?? {}).some(c => c.root === selection.root), `Checkout ${selection.root} is claimed by rig ${other.name}`);
        }
        for (const [id, launch] of Object.entries(rig.launches)) if (launch.state === 'running')
          check(plan.services[id]?.fingerprint === launch.fingerprint, `${id}: configuration drift; down then up to apply changes`);
        // Resolve all secrets before claiming or starting any process.
        for (const id of order) await launchEnv(plan.services[id]);
        rig.allocation = plan; rig.allocation.assignments = 'allocated'; rig.claimed = true; rig.error = undefined;
        rig.ports = Object.fromEntries(Object.entries(plan.endpoints).map(([id,e]) => [id,e.port]));
        data.rigs[rig.id] = rig; await this.store.save(data);
      });
      try {
        for (const id of order) {
          const service = rig.allocation!.services[id];
          for (const external of service.external_checks ?? []) await waitExternal(external);
          let launch = rig.launches[id];
          if (launch?.state !== 'running') {
            // A previously allocated port must still be free when retrying a missing slot.
            for (const ep of Object.values(service.endpoints)) check(await available(ep.port), `${id}: reserved port ${ep.port} is occupied`);
            const launchId = randomUUID();
            launch = { id: launchId, operation, service: id, fingerprint: service.fingerprint,
              labels: { 'rig.id': rig.id, 'rig.service': id, 'rig.launch': launchId }, state: 'intent', created: now() };
            rig.launches[id] = launch; await this.write(rig);
            const terminal = await this.core.start(service.argv, service.cwd, await launchEnv(service), launch.labels);
            launch.terminal = terminal.address; launch.state = 'running'; await this.write(rig);
          }
          await this.waitReady(service, launch);
        }
        await this.write(rig);
        return this.status(rig.id);
      } catch (error) {
        // Never persist application errors or Core parameters, which could contain credentials.
        rig.error = error instanceof Error ? error.message : 'Startup failed';
        for (const id of [...rig.allocation!.order].reverse()) {
          const launch = rig.launches[id];
          if (launch?.operation !== operation || launch.state === 'exited') continue;
          try {
            const terminals = await this.core.terminals(), terminal = owned(launch, terminals);
            if (terminal) {
              launch.terminal = terminal.address;
              // Diagnostics must never prevent stopping a verified owned launch.
              try {
                const env = await launchEnv(rig.allocation!.services[id]);
                let excerpt = (await this.core.read(terminal.address)).slice(-8192);
                for (const key of Object.keys(rig.allocation!.services[id].secrets)) if (env[key]) excerpt = excerpt.split(env[key]).join('<secret>');
                launch.excerpt = excerpt;
              } catch { /* History or secret sources can disappear during startup. */ }
              await this.stopLaunch(launch);
            } else {
              // A timed-out start can still be accepted later; preserve its reservation.
              launch.state = 'unknown'; launch.error = 'Start outcome unresolved; retry down after Core reconciles';
            }
          } catch { launch.state = 'unknown'; launch.error = 'Cleanup pending; restore Core access and run down'; }
        }
        rig.claimed = Object.values(rig.launches).some(l => l.state !== 'exited');
        await this.write(rig); throw new Error(rig.error);
      }
  }
  async waitReady(service: ResolvedService, launch: Launch) {
    const deadline = Date.now() + (service.readiness?.timeout ?? 1) * 1000;
    do {
      const terminal = owned(launch, await this.core.terminals());
      check(terminal?.state === 'live' && terminal.reason !== 'spawn_pending', `${service.id}: process exited or unavailable during startup`);
      if (await probe(service, Math.max(1, Math.min(1000, deadline - Date.now())))) return;
      await sleep(150);
    } while (Date.now() < deadline);
    throw new Error(`${service.id}: readiness deadline exceeded; inspect logs`);
  }
  async stopLaunch(launch: Launch) {
    const terminal = owned(launch, await this.core.terminals());
    if (!terminal) {
      // The start RPC is bounded to 25s. Do not race an in-flight acceptance.
      check(Date.now() - Date.parse(launch.created) > 30000, `${launch.service}: start may still be in flight; retry down after 30 seconds`);
      launch.state = 'exited'; return;
    }
    launch.terminal = terminal.address;
    if (terminal.state !== 'finished') await this.core.stop(terminal.address);
    const stopped = owned(launch, await this.core.terminals());
    check(!stopped || stopped.state === 'finished', `${launch.service}: stop not confirmed; reservations retained`);
    launch.state = 'exited'; launch.error = undefined;
  }
  async down(name: string, serviceId?: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => this.downLocked(await this.get(initial.id),serviceId));
  }
  async downLocked(rig: Rig, serviceId?: string, retainClaims = false) {
      if (serviceId && !Object.hasOwn(rig.launches,serviceId) && !Object.hasOwn(rig.allocation?.services ?? {},serviceId)) {
        const current = await resolve(rig,new Set(),false);
        check(Object.hasOwn(current.services,serviceId), `Unknown service ${serviceId}`);
      }
      const errors: string[] = [];
      for (const id of [...(rig.allocation?.order ?? Object.keys(rig.launches))].reverse()) {
        if (serviceId && id !== serviceId) continue;
        const launch = rig.launches[id]; if (!launch || launch.state === 'exited') continue;
        try { await this.stopLaunch(launch); } catch (error) { launch.state = 'unknown'; errors.push((error as Error).message); }
        await this.write(rig);
      }
      rig.claimed = (retainClaims && rig.claimed) || Object.values(rig.launches).some(l => l.state !== 'exited');
      const listeners = [];
      for (const endpoint of Object.values(serviceId ? rig.allocation?.services[serviceId]?.endpoints ?? {} : rig.allocation?.endpoints ?? {})) if (!await available(endpoint.port)) listeners.push(endpoint.port);
      rig.error = errors.length ? errors.join('; ') : undefined;
      await this.write(rig);
      check(!errors.length, errors.join('; '));
      return { ...(await this.status(rig.id)), listeners_still_present: listeners };
  }
  async logs(name: string, service: string) {
    const rig = await this.get(name), launch = rig.launches[service]; check(launch, 'Service has no launch history');
    try {
      const terminal = owned(launch, await this.core.terminals()); check(terminal, 'Terminal history unavailable');
      let text = await this.core.read(terminal.address);
      const spec = rig.allocation?.services[service];
      if (spec) {
        const env = await launchEnv(spec);
        for (const key of Object.keys(spec.secrets)) if (env[key]) text = text.split(env[key]).join('<secret>');
      }
      return { service, terminal: terminal.address, text, source: 'core' };
    } catch { return { service, text: launch.excerpt ?? 'Output unavailable; restore Core access', source: 'saved excerpt' }; }
  }
  async status(name?: string, directory?: string) {
    const requested = name ? (await this.get(name)).id : undefined;
    const rigs = Object.values((await this.store.load()).rigs);
    const selected = directory ? await checkout(directory) : undefined;
    let terminals: Terminal[] = [], core = 'available';
    try { terminals = await this.core.terminals(); } catch { core = 'unavailable'; }
    const results = [], catalog: ConnectionRig[] = [];
    // Observers use current definitions independently of a managed service's saved launch allocation.
    const definitions = new Map<string, Plan>();
    await Promise.all(rigs.map(async rig => {
      try { definitions.set(rig.id, await resolve(rig, new Set(), false)); }
      catch { if (rig.allocation) definitions.set(rig.id, rig.allocation); }
    }));
    const allApps = [...definitions.values()].flatMap(plan => Object.values(plan.observed_apps ?? {}));
    const observe = this.observer.session();
    for (const rig of rigs.sort((a,b) => Number(b.claimed) - Number(a.claimed) || a.name.localeCompare(b.name))) {
      const checkouts: Record<string, unknown> = {};
      for (const [repo, root] of Object.entries(rig.checkouts)) {
        try { checkouts[repo] = { ...await checkout(root), contributes: root === selected?.root }; }
        catch { checkouts[repo] = { ...rig.checkout_bindings?.[repo], root, stale: true, error: 'Checkout missing; stop and explicitly repair mapping' }; }
      }
      let display = rig.allocation;
      if (!display || !rig.claimed) display = definitions.get(rig.id) ?? display;
      const observed_apps = await observe(definitions.get(rig.id)?.observed_apps ?? {}, allApps);
      const services: Record<string, unknown> = {}, readiness: Record<string,string> = {};
      for (const [id, spec] of Object.entries(display?.services ?? {})) {
        const launch = rig.launches[id]; let terminal: Terminal | undefined, error = launch?.error;
        try { terminal = launch && owned(launch, terminals); } catch (e) { error = (e as Error).message; }
        const state = !launch || launch.state === 'exited' ? 'stopped' : core !== 'available' ? 'unknown' : terminal?.state === 'finished' ? 'exited' : terminal?.state === 'live' ? terminal.reason === 'spawn_pending' ? 'starting' : 'running' : 'unknown';
        readiness[id] = state !== 'running' ? 'unavailable' : spec.readiness ? await probe(spec) ? 'ready' : 'failed' : 'not configured';
        const external_observations = await Promise.all((spec.external_checks ?? []).map(async ext => ({ key: ext.key, url: ext.url, readiness: state !== 'running' ? 'not checked' : core !== 'available' ? 'unavailable' : await probeURL(ext.url, ext.kind) ? 'ready' : 'failed', ownership: 'external' })));
        services[id] = { external_dependencies: external_observations, id, repo: spec.repo, cwd: spec.cwd, env: spec.env, data_scope: spec.data_scope, state, readiness: readiness[id],
          terminal: terminal?.address ?? launch?.terminal, launch_id: launch?.id, endpoints: spec.endpoints, assignments: state === 'unknown' ? 'last known' : rig.claimed ? 'allocated' : rig.allocation ? 'preferred' : 'proposed, unreserved',
          checkout_match: selected?.root === rig.checkouts[spec.repo], observed_at: now(), error, exit_code: terminal?.exit_code };
      }
      for (const [id, spec] of Object.entries(display?.services ?? {})) {
        const observation = services[id] as {state:string;degraded_dependencies?:string[]};
        observation.degraded_dependencies = observation.state === 'running' ? spec.depends_on.filter(dep => readiness[dep] !== 'ready') : [];
      }
      catalog.push({id:rig.id,name:rig.name,claimed:rig.claimed,services:Object.fromEntries(Object.entries(display?.services ?? {}).map(([id,spec]) => [id,{
        state:(services[id] as {state:string}).state,
        endpoints:spec.endpoints,
        external_bindings:spec.external_bindings ?? (spec.external_checks ?? []).map(item => ({key:item.key,url:spec.env[item.key] ?? item.url})),
        external_dependencies:(services[id] as {external_dependencies:{key:string;readiness:string}[]}).external_dependencies,
      }]))});
      results.push({ id: rig.id, name: rig.name, profile: rig.profile, claimed: rig.claimed, review_required: !!display?.setup && !display.review?.approved, checkouts, services, observed_apps, error: rig.error });
    }
    const visible = results.filter(rig => (!requested || rig.id === requested) && (!selected || Object.values(rig.checkouts).some(checkout => (checkout as {root:string}).root === selected.root)));
    const visibleIds = new Set(visible.map(rig => rig.id));
    return { core, observed_at: now(), rigs:visible, connections:rigConnections(catalog).filter(link => visibleIds.has(link.consumer.rig) || visibleIds.has(link.provider.rig)) };
  }
}
