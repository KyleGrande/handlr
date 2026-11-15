import test from 'node:test';
import assert from 'node:assert/strict';
import { matchObservedApp, parseWindowsProcesses, ProcessObserver, validateObservedApp, windowsProcessCommand } from '../src/observe.js';
import { validate } from '../src/profile.js';
import type { ObservedProcess, ResolvedObservedApp } from '../src/types.js';

const app: ResolvedObservedApp = {repo:'app', process_name:'MyApp.exe', platform:'win32', machine:'windows-dev', executable:'C:\\work\\feature\\MyApp.exe'};
const processes: ObservedProcess[] = [
  {pid:41, name:'MyApp.exe', executable:'C:\\work\\main\\MyApp.exe', started_at:'2026-11-10T12:00:00.000Z'},
  {pid:42, name:'MYAPP.EXE', executable:'c:/work/feature/MyApp.exe', started_at:'2026-11-10T12:01:00.000Z'},
];

test('Windows app observations distinguish executable paths and preserve every process identity', () => {
  const observed = matchObservedApp('desktop', app, processes);
  assert.equal(observed.state, 'running');
  assert.equal(observed.ownership, 'external');
  assert.deepEqual(observed.matches.map(item => item.pid), [42]);
  const relaunched = matchObservedApp('desktop', app, [{...processes[1], started_at:'2026-11-10T12:02:00.000Z'}]);
  assert.notEqual(relaunched.matches[0].started_at, observed.matches[0].started_at, 'reused PIDs do not hide a new process instance');
  const {executable, ...byName} = app;
  assert.equal(matchObservedApp('desktop', byName, processes).matches.length, 2, 'name-only matches expose all instances instead of selecting one');
  assert.equal(matchObservedApp('desktop', app, [processes[0]]).state, 'stopped');
});

test('an inaccessible executable is unknown when a path is required', () => {
  const {executable, ...hiddenPath} = processes[1];
  const observation = matchObservedApp('desktop', app, [hiddenPath]);
  assert.equal(observation.state, 'unknown');
  assert.deepEqual(observation.matches, []);
  assert.match(observation.error!, /path unavailable/);
});

test('a status session queries each host once for every configured app and reports inaccessible hosts as unknown', async () => {
  const other = {...app, process_name:'Other.exe'};
  let calls = 0;
  const observe = new ProcessObserver(async apps => {
    calls++;
    assert.deepEqual(apps.map(item => item.process_name), ['MyApp.exe','Other.exe']);
    return processes;
  }).session();
  await observe({desktop:app}, [app, other]);
  await observe({other}, [app, other]);
  assert.equal(calls, 1);
  const failed = await new ProcessObserver(async () => { throw Error('offline'); }).session()({desktop:app});
  assert.equal(failed.desktop.state, 'unknown');
  assert.equal(failed.desktop.ownership, 'external');
  assert.deepEqual(failed.desktop.matches, []);
});

test('Windows collector encodes names as data and rejects incomplete process identities', () => {
  const command = windowsProcessCommand(["App'; Write-Output oops; '.exe"]);
  assert.equal(command[0], 'powershell.exe');
  assert.equal(command.at(-2), '-EncodedCommand');
  const script = Buffer.from(command.at(-1)!, 'base64').toString('utf16le');
  assert.ok(!script.includes('Write-Output oops'));
  assert.ok(!script.includes('CommandLine'));
  assert.deepEqual(parseWindowsProcesses('\uFEFF[]'), []);
  assert.throws(() => parseWindowsProcesses('[{"pid":42,"name":"MyApp.exe","started_at":null}]'), /identity unavailable/);
});

test('observed apps support monitor-only profiles and cannot contain lifecycle commands', () => {
  assert.deepEqual(validate({version:1, repos:['app'], services:{}, observed_apps:{desktop:app}}), []);
  assert.throws(() => validateObservedApp({...app, argv:['kill']} as typeof app, 'desktop'), /cannot declare lifecycle/);
  assert.throws(() => validateObservedApp({...app, process_name:'*.exe'}, 'desktop'), /exact executable/);
  assert.throws(() => validateObservedApp({...app, executable:'relative.exe'}, 'desktop'), /absolute Windows path/);
  assert.throws(() => validate({version:1, repos:['app'], services:{desktop:{repo:'app',argv:['app']}}, observed_apps:{desktop:app}}), /conflicts/);
});
