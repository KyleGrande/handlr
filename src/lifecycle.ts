import { randomUUID } from 'node:crypto';
import { probeURL, waitExternal } from './probe.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.js';
import { Core, type CoreAPI } from './core.js';
import { available, checkout, launchEnv, publicPlan, resolve } from './profile.js';
import { now, requireValue as check, type Launch, type Rig, type Terminal, type ResolvedService, type Plan } from './types.js';

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
  constructor(readonly store = new Store(), readonly core: CoreAPI = new Core()) {}
  async get(name: string) {
    const registry = await this.store.load();
    const rig = (Object.hasOwn(registry.rigs, name) ? registry.rigs[name] : undefined) ?? Object.values(registry.rigs).find(r => r.name === name);
    check(rig, `Unknown rig ${name}; create it first`); return rig;
  }
  async write(rig: Rig) { await this.store.lock('registry', async () => { const data = await this.store.load(); data.rigs[rig.id] = rig; await this.store.save(data); }); }
  async create(name: string, profile: string, selections: Record<string,string>) {
    check(typeof name === 'string' && name.trim().length > 0, 'Choose a nonempty rig name');
    const rig: Rig = { id: randomUUID(), name, profile, checkouts: selections, ports: {}, launches: {}, claimed: false };
    const plan = await resolve(rig, new Set(), false);
    rig.checkouts = Object.fromEntries(Object.entries(plan.checkouts).map(([id,c]) => [id,c.root]));
    rig.checkout_bindings = plan.checkouts;
    await this.store.lock('registry', async () => {
      const data = await this.store.load(); check(!Object.values(data.rigs).some(r => r.name === name), `Rig ${name} already exists`);
      data.rigs[rig.id] = rig; await this.store.save(data);
    });
    return { id: rig.id, name: rig.name, plan: publicPlan(plan) };
  }
  async configure(name: string, selections: Record<string,string>) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => {
      const rig = await this.get(initial.id); check(!rig.claimed, 'Stop the rig before changing worktrees');
      rig.checkouts = { ...rig.checkouts, ...selections };
      const plan = await resolve(rig, new Set(), false);
      rig.checkouts = Object.fromEntries(Object.entries(plan.checkouts).map(([id,c]) => [id,c.root]));
      rig.checkout_bindings = plan.checkouts;
      await this.write(rig); return publicPlan(plan);
    });
  }
  async plan(name: string) {
    const rig = await this.get(name);
    return publicPlan(await resolve(rig, new Set(), true, this.ownedPorts(rig)));
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
  async up(name: string, reviewedFingerprint?: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => {
      const rig = await this.get(initial.id), operation = randomUUID();
      reconcile(rig, await this.core.terminals());
      await this.write(rig);
      check(!Object.values(rig.launches).some(l => l.state === 'unknown' || l.state === 'intent'), 'Unresolved launch; run down to reconcile, then up');
      let plan: Plan;
      // Cross-rig worktree and port claims are committed together, before any launch.
      await this.store.lock('registry', async () => {
        const data = await this.store.load(), reserved = new Set<number>();
        for (const other of Object.values(data.rigs)) if (other.id !== rig.id && other.claimed) {
          for (const endpoint of Object.values(other.allocation?.endpoints ?? {})) reserved.add(endpoint.port);
        }
        plan = await resolve(rig, reserved, true, this.ownedPorts(rig));
        if (reviewedFingerprint) check(reviewedFingerprint === plan.review.fingerprint, 'Preview changed; run plan again before starting');
        if (plan.setup || rig.approval) check(plan.review.approved, 'Setup review incomplete or stale: review rig plan, then run rig approve with its review fingerprint');
        for (const other of Object.values(data.rigs)) if (other.id !== rig.id && other.claimed) {
          for (const selection of Object.values(plan.checkouts))
            check(!Object.values(other.allocation?.checkouts ?? {}).some(c => c.root === selection.root), `Checkout ${selection.root} is claimed by rig ${other.name}`);
        }
        for (const [id, launch] of Object.entries(rig.launches)) if (launch.state === 'running')
          check(plan.services[id]?.fingerprint === launch.fingerprint, `${id}: configuration drift; down then up to apply changes`);
        // Resolve all secrets before claiming or starting any process.
        for (const service of Object.values(plan.services)) await launchEnv(service);
        rig.allocation = plan; rig.allocation.assignments = 'allocated'; rig.claimed = true; rig.error = undefined;
        rig.ports = Object.fromEntries(Object.entries(plan.endpoints).map(([id,e]) => [id,e.port]));
        data.rigs[rig.id] = rig; await this.store.save(data);
      });
      try {
        for (const id of rig.allocation!.order) {
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
    });
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
  async down(name: string) {
    const initial = await this.get(name);
    return this.store.lock(initial.id, async () => {
      const rig = await this.get(initial.id);
      const errors: string[] = [];
      for (const id of [...(rig.allocation?.order ?? Object.keys(rig.launches))].reverse()) {
        const launch = rig.launches[id]; if (!launch || launch.state === 'exited') continue;
        try { await this.stopLaunch(launch); } catch (error) { launch.state = 'unknown'; errors.push((error as Error).message); }
        await this.write(rig);
      }
      rig.claimed = Object.values(rig.launches).some(l => l.state !== 'exited');
      const listeners = [];
      for (const endpoint of Object.values(rig.allocation?.endpoints ?? {})) if (!await available(endpoint.port)) listeners.push(endpoint.port);
      rig.error = errors.length ? errors.join('; ') : undefined;
      await this.write(rig);
      check(!errors.length, errors.join('; '));
      return { ...(await this.status(rig.id)), listeners_still_present: listeners };
    });
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
    let rigs = name ? [await this.get(name)] : Object.values((await this.store.load()).rigs);
    const selected = directory ? await checkout(directory) : undefined;
    if (selected) rigs = rigs.filter(r => Object.values(r.checkouts).includes(selected.root));
    let terminals: Terminal[] = [], core = 'available';
    try { terminals = await this.core.terminals(); } catch { core = 'unavailable'; }
    const results = [];
    for (const rig of rigs.sort((a,b) => Number(b.claimed) - Number(a.claimed) || a.name.localeCompare(b.name))) {
      const checkouts: Record<string, unknown> = {};
      for (const [repo, root] of Object.entries(rig.checkouts)) {
        try { checkouts[repo] = { ...await checkout(root), contributes: root === selected?.root }; }
        catch { checkouts[repo] = { ...rig.checkout_bindings?.[repo], root, stale: true, error: 'Checkout missing; stop and explicitly repair mapping' }; }
      }
      let display = rig.allocation;
      if (!display || !rig.claimed) { try { display = await resolve(rig, new Set(), false); } catch {} }
      const services: Record<string, unknown> = {}, readiness: Record<string,string> = {};
      for (const [id, spec] of Object.entries(display?.services ?? {})) {
        const launch = rig.launches[id]; let terminal: Terminal | undefined, error = launch?.error;
        try { terminal = launch && owned(launch, terminals); } catch (e) { error = (e as Error).message; }
        const state = !launch || launch.state === 'exited' ? 'stopped' : core !== 'available' ? 'unknown' : terminal?.state === 'finished' ? 'exited' : terminal?.state === 'live' ? terminal.reason === 'spawn_pending' ? 'starting' : 'running' : 'unknown';
        readiness[id] = state !== 'running' ? 'unavailable' : spec.readiness ? await probe(spec) ? 'ready' : 'failed' : 'not configured';
        const external_observations = await Promise.all((spec.external_checks ?? []).map(async ext => ({ key: ext.key, url: ext.url, readiness: core !== 'available' ? 'unavailable' : await probeURL(ext.url, ext.kind) ? 'ready' : 'failed', ownership: 'external' })));
        services[id] = { external_dependencies: external_observations, id, repo: spec.repo, cwd: spec.cwd, env: spec.env, data_scope: spec.data_scope, state, readiness: readiness[id],
          terminal: terminal?.address ?? launch?.terminal, launch_id: launch?.id, endpoints: spec.endpoints, assignments: state === 'unknown' ? 'last known' : rig.claimed ? 'allocated' : rig.allocation ? 'preferred' : 'proposed, unreserved',
          checkout_match: selected?.root === rig.checkouts[spec.repo], observed_at: now(), error, exit_code: terminal?.exit_code };
      }
      for (const [id, spec] of Object.entries(display?.services ?? {})) (services[id] as Record<string,unknown>).degraded_dependencies = spec.depends_on.filter(dep => readiness[dep] !== 'ready');
      results.push({ id: rig.id, name: rig.name, profile: rig.profile, claimed: rig.claimed, review_required: !!display?.setup && !display.review?.approved, checkouts, services, error: rig.error });
    }
    return { core, observed_at: now(), rigs: results };
  }
}
