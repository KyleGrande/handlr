import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rigs } from '../src/lifecycle.js';
import { Store } from '../src/store.js';
import { checkout, resolve, validate } from '../src/profile.js';
import type { CoreAPI } from '../src/core.js';
import type { Profile, Terminal } from '../src/types.js';
import { ProcessObserver } from '../src/observe.js';
import { Profiles } from '../src/profiles.js';

class FakeCore implements CoreAPI {
  list: Terminal[] = []; starts = 0; failAt = 0; crashAfterAccept = false; unavailable = false; killed: string[] = [];
  async terminals() { if (this.unavailable) throw Error('offline'); return structuredClone(this.list); }
  async start(argv: string[], cwd: string, env: Record<string,string>, labels: Record<string,string>) {
    this.starts++; if (this.starts === this.failAt) throw Error('injected start failure');
    const terminal: Terminal = { address: `t${this.starts}`, labels, state: 'live', created_ms: Date.now() };
    this.list.push(terminal); if (this.crashAfterAccept) { this.crashAfterAccept = false; throw Error('lost response'); } return terminal;
  }
  async stop(address: string) { this.killed.push(address); this.list.find(t => t.address === address)!.state = 'finished'; }
  async read() { return 'fixture startup output'; }
}
async function fixture(t: test.TestContext, count = 1) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rig-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const roots = [];
  for (let i = 0; i < count; i++) {
    const root = path.join(directory, `checkout${i}`); await fs.mkdir(root); execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-q', '--allow-empty', '-m', 'fixture']);
    execFileSync('git', ['-C', root, 'checkout', '-qb', 'feature/checkout']); roots.push(root);
  }
  const profile: Profile = { version: 1, repos: ['app'], services: { worker: { repo: 'app', argv: ['node', 'worker.js'] } } };
  const profilePath = path.join(directory, 'profile.json');
  const save = () => fs.writeFile(profilePath, JSON.stringify(profile)); await save();
  const core = new FakeCore(), rigs = new Rigs(new Store(path.join(directory, 'state')), core);
  return { directory, roots, profile, profilePath, save, core, rigs };
}
test('rename preserves running ownership while profile and worktree edits require a stopped rig', async t => {
  const f = await fixture(t,2);
  const created = await f.rigs.create('before',f.profilePath,{app:f.roots[0]});
  await f.rigs.up('before');
  const launch = (await f.rigs.get('before')).launches.worker;
  const definition = await f.rigs.definition('before');
  const plan = await f.rigs.configure(created.id,{}, {name:'after',revision:definition.revision});
  assert.equal(plan.id,created.id); assert.equal(plan.name,'after');
  assert.deepEqual((await f.rigs.get('after')).launches.worker,launch);
  assert.equal(f.core.starts,1); assert.deepEqual(f.core.killed,[]);
  await assert.rejects(f.rigs.configure('after',{app:f.roots[1]}),/Stop and reconcile/);
  await assert.rejects(f.rigs.delete('after'),/Stop and reconcile/);
  await assert.rejects(f.rigs.configure('after',{}, {name:'again',revision:definition.revision}),/Rig changed/);
  await f.rigs.down('after');
  await f.rigs.approve('after',(await f.rigs.plan('after')).review.fingerprint);
  const configured = await f.rigs.configure('after',{app:f.roots[1]});
  assert.equal(configured.checkouts.app.root,await fs.realpath(f.roots[1]));
  assert.equal((await f.rigs.get('after')).claimed,false);
  await assert.rejects(f.rigs.up('after'),/Setup review incomplete or stale/);
});
test('rig deletion preserves files and reusable profiles and cannot remove an unresolved launch', async t => {
  const f = await fixture(t);
  const created = await f.rigs.create('temporary',f.profilePath,{app:f.roots[0]});
  await f.rigs.up('temporary'); f.core.unavailable = true;
  await assert.rejects(f.rigs.delete('temporary'),/Stop and reconcile/);
  f.core.unavailable = false; await f.rigs.down('temporary');
  const definition = await f.rigs.definition('temporary');
  await f.rigs.delete('temporary',definition.revision);
  await assert.rejects(f.rigs.get(created.id),/Unknown rig/);
  assert.ok(await fs.stat(f.roots[0])); assert.ok(await fs.stat(f.profilePath));
  const profiles = new Profiles(f.rigs.store);
  assert.equal((await profiles.list()).profiles[0].path,await fs.realpath(f.profilePath));
  assert.deepEqual((await profiles.describe(f.profilePath)).rigs,[]);
  const replacement = await f.rigs.create('temporary',f.profilePath,{app:f.roots[0]});
  assert.notEqual(replacement.id,created.id);
});
test('profile management checks shared references, revisions and candidate mappings before atomic saves', async t => {
  const f = await fixture(t,2), profiles = new Profiles(f.rigs.store);
  const alias = path.join(f.directory,'alias.json'); await fs.symlink(f.profilePath,alias);
  await f.rigs.create('one',f.profilePath,{app:f.roots[0]});
  await f.rigs.create('two',alias,{app:f.roots[1]});
  const original = await profiles.describe(alias);
  assert.equal(original.rigs.length,2);
  await assert.rejects(profiles.delete(alias,original.revision),/used by rigs/);
  const changed = JSON.stringify({...f.profile,services:{worker:{repo:'app',argv:['updated-worker']}}});
  await f.rigs.up('one');
  await assert.rejects(profiles.update(alias,changed,original.revision),/Stop rigs/);
  await f.rigs.down('one');
  const updated = await profiles.update(alias,changed,original.revision);
  assert.equal(updated.path,await fs.realpath(f.profilePath));
  assert.equal((await fs.lstat(alias)).isSymbolicLink(),true);
  assert.equal(JSON.parse(await fs.readFile(f.profilePath,'utf8')).services.worker.argv[0],'updated-worker');
  await assert.rejects(profiles.update(alias,original.content!,original.revision),/Profile changed/);
  const incompatible = JSON.stringify({version:1,repos:['other'],services:{worker:{repo:'other',argv:['worker']}}});
  await assert.rejects(profiles.update(alias,incompatible,updated.revision),/repo slots compatible/);
  await f.rigs.delete('one'); await f.rigs.delete('two');
  await profiles.delete(alias,updated.revision);
  await assert.rejects(fs.stat(f.profilePath),{code:'ENOENT'});
  assert.deepEqual((await profiles.list()).profiles,[]);
});
test('edited port configuration replaces incompatible saved port preferences', async t => {
  const f = await fixture(t);
  f.profile.services.worker.endpoints = {http:{port:24560}}; await f.save();
  await f.rigs.create('ports',f.profilePath,{app:f.roots[0]});
  const rig = await f.rigs.get('ports'); rig.ports = {'worker.http':24560};
  f.profile.services.worker.endpoints.http.port = 24561; await f.save();
  assert.equal((await resolve(rig,new Set(),false)).endpoints['worker.http'].port,24561);
  f.profile.services.worker.endpoints.http = {range:[24570,24579]}; await f.save();
  assert.equal((await resolve(rig,new Set(),false)).endpoints['worker.http'].port,24570);
});
test('externally observed apps update without launching, claiming or stopping their processes', async t => {
  const f = await fixture(t);
  f.profile.services = {};
  f.profile.observed_apps = {desktop:{repo:'app',process_name:'MyApp.exe',platform:'win32',machine:'windows-dev'}};
  await f.save();
  let running = true;
  const observer = new ProcessObserver(async () => running ? [{pid:77,name:'MyApp.exe',started_at:'2026-11-10T12:00:00.000Z'}] : []);
  const rigs = new Rigs(f.rigs.store, f.core, observer);
  await rigs.create('desktop', f.profilePath, {app:f.roots[0]});
  f.core.unavailable = true;
  assert.equal((await rigs.status('desktop')).rigs[0].observed_apps.desktop.state, 'running', 'external observation works while managed Core terminals are unavailable');
  f.core.unavailable = false;
  await assert.rejects(rigs.up('desktop'), /no managed services/);
  assert.equal((await rigs.get('desktop')).claimed, false);
  assert.equal(f.core.starts, 0);
  await rigs.down('desktop');
  assert.deepEqual(f.core.killed, []);
  assert.equal((await rigs.status('desktop')).rigs[0].observed_apps.desktop.state, 'running', 'rig down does not stop the observed app');
  running = false;
  assert.equal((await rigs.status('desktop')).rigs[0].observed_apps.desktop.state, 'stopped');
});
test('deterministic previews do not reserve; canonical lookup, repeated branch labels and detached contexts', async t => {
  const f = await fixture(t, 2);
  f.profile.repos.push('other'); f.profile.services.web = { repo: 'other', argv: ['web'], endpoints: { http: { range: [23120,23129] } } }; await f.save();
  const created = await f.rigs.create('split', f.profilePath, { app: f.roots[0], other: f.roots[1] });
  assert.deepEqual(await f.rigs.plan('split'), await f.rigs.plan('split'));
  assert.equal((await f.rigs.get('split')).claimed, false);
  await fs.mkdir(path.join(f.roots[1], 'nested'));
  assert.equal((await f.rigs.status(undefined, path.join(f.roots[1], 'nested'))).rigs[0].id, created.id);
  execFileSync('git', ['-C', f.roots[0], 'checkout', '--detach', '-q']);
  assert.match((await resolve(await f.rigs.get('split'))).checkouts.app.branch, /^detached/);
});
test('invalid references, readiness cycles, paths and secret redaction', async t => {
  const f = await fixture(t);
  f.profile.services.worker.env = { TOKEN: { secret_env: 'RIG_TEST_TOKEN' }, API: { endpoint: 'absent.http' } };
  assert.throws(() => validate(f.profile), /unknown endpoint/);
  delete f.profile.services.worker.env.API; f.profile.services.worker.directory = '../'; await f.save();
  await assert.rejects(f.rigs.create('bad', f.profilePath, { app: f.roots[0] }), /escapes/);
  delete f.profile.services.worker.directory; await f.save(); process.env.RIG_TEST_TOKEN = 'sensitive-value'; t.after(() => { delete process.env.RIG_TEST_TOKEN; });
  await f.rigs.create('good', f.profilePath, { app: f.roots[0] }); await f.rigs.up('good');
  assert.ok(!JSON.stringify(await f.rigs.plan('good')).includes('sensitive-value'));
  assert.ok(!(await fs.readFile(path.join(f.rigs.store.home, 'registry.json'),'utf8')).includes('sensitive-value'));
  f.profile.services.worker.endpoints = { http: {} }; f.profile.services.worker.readiness = { endpoint: 'http' }; f.profile.services.worker.depends_on = ['worker'];
  assert.throws(() => validate(f.profile), /cycle/);
});
test('duplicate up, overlap refusal, distinct concurrent rigs, and stop isolation', async t => {
  const f = await fixture(t, 2);
  await f.rigs.create('one', f.profilePath, { app: f.roots[0] });
  await f.rigs.create('overlap', f.profilePath, { app: f.roots[0] });
  await f.rigs.create('two', f.profilePath, { app: f.roots[1] });
  await Promise.all([f.rigs.up('one'), f.rigs.up('two')]);
  await f.rigs.up('one'); assert.equal(f.core.starts, 2);
  await assert.rejects(f.rigs.up('overlap'), /claimed by rig/);
  await f.rigs.down('one'); await f.rigs.down('one');
  assert.equal(f.core.killed.length, 1); assert.equal(f.core.list.filter(t => t.state === 'live').length, 1);
  assert.equal((await f.rigs.get('two')).claimed, true);
});
test('accepted launch with lost response reconciles by labels and rolls back only this attempt', async t => {
  const f = await fixture(t); await f.rigs.create('rig', f.profilePath, { app: f.roots[0] }); await f.rigs.up('rig');
  f.profile.services.extra = { repo: 'app', argv: ['extra'] }; await f.save(); f.core.crashAfterAccept = true;
  await assert.rejects(f.rigs.up('rig'), /lost response/);
  assert.equal(f.core.list[0].state, 'live'); assert.equal(f.core.list[1].state, 'finished');
  assert.equal((await f.rigs.get('rig')).claimed, true);
});
test('unreachable Core retains claims; changed ownership cannot authorize a kill', async t => {
  const f = await fixture(t); await f.rigs.create('rig', f.profilePath, { app: f.roots[0] }); await f.rigs.up('rig');
  f.core.unavailable = true; assert.equal((await f.rigs.status()).core, 'unavailable'); await assert.rejects(f.rigs.down('rig'));
  assert.equal((await f.rigs.get('rig')).claimed, true);
  f.core.unavailable = false; f.core.list[0].labels = {};
  await assert.rejects(f.rigs.down('rig'), /ownership unresolved/); assert.equal(f.core.killed.length, 0);
});
test('readiness timeout rolls back, preserves diagnostic output and definition', async t => {
  const f = await fixture(t);
  f.profile.services.worker.endpoints = { http: { range: [24120,24129] } };
  f.profile.services.worker.readiness = { endpoint: 'http', timeout: 0.2 }; await f.save();
  await f.rigs.create('timeout', f.profilePath, { app: f.roots[0] });
  await assert.rejects(f.rigs.up('timeout'), /deadline/);
  assert.equal((await f.rigs.get('timeout')).claimed, false);
  assert.match((await f.rigs.logs('timeout','worker')).text, /startup output/);
});

