/** Explicit integration harness: npm run test:live. Starts only disposable fixture services. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';
import { Core } from '../src/core.js';
import { Store } from '../src/store.js';
import { Rigs } from '../src/lifecycle.js';
import { available } from '../src/profile.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rig-live-'));
const core = new Core(), rigs = new Rigs(new Store(path.join(root, 'state')), core);
const ids: string[] = [];
let singleId: string | undefined;
try {
  for (const folder of ['mono','frontend','backend']) {
    const checkout = path.join(root, folder); await fs.mkdir(checkout);
    execFileSync('git',['init','-q',checkout]);
    await fs.copyFile('fixtures/service.ts',path.join(checkout,'service.ts'));
    execFileSync('git',['-C',checkout,'add','.']);
    execFileSync('git',['-C',checkout,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','fixture']);
    execFileSync('git',['-C',checkout,'checkout','-qb','feature/checkout']);
  }
  const single = await rigs.create('single',path.resolve('fixtures/single.json'),{app:path.join(root,'mono')}); singleId = single.id;
  await rigs.up(single.id);
  assert.equal((await fetch((await rigs.get(single.id)).allocation!.endpoints['api.http'].url)).status,200);
  await rigs.down(single.id);
  const mono = await rigs.create('mono',path.resolve('fixtures/monorepo.json'),{app:path.join(root,'mono')}); ids.push(mono.id);
  const split = await rigs.create('split',path.resolve('fixtures/multi-repo.json'),{frontend:path.join(root,'frontend'),backend:path.join(root,'backend')}); ids.push(split.id);
  await Promise.all(ids.map(id => promisify(execFile)(process.execPath, [path.resolve('dist/src/cli.js'),'up',id], {env:{...process.env,RIG_HOME:path.join(root,'state')}})));
  const overlap = await rigs.create('overlap',path.resolve('fixtures/monorepo.json'),{app:path.join(root,'mono')});
  await assert.rejects(rigs.up(overlap.id), /claimed by rig/);
  const before = await rigs.status();
  assert.equal(before.rigs.filter(r=>r.claimed).length, 2);
  assert.equal(before.core,'available');
  for (const id of ids) {
    const rig = await rigs.get(id);
    for (const launch of Object.values(rig.launches)) {
      const terminal = (await core.terminals()).find(t => t.address === launch.terminal)!;
      assert.equal(terminal.parent,null); assert.equal(terminal.state,'live');
      assert.deepEqual(Object.fromEntries(Object.entries(terminal.labels).filter(([k])=>k.startsWith('rig.'))),launch.labels);
    }
    const metrics = rig.allocation!.endpoints['api.metrics'];
    assert.match(await (await fetch(`http://${metrics.host}:${metrics.port}`)).text(), /fixture_metric/);
    const api = rig.allocation!.endpoints['api.http'];
    const web = rig.allocation!.endpoints['web.http'];
    const response = await (await fetch(web.url)).json() as {api: string}; assert.equal(response.api,api.url+'/api');
    assert.match((await rigs.logs(id,'api')).text,/listening/);
    await rigs.up(id); // verifies healthy reuse
  }
  const recreated = new Rigs(new Store(path.join(root,'state')),new Core());
  assert.deepEqual((await recreated.status()).rigs.map(r=>r.id),before.rigs.map(r=>r.id));
  for (const folder of ['mono','frontend','backend']) assert.equal((await recreated.status(undefined,path.join(root,folder))).rigs.filter(r=>r.claimed).length,1);
  const monoPorts = Object.values((await rigs.get(mono.id)).ports);
  await rigs.down(mono.id);
  for (const port of monoPorts) assert.equal(await available(port),true);
  const other = await rigs.get(split.id); assert.equal((await core.terminals()).find(t => t.address === other.launches.api.terminal)!.state,'live');
  await rigs.up(mono.id); assert.deepEqual(Object.values((await rigs.get(mono.id)).ports),monoPorts);
  console.log(JSON.stringify({ outcome:'ok', root, checks:['single app fixture','no parent','labels','monorepo and multi-repo concurrent in separate CLI processes','overlapping checkout refused','API target','multiple named endpoints including port-only metrics','logs','duplicate up','registry reopen','checkout lookup','port release','stop isolation','stable restart ports'] },null,2));
} finally {
  for (const id of [...ids, ...(singleId ? [singleId] : [])]) await rigs.down(id).catch(error => console.error('Cleanup pending:',id,error));
  // Keep evidence and fixture files for inspection; no external data is removed.
}
