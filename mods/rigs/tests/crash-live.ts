/** Real Core launch, deliberately lost response, actual SIGKILL, durable reconciliation. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Rigs } from '../src/lifecycle.js';
import { Core } from '../src/core.js';
import { Store } from '../src/store.js';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'rig-crash-live-'));
const realHC = execFileSync('/bin/zsh',['-lc','command -v hc'],{encoding:'utf8'}).trim();
const repository = path.join(temporary,'checkout'); await fs.mkdir(repository);
execFileSync('git',['init','-q',repository]);
execFileSync('git',['-C',repository,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-q','--allow-empty','-m','fixture']);
const profile = path.join(temporary,'profile.json');
await fs.writeFile(profile,JSON.stringify({version:1,repos:['app'],services:{worker:{repo:'app',argv:[process.execPath,'-e','console.log("crash fixture ready"); setInterval(()=>{}, 10000)']}}}));
const state = path.join(temporary,'state'), marker = path.join(temporary,'accepted.json'), shim = path.join(temporary,'bin'); await fs.mkdir(shim);
const wrapper = `#!${process.execPath}
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const readline = require('node:readline');
const real = spawn(${JSON.stringify(realHC)}, process.argv.slice(2), {stdio:['pipe','pipe','pipe']});
let hold = false;
readline.createInterface({input:process.stdin}).on('line', line => { try { hold = JSON.parse(line).method === 'terminal.run'; } catch {} real.stdin.write(line+'\\n'); });
readline.createInterface({input:real.stdout}).on('line', line => {
 if (hold) { const reply = JSON.parse(line); if (reply.result?.address) fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({terminal:reply.result,wrapper:process.pid})); }
 else process.stdout.write(line+'\\n');
});
real.stderr.resume();
process.stdin.on('end',()=>{real.kill();process.exit();});
process.on('SIGTERM',()=>{real.kill();process.exit();});
real.on('exit',()=>process.exit());
`;
await fs.writeFile(path.join(shim,'hc'),wrapper,{mode:0o755});
const core = new Core(), rigs = new Rigs(new Store(state),core);
const created = await rigs.create('interrupted',profile,{app:repository});
const child = spawn(process.execPath,[path.resolve('dist/src/cli.js'),'up',created.id],{env:{...process.env,RIG_HOME:state,PATH:shim+path.delimiter+process.env.PATH},stdio:'ignore'});
let accepted: {terminal:{address:string};wrapper:number}|undefined;
try {
  const deadline = Date.now()+20000;
  while (!accepted && Date.now()<deadline) {
    try { accepted = JSON.parse(await fs.readFile(marker,'utf8')); } catch {}
    if (!accepted) await sleep(50);
  }
  assert.ok(accepted,'Core must accept a real terminal before the CLI is killed');
  const intent = (await rigs.get(created.id)).launches.worker;
  assert.equal(intent.state,'intent'); assert.equal(intent.terminal,undefined);
  const exited = new Promise<void>(resolve => child.once('exit',()=>resolve()));
  child.kill('SIGKILL'); await exited;
  try { process.kill(accepted.wrapper,'SIGTERM'); } catch {}
  await rigs.up(created.id); // waits for dead CLI lease to expire, then reconciles by labels
  const recovered = (await rigs.get(created.id)).launches.worker;
  assert.equal(recovered.id,intent.id); assert.equal(recovered.terminal,accepted.terminal.address);
  const terminals = (await core.terminals()).filter(t=>t.labels['rig.id']===created.id && t.state==='live');
  assert.equal(terminals.length,1); assert.equal(terminals[0].parent,null);
  assert.match((await rigs.logs(created.id,'worker')).text,/crash fixture ready/);
  console.log(JSON.stringify({outcome:'ok',temporary,terminal:recovered.terminal,checks:['actual SIGKILL after Core acceptance','intent persisted before response','stale lock recovery','same launch and terminal reused','exactly one live launch']},null,2));
} finally {
  child.kill('SIGKILL'); if (accepted) { try { process.kill(accepted.wrapper,'SIGTERM'); } catch {} }
  await rigs.down(created.id);
}