test('external checks gate consumers, degrade in status, and never authorize provider shutdown', async t => {
  const f = await fixture(t);
  const { createServer } = await import('node:http');
  let healthy = true;
  const provider = createServer((_req,res) => { res.statusCode = healthy ? 200 : 503; res.end('provider'); });
  await new Promise<void>(resolve => provider.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise<void>(resolve => { provider.closeAllConnections(); provider.close(() => resolve()); }));
  const port = (provider.address() as import('node:net').AddressInfo).port;
  f.profile.services.worker.env = {API: {external:`http://127.0.0.1:${port}/api`, probe:{path:'/health',timeout:0.15}}};
  await f.save(); await f.rigs.create('external',f.profilePath,{app:f.roots[0]});
  const initial = await f.rigs.status('external');
  assert.ok(initial.rigs[0].services.worker, 'unstarted definitions include their service slots');
  healthy = false; await assert.rejects(f.rigs.up('external'),/External dependency API/); assert.equal(f.core.starts,0);
  healthy = true; await f.rigs.up('external'); healthy = false;
  const status = (await f.rigs.status('external')).rigs[0].services.worker as {state:string;external_dependencies:{readiness:string}[]};
  assert.equal(status.state,'running'); assert.equal(status.external_dependencies[0].readiness,'failed');
  await f.rigs.down('external'); assert.equal(f.core.killed.length,1);
  assert.equal((await fetch(`http://127.0.0.1:${port}`)).status,503, 'external listener survives down');
});
test('assisted setup inspects framework, env examples and dev docs without persisting example secrets', async t => {
  const f = await fixture(t);
  const { propose } = await import('../src/init.js');
  await fs.writeFile(path.join(f.roots[0],'package.json'),JSON.stringify({scripts:{dev:'vite'},devDependencies:{vite:'fixture'}}));
  await fs.writeFile(path.join(f.roots[0],'vite.config.ts'),'export default {server:{proxy:{}}}');
  await fs.writeFile(path.join(f.roots[0],'.env.example'),'DATABASE_URL=example-sensitive-value\nPUBLIC_API=http://example.test\n');
  await fs.writeFile(path.join(f.roots[0],'README.md'),'# Development\nUse postgres and redis for the queue.');
  const {profile} = await propose(f.roots[0]);
  assert.ok(profile.setup!.evidence.some(e => e.file === 'README.md' && e.topic.includes('postgres')));
  assert.ok(profile.setup!.evidence.some(e => e.file === 'vite.config.ts'));
  assert.ok(!JSON.stringify(profile).includes('example-sensitive-value'));
  assert.ok(profile.services.app.argv.includes('--strictPort'));
  assert.deepEqual(profile.services.app.env!.DATABASE_URL,{secret_env:'DATABASE_URL'});
  delete profile.services.app.env; // User chooses which documented variables this command needs.
  await fs.writeFile(f.profilePath,JSON.stringify(profile)); await f.rigs.create('draft',f.profilePath,{app:f.roots[0]});
  await assert.rejects(f.rigs.up('draft'),/Setup review incomplete/); assert.equal(f.core.starts,0);
  for (const question of profile.setup!.questions) profile.setup!.decisions[question] = 'Reviewed in fixture';
  profile.setup!.approved = true;
  // A portless launch keeps this unit fixture independent of a real HTTP process.
  delete profile.services.app.readiness; delete profile.services.app.endpoints; profile.services.app.argv = ['worker'];
  await fs.writeFile(f.profilePath,JSON.stringify(profile));
  const preview = await f.rigs.plan('draft');
  await assert.rejects(f.rigs.up('draft'),/Setup review incomplete/,'setting the profile boolean alone cannot approve a draft');
  await f.rigs.approve('draft',preview.review.fingerprint);
  await f.rigs.up('draft',preview.review.fingerprint); assert.equal(f.core.starts,1);
});

