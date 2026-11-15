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

test('build reports validate freshness and every running process identity before allowing green', async () => {
  const {parseBuildStatus, resolveObservedApp} = await import('../src/observe.js');
  const time = Date.parse('2026-11-14T12:01:00Z');
  const local = resolveObservedApp({repo:'app',process_name:'Herdr',build_status_file:{path:'build-status.json',max_age_seconds:90}}, '/tmp/source');
  assert.equal(local.build_status_file!.path, '/tmp/source/build-status.json');
  const observation = matchObservedApp('desktop', local, [{pid:42,name:'Herdr',started_at:'2026-11-14T12:00:00Z'}]);
  const report = {schema_version:1,observed_at:'2026-11-14T12:00:45Z',state:'current',label:'In sync',reason:'Matches',processes:observation.matches};
  assert.equal(parseBuildStatus(report, observation, time).state, 'current');
  for (const state of ['untracked','rebuild_required','restart_required']) assert.equal(parseBuildStatus({...report,state}, observation,time).state,'attention');
  assert.equal(parseBuildStatus({...report,state:'unknown'},observation,time).state,'unknown');
  assert.throws(() => parseBuildStatus({...report,observed_at:'2026-11-14T11:58:00Z'},observation,time),/expired/);
  assert.throws(() => parseBuildStatus({...report,observed_at:'2026-11-14T12:02:00Z'},observation,time),/expired/);
  assert.throws(() => parseBuildStatus({...report,processes:[]},observation,time),/does not cover/);
  assert.throws(() => parseBuildStatus({...report,processes:[{pid:42,started_at:'2026-11-14T11:59:00Z'}]},observation,time),/does not cover/);
  assert.throws(() => parseBuildStatus({...report,state:'green'},observation,time),/Invalid/);
  assert.throws(() => validateObservedApp({...app,build_status_file:{path:'status.json'}},'desktop'),/local observation/);
  assert.throws(() => validateObservedApp({...local,build_status_file:{path:'status.json',max_age_seconds:0}},'desktop'),/status age/);
});

test('local report failures keep process presence but never present it as a current build', async () => {
  const fs = await import('node:fs/promises'), os = await import('node:os'), path = await import('node:path');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'rig-build-report-'));
  try {
    const file = path.join(folder,'status.json');
    const local: ResolvedObservedApp = {repo:'app',process_name:'Herdr',platform:process.platform as 'darwin',build_status_file:{path:file}};
    const rows = [{pid:42,name:'Herdr',started_at:'2026-11-14T12:00:00Z'}];
    const snapshot = () => new ProcessObserver(async () => rows).session()({desktop:local});
    let result = (await snapshot()).desktop;
    assert.equal(result.state,'running'); assert.equal(result.build_status!.state,'unknown');
    await fs.writeFile(file,JSON.stringify({schema_version:1,observed_at:new Date().toISOString(),state:'rebuild_required',label:'Rebuild required',reason:'Source changed',processes:rows}));
    result = (await snapshot()).desktop;
    assert.equal(result.state,'running'); assert.equal(result.build_status!.state,'attention');
    await fs.writeFile(file,'bad JSON');
    assert.equal((await snapshot()).desktop.build_status!.state,'unknown');
    assert.equal((await new ProcessObserver(async () => []).session()({desktop:local})).desktop.build_status,undefined,'stopped apps keep their existing stopped indicator');
  } finally { await fs.rm(folder,{recursive:true,force:true}); }
});

test('Rigs runs the configured bounded checker for missing reports and reuses fresh reports', async () => {
  const fs = await import('node:fs/promises'), os = await import('node:os'), path = await import('node:path');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'rig-development-check-'));
  try {
    const file=path.join(folder,'status.json'), script=path.join(folder,'check.mjs'), count=path.join(folder,'count');
    const rows=[{pid:42,name:'Herdr',started_at:'2026-11-14T12:00:00Z'}];
    await fs.writeFile(script,`import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(count)},'x');fs.writeFileSync(${JSON.stringify(file)},JSON.stringify({schema_version:1,observed_at:new Date().toISOString(),state:'current',label:'In sync',reason:'Matches',processes:${JSON.stringify(rows)}}));`);
    const local: ResolvedObservedApp={repo:'app',process_name:'Herdr',platform:process.platform as 'darwin',cwd:folder,
      build_status_file:{path:file},development:{check:[process.execPath,script],rebuild:['must-never-run']}};
    const snapshot=()=>new ProcessObserver(async()=>rows).session()({desktop:local});
    assert.equal((await snapshot()).desktop.build_status!.state,'current');
    assert.equal((await snapshot()).desktop.build_status!.state,'current');
    assert.equal(await fs.readFile(count,'utf8'),'x','only the read-only checker ran, once');
    await fs.rm(file);
    local.development!.check=[process.execPath,'-e','process.exit(1)'];
    const failed=(await snapshot()).desktop;
    assert.equal(failed.state,'running');assert.equal(failed.build_status!.state,'unknown');
  } finally {await fs.rm(folder,{recursive:true,force:true});}
});
