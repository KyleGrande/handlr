import path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Core } from './core.js';
import { now, requireValue as check, type AppObservation, type ObservedApp, type ObservedProcess, type ProcessPlatform, type ResolvedObservedApp } from './types.js';

const exec = promisify(execFile);
const platforms = ['win32', 'darwin', 'linux'];
export function validateObservedApp(app: ObservedApp, id: string) {
  check(app && typeof app === 'object' && !Array.isArray(app), `${id}: invalid observed app`);
  check(Object.keys(app).every(key => ['repo','process_name','executable','platform','machine'].includes(key)), `${id}: unknown observed app field; observations cannot declare lifecycle commands`);
  check(typeof app.process_name === 'string' && app.process_name.trim() && app.process_name.length <= 255 && !/[\\/\x00-\x1f*?]/.test(app.process_name), `${id}: process_name must be an exact executable name`);
  check(app.platform === undefined || platforms.includes(app.platform), `${id}: unsupported process platform`);
  check(app.machine === undefined || typeof app.machine === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(app.machine), `${id}: invalid Herdr machine name`);
  check(!app.machine || app.platform === 'win32', `${id}: remote observations currently require platform win32`);
  check(app.executable === undefined || typeof app.executable === 'string' && app.executable.trim() && !/[\x00-\x1f]/.test(app.executable), `${id}: invalid executable path`);
  if (app.machine && app.executable) check(path.win32.isAbsolute(app.executable), `${id}: remote executable must be an absolute Windows path`);
}

export function resolveObservedApp(app: ObservedApp, root: string): ResolvedObservedApp {
  const platform = app.platform ?? process.platform;
  check(platforms.includes(platform), 'Process observation supports Windows, macOS and Linux');
  const executable = app.executable && (app.machine || platform !== process.platform
    ? app.executable : path.resolve(root, app.executable));
  return {...app, platform: platform as ProcessPlatform, ...(executable ? {executable} : {})};
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
        try { return [id, matchObservedApp(id, app, await snapshot)] as const; }
        catch { return [id, {...app, id, ownership:'external' as const, state:'unknown' as const, observed_at:now(), matches:[], error:`Process observation unavailable on ${app.machine ?? 'this computer'}; check access, platform and process tools`}] as const; }
      }));
      return Object.fromEntries(entries);
    };
  }
}