test('occupied preferred ports fail before launch; down preserves unrelated listeners and data', async t => {
  const f = await fixture(t);
  const { createServer } = await import('node:net');
  const listener = createServer(socket => socket.end());
  await new Promise<void>(resolve => listener.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise<void>(resolve => listener.close(() => resolve())));
  const port = (listener.address() as import('node:net').AddressInfo).port;
  f.profile.services.worker.endpoints = {http:{port}}; await f.save();
  await fs.writeFile(path.join(f.roots[0],'local-data'),'keep me');
  await f.rigs.create('occupied',f.profilePath,{app:f.roots[0]});
  await assert.rejects(f.rigs.up('occupied'),/preferred port.*occupied/);
  assert.equal(f.core.starts,0); assert.equal((await f.rigs.get('occupied')).claimed,false);
  const stopped = await f.rigs.down('occupied'); assert.ok(listener.listening);
  assert.equal(await fs.readFile(path.join(f.roots[0],'local-data'),'utf8'),'keep me');
  assert.equal(stopped.rigs[0].name,'occupied');
});
test('missing checkout is retained as stale until explicit repair, preserving rig identity', async t => {
  const f = await fixture(t,2);
  const created = await f.rigs.create('moved',f.profilePath,{app:f.roots[0]});
  const originalRoot = (await f.rigs.get('moved')).checkouts.app;
  const moved = f.roots[0]+'-moved'; await fs.rename(f.roots[0],moved);
  const stale = (await f.rigs.status('moved')).rigs[0].checkouts.app as {stale:boolean;root:string};
  assert.equal(stale.stale,true); assert.equal(stale.root,originalRoot);
  await assert.rejects(f.rigs.up('moved'),/Checkout missing/);
  await f.rigs.configure('moved',{app:moved}); assert.equal((await f.rigs.get('moved')).id,created.id);
  assert.equal((await f.rigs.get('moved')).checkout_bindings!.app.root,await fs.realpath(moved));
});

