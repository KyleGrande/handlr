import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { machineID, fail, spaceID } from './model.js';
import type { AgentLifetime, ContextTarget } from './types.js';

const execute = promisify(execFile);
export interface CommandResult { code: number; stdout: string; stderr: string }
export type Runner = (program: string, args: string[], options?: { cwd?: string }) => Promise<CommandResult>;
export const run: Runner = async (program, args, options = {}) => {
  try {
    const r = await execute(program, args, { ...options, timeout: 15000, maxBuffer: 1024 * 1024, env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0' } });
    return { code: 0, ...r };
  } catch (e) {
    const error = e as Error & { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
    if (typeof error.code !== 'number' || error.killed) fail('resolution_failed', 'A required program could not run or its machine is unavailable.');
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
};
export async function localMachine(runner: Runner = run): Promise<string> {
  const r = await runner('hc', ['server', 'status', '--json']);
  if (r.code !== 0) fail('identity_unavailable', 'Cannot resolve the local Core identity.');
  try { const data = JSON.parse(r.stdout); return machineID(data.core?.id ?? data.id); }
  catch { fail('identity_unavailable', 'Core did not return a permanent identity.'); }
}
/** Space IDs are durable entries in the Core's herdr-app document, independent
 * of display name, CWD, branch and terminal. Remote host IDs carry a connection
 * prefix; only the bare Space ID plus permanent Core ID is persisted. */
export async function resolveSpace(space?: string, on?: string | null, runner: Runner = run, terminal = process.env.HC_TERMINAL_ID): Promise<ContextTarget> {
  let machine: string;
  if (on) {
    if (!space) fail('identity_unavailable', 'Choose an explicit Space ID for the remote machine.');
    const listed = await runner('hc', ['machine', 'ls', '--json']);
    try {
      const found = JSON.parse(listed.stdout).machines.find((m: { name: string }) => m.name === on);
      if (listed.code || found?.state !== 'connected') throw new Error();
      machine = machineID(found.id);
    } catch { fail('identity_unavailable', 'The selected machine is unavailable.'); }
    if (space.startsWith(`${on}/`)) space = space.slice(on.length + 1);
  } else machine = await localMachine(runner);
  if (!space) {
    if (!terminal || !/^t[0-9a-z]+$/.test(terminal)) fail('identity_unavailable', 'Use --space SPACE_ID, or copy the agent read command from the panel.');
    const r = await runner('hc', ['get', terminal, '--json']);
    try {
      const current = JSON.parse(r.stdout);
      if (r.code || current.address !== terminal || current.state !== 'live') throw new Error();
      space = spaceID(current.labels?.['herdr.space']);
    } catch { fail('identity_unavailable', 'This terminal has no verified Herdr Space. Use --space SPACE_ID from the panel.'); }
  }
  return { kind: 'space', machine, id: spaceID(space) };
}
/** The highlighted host agent selects a live process; a random stored binding
 * owns its notes. PID alone is never an owner or enough to reuse a binding. */
export async function agentLifetime(parent: ContextTarget, address: string, on?: string | null, runner: Runner = run): Promise<AgentLifetime> {
  if (parent.kind !== 'space') fail('invalid_input', 'Choose a Space first.');
  const bare = on && address.startsWith(`${on}/`) ? address.slice(on.length + 1) : address;
  if (!/^t[0-9a-z]+$/.test(bare)) fail('identity_unavailable', 'Select a live agent in Herdr.');
  const qualified = on ? `${on}/${bare}` : bare;
  const inspect = async () => {
    const r = await runner('hc', ['get', qualified, '--json']);
    try {
      const t = JSON.parse(r.stdout), pid = t.foreground?.pid;
      if (r.code || ![bare, qualified].includes(t.address) || t.state !== 'live' || !Number.isSafeInteger(t.created_ms) || t.created_ms <= 0 || !Number.isSafeInteger(pid) || pid <= 0) throw new Error();
      if (t.labels?.['herdr.space'] && t.labels['herdr.space'] !== parent.id) throw new Error();
      return { pid: pid as number, created: t.created_ms as number };
    } catch { fail('identity_unavailable', 'The selected agent process is unavailable. Its notes have not been reassigned.'); }
  };
  const before = await inspect();
  const args = ['-p', String(before.pid), '-o', 'lstart='];
  const ps = on ? await runner('hc', ['exec', '--on', on, 'env', 'LC_ALL=C', 'ps', ...args]) : await runner('ps', args);
  const started = ps.stdout.trim().replace(/\s+/g, ' ');
  if (ps.code || !/^[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(started)) fail('identity_unavailable', 'Cannot verify the selected agent process lifetime.');
  const after = await inspect();
  if (before.pid !== after.pid || before.created !== after.created) fail('identity_unavailable', 'The selected agent changed while loading. Retry.');
  return { machine: parent.machine, terminal: bare, terminal_created_ms: before.created, process_pid: before.pid, process_started_at: started };
}
