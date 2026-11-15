import test from 'node:test';
import assert from 'node:assert/strict';
import { performDevAction } from '../scripts/dev-app-lifecycle.mjs';
const options = {executable:'/Applications/Handlr Dev.app/Contents/MacOS/Herdr',app:'/Applications/Handlr Dev.app',home:'/tmp/dev-home',node:'/node',installed:()=>true};
test('failed rebuild never quits or reopens the existing app', async () => {
  const calls=[];
  await assert.rejects(performDevAction({...options,action:'rebuild',run:(...args)=>{calls.push(args);throw Error('build failed');},observe:()=>[{pid:1}]}),/build failed/);
  assert.equal(calls.length,1);assert.deepEqual(calls[0][1],['scripts/release-macos.mjs','--install']);
});
test('successful rebuild installs before quitting and opens only after the old app exits', async () => {
  const calls=[];let attempts=0;
  await performDevAction({...options,action:'rebuild',run:(...args)=>calls.push(args),observe:()=>attempts++<2?[{pid:1}]:[],wait:async()=>{}});
  assert.deepEqual(calls.map(call=>call[0]),['/node',options.executable,'/usr/bin/open']);
  assert.deepEqual(calls[1][1],['do','app.quit']);
  assert.equal(calls[1][2].env.HERDR_APP_HOME,options.home);
});
test('reopen skips the build, and a quit timeout never opens a second instance', async () => {
  const calls=[];
  await performDevAction({...options,action:'relaunch',run:(...args)=>calls.push(args),observe:()=>[]});
  assert.deepEqual(calls.map(call=>call[0]),['/usr/bin/open']);
  let clock=0;calls.length=0;
  await assert.rejects(performDevAction({...options,action:'relaunch',run:(...args)=>calls.push(args),observe:()=>[{pid:1}],now:()=>clock,wait:async()=>{clock+=250;}}),/did not finish quitting/);
  assert.deepEqual(calls.map(call=>call[0]),[options.executable]);
});