test('bindings derive TCP origins and append URL paths before queries; invalid probe protocols are rejected', async t => {
  const f = await fixture(t);
  f.profile.services.worker.endpoints = {socket:{protocol:'tcp',range:[25120,25129]}};
  f.profile.services.worker.env = {ORIGIN:{endpoint:'worker.socket',origin:true}, API:{external:'https://example.test/base?mode=fixture',path:'/api'}};
  await f.save(); await f.rigs.create('urls',f.profilePath,{app:f.roots[0]});
  const plan = await f.rigs.plan('urls');
  assert.equal(plan.services.worker.env.ORIGIN,`tcp://127.0.0.1:${plan.endpoints['worker.socket'].port}`);
  assert.equal(plan.services.worker.env.API,'https://example.test/base/api?mode=fixture');
  f.profile.services.worker.env.API = {external:'tcp://127.0.0.1:12345',probe:{kind:'http'}};
  assert.throws(()=>validate(f.profile),/HTTP probe requires HTTP/);
});

test('rollback still stops owned processes when terminal history cannot be read', async t => {
  const f = await fixture(t);
  f.profile.services.worker.endpoints = {http:{range:[26120,26129]}};
  f.profile.services.worker.readiness = {endpoint:'http',timeout:0.1}; await f.save();
  f.core.read = async () => {throw new Error('terminal history disappeared');};
  await f.rigs.create('unreadable',f.profilePath,{app:f.roots[0]});
  await assert.rejects(f.rigs.up('unreadable'),/deadline/);
  assert.equal(f.core.killed.length,1); assert.equal((await f.rigs.get('unreadable')).claimed,false);
});

