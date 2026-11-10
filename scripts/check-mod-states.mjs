/** Eager native rendering of async preview states; no CLI calls or service launches. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await fs.mkdtemp(path.join(os.tmpdir(),'rig-native-check-'));
const preview = {
  id:'checker',name:'compiler-draft',assignments:'proposed, unreserved',
  checkouts:{app:{root:'/tmp/disposable-checkout',repository:'/tmp/disposable-checkout/.git',branch:'main',unborn:true}},
  order:['compiler'], endpoints:{}, review:{fingerprint:'checker-fingerprint',approved:false},
  services:{compiler:{id:'compiler',repo:'app',cwd:'/tmp/disposable-checkout',argv:['node','tsc','--watch'],env:{},depends_on:[],endpoints:{},data_scope:'Writes dist/; no database, cache or queue',fingerprint:'checker-service'}},
  setup:{approved:false,questions:['commands','data_isolation'],decisions:{commands:'Optional compiler watcher',data_isolation:''},evidence:[]},
};
try {
  for (const state of ['onboarding','setup-options','draft','approved','preview-error','services-with-output','services-without-output','services-portless']) {
    const directory = path.join(root,state); await fs.mkdir(directory);
    await fs.copyFile('mods/rigs/main.js',path.join(directory,'rigs.js'));
    await fs.copyFile('mods/rigs/setup.js',path.join(directory,'setup.js'));
    await fs.writeFile(path.join(directory,'mod.json'),'{}');
    const fixture = structuredClone(preview);
    if (state === 'approved') { fixture.review.approved = true; fixture.setup.approved = true; fixture.setup.decisions.data_isolation = 'No shared infrastructure'; }
    const service = {id:'web',repo:'app',state:state === 'services-with-output' ? 'running' : 'stopped',readiness:'not configured',endpoints:state === 'services-portless' ? {} : {http:{url:'http://127.0.0.1:3120',protocol:'http',port:3120}},env:{},assignments:'allocated',degraded_dependencies:[],...(state === 'services-with-output' ? {terminal:'checker-only-terminal'} : {})};
    const data = {core:'available',observed_at:'checker',rigs:[{id:'checker',name:'checker-rig',claimed:true,checkouts:fixture.checkouts,services:{web:service}}]};
    const initialize = state.startsWith('services-') ? `this.data = ${JSON.stringify(data)};` : state === 'onboarding' || state === 'setup-options' ? `this.creating = true; this.setupCheckout = '/tmp/disposable-checkout'; this.setupOptions = ${state === 'setup-options'}; this.importProfile = ${state === 'setup-options'};` : `this.previewMode = true; this.setPreview(${JSON.stringify(fixture)},'checker'); ${state === 'preview-error' ? "this.actionError = 'Preview changed; refresh and review the current configuration.';" : ''}`;
    await fs.writeFile(path.join(directory,'main.js'),`import Rigs from './rigs.js';\nimport {InputState} from 'gpui-base';\nexport default class CheckState extends Rigs { init() { this.name = InputState.new({}); this.profile = InputState.new({}); ${initialize} } }\n`);
    process.stdout.write(execFileSync('herdr-app',['check',directory],{encoding:'utf8'}));
  }
} finally { await fs.rm(root,{recursive:true,force:true}); }
