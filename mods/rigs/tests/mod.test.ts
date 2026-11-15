import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { writeMod } from '../scripts/mod-files.js';
import { setupPrompt } from '../mods/rigs/setup.js';

test('sync installs the agent guide and exact CLI paths while preserving layouts and refusing unrelated mods', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rig-mod-')));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const source = path.join(root,'source with spaces'), home = path.join(root,'herdr');
  const destination = path.join(home,'mods/rigs');
  await fs.mkdir(path.join(source,'mods/rigs'),{recursive:true});
  await fs.mkdir(destination,{recursive:true});
  await fs.mkdir(path.join(home,'layouts'));
  const layout = path.join(home,'layouts/rigs-workspace.json');
  await fs.writeFile(layout,'{"custom":"keep"}');
  await fs.writeFile(path.join(source,'mods/rigs/main.js'),"// Generated from main.ts by npm run build:mod.\nconst cli = props()?.cli ?? 'rig';\nthis.guide = '';\nthis.cliArgs = [];\nmodName = 'rigs';\n");
  await fs.writeFile(path.join(source,'mods/rigs/setup.js'),'// setup fixture');
  await fs.writeFile(path.join(source,'mods/rigs/mod.json'),'{}');
  await fs.writeFile(path.join(source,'AGENTS.md'),'# Fixture agent guide\n');
  await writeMod(source,destination);
  const sync = () => execFileSync(process.execPath,[path.resolve('dist/scripts/sync-mod.js')],{cwd:source,env:{...process.env,HERDR_APP_HOME:home},stdio:'pipe'});
  sync();
  assert.equal(await fs.readFile(layout,'utf8'),'{"custom":"keep"}');
  const installed = await fs.readFile(path.join(destination,'main.js'),'utf8');
  assert.ok(installed.includes(JSON.stringify(path.join(destination,'AGENTS.md'))));
  assert.ok(installed.includes(JSON.stringify(path.join(source,'dist/src/cli.js'))));
  assert.match(await fs.readFile(path.join(destination,'AGENTS.md'),'utf8'),/Fixture agent guide/);
  const custom = path.join(home,'mods/personal-rigs'); await fs.mkdir(custom);
  await writeMod(source,custom);
  assert.ok((await fs.readFile(path.join(custom,'main.js'),'utf8')).includes('modName = "personal-rigs";'),'preview popups open the selected installation, including custom names');
  await fs.writeFile(path.join(destination,'main.js'),'// unrelated personal mod');
  assert.throws(sync,/Existing mod is not this checkout installation/);
  assert.equal(await fs.readFile(path.join(destination,'main.js'),'utf8'),'// unrelated personal mod');
});

test('setup prompts only link the agent guide and task context', () => {
  assert.equal(setupPrompt({checkout:'/selected project',guide:'/installed/AGENTS.md'}),
    'Read and follow "/installed/AGENTS.md" to set up a Herdr rig for "/selected project".');
  assert.equal(setupPrompt({guide:'/installed/AGENTS.md',demo:true,checkout:'/real project'}),
    'Read and follow "/installed/AGENTS.md" to set up a disposable Herdr Rigs demo.');
});