test('a dependency losing readiness degrades consumers without stopping them', async t => {
  const f = await fixture(t);
  const {createServer} = await import('node:http'); let healthy = true;
  const server = createServer((_req,res) => {res.statusCode = healthy ? 200 : 503;res.end();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const port = (server.address() as import('node:net').AddressInfo).port;
  // Fake Core models process state; this server supplies the controlled readiness signal.
  f.profile.services.api = {repo:'app',argv:['api'],endpoints:{http:{port}},readiness:{endpoint:'http'}};
  f.profile.services.worker.depends_on = ['api']; await f.save();
  await f.rigs.create('degraded',f.profilePath,{app:f.roots[0]});
  const rig = await f.rigs.get('degraded');
  const plan = await resolve(rig,new Set(),false);
  rig.allocation = plan; rig.claimed = true;
  for (const id of plan.order) {
    const labels = {'rig.id':rig.id,'rig.service':id,'rig.launch':`launch-${id}`};
    const terminal = await f.core.start(plan.services[id].argv,f.roots[0],{},labels);
    rig.launches[id] = {id:`launch-${id}`,operation:'prior',service:id,fingerprint:plan.services[id].fingerprint,labels,terminal:terminal.address,state:'running',created:new Date().toISOString()};
  }
  await f.rigs.write(rig); healthy = false;
  const status = (await f.rigs.status('degraded')).rigs[0].services.worker as {state:string;degraded_dependencies:string[]};
  assert.equal(status.state,'running'); assert.deepEqual(status.degraded_dependencies,['api']); assert.equal(f.core.killed.length,0);
});

test('a first-time non-Node project gets a review draft without an existing profile', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.roots[0],'pyproject.toml'),'[project]\nname = "fixture"');
  await fs.writeFile(path.join(f.roots[0],'README.md'),'# Development\nRun the API with the documented uv command.');
  const {propose} = await import('../src/init.js');
  const result = await propose(f.roots[0]);
  assert.equal(result.profile.setup!.approved,false);
  assert.ok(result.profile.setup!.evidence.some(e=>e.file==='pyproject.toml'));
  assert.deepEqual(result.profile.services,{},'unknown commands are left for the user’s agent, never guessed or started');
});

