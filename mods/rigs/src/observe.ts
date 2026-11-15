import path from 'node:path';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Core } from './core.js';
import { now, requireValue as check, type AppObservation, type BuildStatus, type ObservedApp, type ObservedProcess, type ProcessPlatform, type ResolvedObservedApp } from './types.js';

const exec = promisify(execFile);
const platforms = ['win32', 'darwin', 'linux'];
export function validateObservedApp(app: ObservedApp, id: string) {
  check(app && typeof app === 'object' && !Array.isArray(app), `${id}: invalid observed app`);
  check(Object.keys(app).every(key => ['repo','process_name','executable','platform','machine','build_status_file','development'].includes(key)), `${id}: unknown observed app field; observations cannot declare lifecycle commands`);
  check(typeof app.process_name === 'string' && app.process_name.trim() && app.process_name.length <= 255 && !/[\\/\x00-\x1f*?]/.test(app.process_name), `${id}: process_name must be an exact executable name`);
  check(app.platform === undefined || platforms.includes(app.platform), `${id}: unsupported process platform`);
  check(app.machine === undefined || typeof app.machine === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(app.machine), `${id}: invalid Herdr machine name`);
  check(!app.machine || app.platform === 'win32', `${id}: remote observations currently require platform win32`);
  check(app.executable === undefined || typeof app.executable === 'string' && app.executable.trim() && !/[\x00-\x1f]/.test(app.executable), `${id}: invalid executable path`);
  if (app.machine && app.executable) check(path.win32.isAbsolute(app.executable), `${id}: remote executable must be an absolute Windows path`);
  if (app.build_status_file !== undefined) {
    const report = app.build_status_file;
    check(report && typeof report === 'object' && !Array.isArray(report)
      && Object.keys(report).every(key => ['path','max_age_seconds'].includes(key)), `${id}: invalid build status file`);
    check(!app.machine && (!app.platform || app.platform === process.platform), `${id}: build status files require a local observation`);
    check(typeof report.path === 'string' && report.path.trim() && !/[\x00-\x1f]/.test(report.path), `${id}: invalid build status path`);
    check(report.max_age_seconds === undefined || Number.isFinite(report.max_age_seconds) && report.max_age_seconds >= 1 && report.max_age_seconds <= 3600, `${id}: invalid build status age`);
  }
  if (app.development !== undefined) {
    const tools = app.development;
    check(!app.machine && !!app.build_status_file, `${id}: development tools require a local build status file`);
    check(tools && typeof tools === 'object' && !Array.isArray(tools) && Object.keys(tools).every(key => ['check','rebuild','relaunch'].includes(key)), `${id}: invalid development tools`);
    for (const [key, argv] of Object.entries(tools)) check(Array.isArray(argv) && argv.length > 0 && argv.length <= 128
      && argv.every(arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 8192 && !arg.includes('\0')), `${id}: ${key} requires an argv array`);
    check(Array.isArray(tools.check) && tools.check.length > 0, `${id}: development tools require a read-only check command`);
  }
}

export function resolveObservedApp(app: ObservedApp, root: string): ResolvedObservedApp {
  const platform = app.platform ?? process.platform;
  check(platforms.includes(platform), 'Process observation supports Windows, macOS and Linux');
  const executable = app.executable && (app.machine || platform !== process.platform
    ? app.executable : path.resolve(root, app.executable));
  return {...app, platform: platform as ProcessPlatform, ...(executable ? {executable} : {}),
    ...(app.build_status_file ? {build_status_file: {...app.build_status_file, path:path.resolve(root, app.build_status_file.path)}} : {}),
    ...(app.development ? {cwd:root} : {})};
}

