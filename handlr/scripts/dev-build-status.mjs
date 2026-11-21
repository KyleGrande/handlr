// Read-only source/bundle/process comparison for the local Handlr Dev build.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundledModNames } from './mod-sources.mjs';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const installedApp = join(homedir(), 'Applications/Handlr Dev.app');
const inputs = ['Cargo.toml', 'Cargo.lock', 'build.rs', '.cargo', 'src', 'defaults', 'mods/bundled.txt', 'mods/frame', 'crates', 'vendor',
  'assets/icons', 'handlr/assets/icons/Handlr.icns', 'handlr/scripts/release-macos.mjs', 'handlr/scripts/toolchain.mjs',
  'handlr/scripts/dev-build-status.mjs', 'handlr/scripts/mod-sources.mjs'];
const excluded = new Set(['.git', 'target', 'node_modules', '.zig-cache', 'zig-cache', 'zig-out', 'dist', '.DS_Store']);
const digest = value => createHash('sha256').update(value).digest('hex');

export function sourceSnapshot(root = repoRoot) {
  const files = {};
  const visit = (relative, ancestors = new Set()) => {
    const absolute = join(root, relative);
    let info;
    try { info = lstatSync(absolute); }
    catch (error) { if (error.code === 'ENOENT') { files[relative] = 'missing'; return; } throw error; }
    if (info.isSymbolicLink()) {
      files[relative] = digest(`symlink:${readlinkSync(absolute)}`);
      const target = realpathSync(absolute);
      // Include symlink targets too: local dependency edits must invalidate a build.
      const targetInfo = lstatSync(target);
      if (targetInfo.isFile()) files[`${relative}/@target`] = digest(readFileSync(target));
      else if (targetInfo.isDirectory()) descend(relative, target, ancestors);
    } else if (info.isDirectory()) descend(relative, absolute, ancestors);
    else if (info.isFile()) files[relative] = digest(readFileSync(absolute));
  };
  const descend = (relative, absolute, ancestors) => {
    const canonical = realpathSync(absolute);
    if (ancestors.has(canonical)) throw new Error(`Cyclic source directory: ${relative}`);
    const next = new Set(ancestors).add(canonical);
    for (const name of readdirSync(absolute).sort()) {
      if (excluded.has(name) || name === 'jsconfig.json' || name.endsWith('.d.ts')) continue;
      visit(`${relative}/${name}`, next);
    }
  };
  for (const input of [...inputs, ...bundledModNames(root).map(name => `mods/${name}`)]) visit(input);
  const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { fingerprint: digest(JSON.stringify(entries)), files: Object.fromEntries(entries) };
}

// LC_UUID identifies linked code and remains stable when the bundle is signed.
export function executableId(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected a 64-bit macOS executable');
  let offset = 32;
  for (let count = bytes.readUInt32LE(16); count > 0; count--) {
    if (offset + 8 > bytes.length) break;
    const command = bytes.readUInt32LE(offset), length = bytes.readUInt32LE(offset + 4);
    if (length < 8 || offset + length > bytes.length) break;
    if (command === 0x1b && length >= 24) return bytes.subarray(offset + 8, offset + 24).toString('hex');
    offset += length;
  }
  throw new Error('Executable build identity unavailable');
}

export function processSnapshot(executable) {
  const result = spawnSync('/bin/ps', ['-A', '-o', 'pid=,lstart=,comm='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, timeout: 5000 });
  if (result.error || result.status !== 0) throw new Error('Cannot inspect running Handlr Dev processes');
  const matches = [];
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+?)\s*$/);
    if (!match) continue;
    const suffix = '/Contents/MacOS/Herdr';
    const backupPrefix = executable.slice(0, -suffix.length) + '.backup-';
    const backup = match[3].startsWith(backupPrefix) && match[3].endsWith(suffix)
      && /^\d+$/.test(match[3].slice(backupPrefix.length, -suffix.length));
    if (match[3] !== executable && !backup) continue;
    const started = Date.parse(match[2]);
    if (!Number.isFinite(started)) throw new Error('Process start time unavailable');
    matches.push({ pid: Number(match[1]), started_at: new Date(started).toISOString() });
  }
  // When invoked by the badge, report its own host even if another copy is open.
  const host = matches.find(item => item.pid === process.ppid);
  return host ? [host] : matches;
}

export function compareBuild({ source, stamp, binaryId, processes, root }) {
  const result = (state, label, reason, changed = []) => ({ state, label, reason, changed, processes });
  if (!stamp) return result('untracked', 'Rebuild required', 'This bundle predates build tracking. Build and install once to establish its source snapshot.');
  if (stamp.schema_version !== 1 || !stamp.source?.files || typeof stamp.source.fingerprint !== 'string'
      || !Number.isFinite(Date.parse(stamp.packaged_at)) || typeof stamp.executable_id !== 'string') {
    return result('unknown', 'Build status unavailable', 'The installed build record is invalid.');
  }
  if (stamp.source_root !== root) return result('rebuild_required', 'Rebuild required', 'The installed app was built from a different checkout.');
  if (stamp.executable_id !== binaryId) return result('unknown', 'Build status unavailable', 'The installed executable does not match its build record.');
  const changed = [...new Set([...Object.keys(source.files), ...Object.keys(stamp.source.files)])]
    .filter(file => source.files[file] !== stamp.source.files[file]);
  if (source.fingerprint !== stamp.source.fingerprint) return result('rebuild_required', 'Rebuild required', `${changed.length} build input${changed.length === 1 ? '' : 's'} changed since this app was built.`, changed);
  if (!processes.length) return result('not_running', 'Dev app not running', 'The installed build matches the source. Open Handlr Dev to use it.');
  // ps has one-second resolution. Treat the installation second conservatively.
  const packaged = Math.ceil(Date.parse(stamp.packaged_at) / 1000) * 1000;
  if (processes.some(item => Date.parse(item.started_at) < packaged)) return result('restart_required', 'Reopen Handlr Dev', 'The installed build is current, but a running copy started before it was packaged. Quit and reopen when ready.');
  return result('current', 'Handlr Dev in sync', 'The source, installed build, and running app match.');
}

export function status({ root = repoRoot, app = installedApp } = {}) {
  root = realpathSync(root);
  const executable = join(app, 'Contents/MacOS/Herdr');
  let stamp;
  try { stamp = JSON.parse(readFileSync(join(app, 'Contents/Resources/dev-build-info.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const processes = processSnapshot(executable);
  if (!stamp) return compareBuild({ root, processes });
  return compareBuild({ root, processes, stamp, source: sourceSnapshot(root), binaryId: executableId(executable) });
}

export function writeStatusReport(state, path) {
  const report = { ...state, schema_version: 1, observed_at: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(report) + '\n');
  renameSync(temporary, path);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let state;
  try {
    state = status();
  } catch (error) {
    state = { state: 'unknown', label: 'Build status unavailable', reason: error.message, changed: [], processes: [] };
  }
  const reportIndex = process.argv.indexOf('--report-file');
  if (reportIndex >= 0) {
    if (!process.argv[reportIndex + 1]) throw new Error('--report-file requires a path');
    state = writeStatusReport(state, resolve(process.argv[reportIndex + 1]));
  }
  console.log(process.argv.includes('--json') ? JSON.stringify(state) : `${state.label}\n${state.reason}${state.changed.length ? '\n\nChanged inputs:\n' + state.changed.slice(0, 20).join('\n') : ''}`);
  // JSON consumers receive the state; Toolbox uses exit status for its ring.
  process.exitCode = process.argv.includes('--json') || state.state === 'current' ? 0 : 1;
}