test('map-reserved service IDs cannot disappear from durable ownership records', async t => {
  const f = await fixture(t);
  const profile = JSON.parse('{"version":1,"repos":["app"],"services":{"__proto__":{"repo":"app","argv":["worker"]}}}') as Profile;
  assert.throws(()=>validate(profile),/Invalid ID __proto__/);
  await assert.rejects(f.rigs.get('constructor'),/Unknown rig/);
  await assert.rejects(f.rigs.create(' ',f.profilePath,{app:f.roots[0]}),/nonempty rig name/);
});

test('an unborn checkout supports discovery, create, preview, approval and lookup without Git changes', async t => {
  const f = await fixture(t);
  const root = path.join(f.directory,'unborn'); await fs.mkdir(root);
  execFileSync('git',['init','-q','--initial-branch=main',root]);
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{build:'tsc -p tsconfig.json'},devDependencies:{typescript:'fixture'}}));
  await fs.writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{outDir:'dist'}}));
  const before = execFileSync('git',['-C',root,'status','--porcelain']).toString();
  const head = await fs.readFile(path.join(root,'.git/HEAD'),'utf8');
  const {propose} = await import('../src/init.js');
  const result = await propose(root);
  assert.equal(result.discovery.kind,'development_tools');
  assert.deepEqual(result.profile.services.compiler.endpoints,undefined);
  assert.ok(result.profile.services.compiler.argv.includes('--watch'));
  assert.match(result.profile.services.compiler.data_scope!,/dist/);
  assert.deepEqual(result.profile.setup!.questions,['commands','ports_and_readiness']);
  await fs.writeFile(f.profilePath,JSON.stringify(result.profile));
  await f.rigs.create('unborn',f.profilePath,{app:root});
  const plan = await f.rigs.plan('unborn');
  assert.equal(plan.checkouts.app.branch,'main'); assert.equal(plan.checkouts.app.unborn,true);
  assert.equal(plan.review.approved,false); assert.equal(f.core.starts,0);
  await fs.mkdir(path.join(root,'nested'));
  assert.equal((await f.rigs.status(undefined,path.join(root,'nested'))).rigs[0].name,'unborn');
  await f.rigs.approve('unborn',plan.review.fingerprint);
  assert.equal(f.core.starts,0,'approval alone never launches');
  await f.rigs.up('unborn',plan.review.fingerprint); await f.rigs.down('unborn');
  assert.equal(await fs.readFile(path.join(root,'.git/HEAD'),'utf8'),head);
  assert.equal(execFileSync('git',['-C',root,'status','--porcelain']).toString(),before);
  assert.throws(() => execFileSync('git',['-C',root,'rev-parse','--verify','HEAD'],{stdio:'pipe'}));
  await assert.rejects(checkout(f.directory),/Checkout missing or invalid/);
});