/** Reports are data only: no profile-supplied commands are executed. */
export function parseBuildStatus(value: unknown, observation: AppObservation, time = Date.now()): BuildStatus {
  check(value && typeof value === 'object', 'Invalid build status report');
  const report = value as Record<string, unknown>;
  check(report.schema_version === 1 && typeof report.observed_at === 'string', 'Invalid build status report');
  const observed = Date.parse(report.observed_at);
  check(Number.isFinite(observed) && observed <= time + 5000 && time - observed <= (observation.build_status_file?.max_age_seconds ?? 90) * 1000, 'Build status report expired; refresh the build checker');
  check(['current','untracked','rebuild_required','restart_required','not_running','unknown'].includes(String(report.state)), 'Invalid build status state');
  check(typeof report.label === 'string' && report.label.length > 0 && report.label.length <= 128
    && typeof report.reason === 'string' && report.reason.length <= 2048, 'Invalid build status details');
  check(Array.isArray(report.processes), 'Build status process identities unavailable');
  const identities = report.processes as Record<string, unknown>[];
  check(observation.matches.every(process => identities.some(identity => identity && identity.pid === process.pid
    && typeof identity.started_at === 'string' && Date.parse(identity.started_at) === Date.parse(process.started_at))), 'Build status does not cover the running process; refresh the build checker');
  return { state:report.state === 'current' ? 'current' : report.state === 'unknown' ? 'unknown' : 'attention', label:report.label, reason:report.reason };
}

export async function observeBuildStatus(observation: AppObservation): Promise<AppObservation> {
  if (!observation.build_status_file || observation.state === 'unknown') return observation;
  try {
    if (observation.development) {
      let fresh = false;
      try {
        const report = JSON.parse(await fs.readFile(observation.build_status_file.path, 'utf8'));
        parseBuildStatus(report, observation);
        fresh = Date.now() - Date.parse(report.observed_at) < 10000;
      } catch { /* Missing/stale reports trigger the configured read-only checker. */ }
      if (!fresh) {
        const [program, ...args] = observation.development.check;
        await exec(program, args, {cwd:observation.cwd,timeout:10000,maxBuffer:1024 * 1024});
      }
    } else if (observation.state !== 'running') return observation;
    const file = await fs.open(observation.build_status_file.path, constants.O_RDONLY | constants.O_NONBLOCK);
    let content: string;
    try {
      const stat = await file.stat();
      check(stat.isFile() && stat.size <= 1024 * 1024, 'Build status report must be a regular file no larger than 1 MiB');
      content = await file.readFile('utf8');
    } finally { await file.close(); }
    return {...observation, build_status:parseBuildStatus(JSON.parse(content), observation)};
  } catch (error) {
    return {...observation, build_status:{state:'unknown',label:'Build status unavailable',reason:error instanceof Error ? error.message : 'Cannot read build status report'}};
  }
}

export type ProcessQuery = (apps: ResolvedObservedApp[]) => Promise<ObservedProcess[]>;

