// Explicit Rigs action. Its parentless Core terminal survives app replacement.
import { spawnSync } from 'node:child_process';
import { openSync, closeSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { processSnapshot, installedApp } from './dev-build-status.mjs';
import { performDevAction } from './dev-app-lifecycle.mjs';
const handlr = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env.HERDR_APP_HOME || join(homedir(), '.config/handlr-dev');
const executable = join(installedApp, 'Contents/MacOS/Herdr');
const action = process.argv[2];
if (!['rebuild','relaunch'].includes(action)) throw new Error('Use rebuild or relaunch');
if (process.platform !== 'darwin') throw new Error('Handlr Dev actions currently require macOS');
mkdirSync(home, { recursive: true });
const lock = join(home, 'dev-app-action.lock');
let descriptor;
try { descriptor = openSync(lock, 'wx', 0o600); }
catch {
  const pid = Number(readFileSync(lock, 'utf8'));
  let running = true;
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid Handlr Dev action lock; inspect it before retrying.');
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; }
  if (running) throw new Error('Another Handlr Dev action is active; inspect its output before retrying.');
  rmSync(lock);
  descriptor = openSync(lock, 'wx', 0o600);
}
writeFileSync(descriptor, String(process.pid)); closeSync(descriptor);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: handlr, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}; Handlr Dev was not reopened.`);
};
try {
  await performDevAction({action,run,observe:()=>processSnapshot(executable),executable,app:installedApp,home,node:process.execPath,installed:()=>existsSync(executable)});
  console.log('Handlr Dev reopened. Core terminals remain running.');
} finally { rmSync(lock, { force: true }); }