test('approval binds the reviewed configuration and rejects stale commands, branches and mappings before launch', async t => {
  const f = await fixture(t,2);
  f.profile.setup = {approved:false,questions:['commands','data_isolation'],decisions:{commands:'Run the worker'},evidence:[]};
  f.profile.services.worker.env = {TOKEN:{secret_env:'RIG_APPROVAL_TOKEN'}};
  await f.save(); await f.rigs.create('review',f.profilePath,{app:f.roots[0]});
  const original = await f.rigs.plan('review');
  await assert.rejects(f.rigs.approve('review',original.review.fingerprint),/Setup review incomplete/);
  await assert.rejects(f.rigs.approve('review',original.review.fingerprint,{unknown:'choice'}),/Unknown setup decision/);
  const approved = await f.rigs.approve('review',original.review.fingerprint,{data_isolation:'No extra data directory'});
  assert.equal(approved.setup!.approved,true);
  assert.equal(approved.setup!.decisions.data_isolation,'No extra data directory');
  process.env.RIG_APPROVAL_TOKEN = 'first-secret'; t.after(() => { delete process.env.RIG_APPROVAL_TOKEN; });
  process.env.RIG_APPROVAL_TOKEN = 'changed-secret';
  assert.equal((await f.rigs.plan('review')).review.fingerprint,original.review.fingerprint,'secret values are not review material');
  f.profile.services.worker.argv = ['changed-worker']; await f.save();
  assert.equal((await f.rigs.plan('review')).review.approved,false);
  await assert.rejects(f.rigs.approve('review',original.review.fingerprint,{data_isolation:'No extra data'}),/Preview changed/);
  await assert.rejects(f.rigs.up('review',original.review.fingerprint),/Preview changed/);
  await assert.rejects(f.rigs.up('review'),/stale/);
  assert.equal(f.core.starts,0); assert.equal((await f.rigs.get('review')).claimed,false);
  const current = await f.rigs.plan('review');
  await f.rigs.approve('review',current.review.fingerprint,{data_isolation:'No extra data'});
  execFileSync('git',['-C',f.roots[0],'checkout','-qb','another-branch']);
  assert.equal((await f.rigs.plan('review')).review.approved,false);
  const branch = await f.rigs.plan('review');
  await f.rigs.approve('review',branch.review.fingerprint,{data_isolation:'No extra data'});
  await f.rigs.configure('review',{app:f.roots[1]});
  await assert.rejects(f.rigs.up('review'),/stale/);
  assert.equal(f.core.starts,0);
});

test('discovery excludes demo scripts and reports no_services through the CLI without creating a rig', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.roots[0],'package.json'),JSON.stringify({scripts:{'dev:demo':'node fixtures/service.ts'}}));
  const output = path.join(f.directory,'discovery.json');
  const response = JSON.parse(execFileSync(process.execPath,[path.resolve('dist/src/cli.js'),'init','--checkout',f.roots[0],'--output',output],{env:{...process.env,RIG_HOME:f.rigs.store.home}}).toString());
  assert.equal(response.outcome,'no_services'); assert.equal(response.discovery.kind,'no_services');
  assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')).services,{});
  assert.deepEqual((await f.rigs.store.load()).rigs,{});
  assert.equal(f.core.starts,0);
});