/** Only name, executable path and process identity leave the collector; never command lines or environment. */
export function windowsProcessCommand(names: string[]): string[] {
  const encodedNames = Buffer.from(JSON.stringify(names)).toString('base64');
  const script = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$names = @([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedNames}')) | ConvertFrom-Json)
$rows = @(Get-CimInstance Win32_Process -Property Name,ProcessId,ExecutablePath,CreationDate | Where-Object { $names -contains $_.Name } | ForEach-Object {
  [pscustomobject]@{ pid = [int]$_.ProcessId; name = $_.Name; executable = $_.ExecutablePath; started_at = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }) }
})
ConvertTo-Json -InputObject @($rows) -Compress`;
  return ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

export function parseWindowsProcesses(output: string): ObservedProcess[] {
  const rows: unknown = JSON.parse(output.replace(/^\uFEFF/, '').trim());
  check(Array.isArray(rows), 'Invalid process observation response');
  return rows.map(row => {
    check(row && typeof row === 'object', 'Invalid process identity');
    const item = row as Record<string, unknown>;
    check(Number.isInteger(item.pid) && Number(item.pid) > 0 && typeof item.name === 'string' && typeof item.started_at === 'string' && Number.isFinite(Date.parse(item.started_at)), 'Process identity unavailable');
    check(item.executable === null || item.executable === undefined || typeof item.executable === 'string', 'Invalid executable path');
    return {pid: Number(item.pid), name: item.name, started_at: new Date(item.started_at).toISOString(), ...(item.executable ? {executable: String(item.executable)} : {})};
  });
}

async function queryProcesses(apps: ResolvedObservedApp[]): Promise<ObservedProcess[]> {
  const {platform, machine} = apps[0];
  if (!machine) check(platform === process.platform, `Observer is on ${process.platform}; configure a connected Windows machine to observe ${platform}`);
  if (platform === 'win32') {
    const argv = windowsProcessCommand([...new Set(apps.map(app => app.process_name))]);
    let output: string;
    if (machine) {
      const result = await new Core().call<{code?: number; stdout: string; timed_out: boolean; truncated: boolean}>('machine.exec', {on:machine, argv, timeout:6});
      check(result.code === 0 && !result.timed_out && !result.truncated, 'Windows process query failed or timed out');
      output = Buffer.from(result.stdout, 'base64').toString('utf8');
    } else output = (await exec(argv[0], argv.slice(1), {timeout:6000, maxBuffer:1024 * 1024, windowsHide:true})).stdout;
    return parseWindowsProcesses(output);
  }
  const output = (await exec('ps', ['-A', '-o', 'pid=,lstart=,comm='], {timeout:6000, maxBuffer:8 * 1024 * 1024, env:{...process.env, LC_ALL:'C'}})).stdout;
  const rows: ObservedProcess[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+?)\s*$/);
    if (!match) continue;
    const pid = Number(match[1]), command = match[3], shortName = path.basename(command);
    // Linux comm can be truncated; /proc gives the exact executable for these candidates.
    if (!apps.some(app => app.process_name === shortName || platform === 'linux' && app.process_name.startsWith(shortName))) continue;
    let executable = path.isAbsolute(command) ? command : undefined;
    if (platform === 'linux') {
      try { executable = await fs.readlink(`/proc/${pid}/exe`); }
      catch { /* A process can exit, or its path can be inaccessible. Do not guess its path. */ }
    }
    const started = Date.parse(match[2]);
    check(Number.isFinite(started), 'Process start time unavailable');
    rows.push({pid, name:executable ? path.basename(executable) : shortName, started_at:new Date(started).toISOString(), ...(executable ? {executable} : {})});
  }
  return rows;
}

const normalize = (value: string, platform: ProcessPlatform) => platform === 'win32' ? path.win32.normalize(value).toLowerCase() : path.posix.normalize(value);
export function matchObservedApp(id: string, app: ResolvedObservedApp, processes: ObservedProcess[]): AppObservation {
  const named = processes.filter(item => normalize(item.name, app.platform) === normalize(app.process_name, app.platform));
  const matches = named.filter(item => !app.executable || item.executable && normalize(item.executable, app.platform) === normalize(app.executable, app.platform))
    .sort((a,b) => a.pid - b.pid || a.started_at.localeCompare(b.started_at));
  const uncertain = !!app.executable && !matches.length && named.some(item => !item.executable);
  return {...app, id, ownership:'external', state:matches.length ? 'running' : uncertain ? 'unknown' : 'stopped', observed_at:now(), matches,
    ...(uncertain ? {error:'Executable path unavailable; cannot confirm which build is running'} : {})};
}

/** One bounded query per host per status request, shared across rigs. Nothing is persisted or adopted. */
export class ProcessObserver {
  constructor(readonly query: ProcessQuery = queryProcesses) {}
  session() {
    const snapshots = new Map<string, Promise<ObservedProcess[]>>();
    return async (apps: Record<string, ResolvedObservedApp>, allApps = Object.values(apps)): Promise<Record<string, AppObservation>> => {
      const entries = await Promise.all(Object.entries(apps).map(async ([id, app]) => {
        const key = JSON.stringify([app.machine ?? null, app.platform]);
        let snapshot = snapshots.get(key);
        if (!snapshot) {
          const group = allApps.filter(peer => peer.machine === app.machine && peer.platform === app.platform);
          snapshot = Promise.resolve().then(() => this.query(group)); snapshots.set(key, snapshot);
        }
        try { return [id, await observeBuildStatus(matchObservedApp(id, app, await snapshot))] as const; }
        catch { return [id, {...app, id, ownership:'external' as const, state:'unknown' as const, observed_at:now(), matches:[], error:`Process observation unavailable on ${app.machine ?? 'this computer'}; check access, platform and process tools`}] as const; }
      }));
      return Object.fromEntries(entries);
    };
  }
}
