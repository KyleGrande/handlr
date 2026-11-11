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
  for (const state of ['new-menu','create','draft','approved','preview-error','services-with-output','services-without-output','services-portless','apps-running','apps-unknown','apps-preview','rig-menu','profile-menu','edit-rig','profile-editor','delete-profile','delete-shared-profile']) {
    const directory = path.join(root,state); await fs.mkdir(directory);
    await fs.copyFile('mods/rigs/main.js',path.join(directory,'rigs.js'));
    await fs.copyFile('mods/rigs/setup.js',path.join(directory,'setup.js'));
    await fs.writeFile(path.join(directory,'mod.json'),'{}');
    const fixture = structuredClone(preview);
    if (state === 'approved') { fixture.review.approved = true; fixture.setup.approved = true; fixture.setup.decisions.data_isolation = 'No shared infrastructure'; }
    const service = {id:'web',repo:'app',state:state === 'services-with-output' ? 'running' : 'stopped',readiness:'not configured',endpoints:state === 'services-portless' ? {} : {http:{url:'http://127.0.0.1:3120',protocol:'http',port:3120}},env:{},assignments:'allocated',degraded_dependencies:[],...(state === 'services-with-output' ? {terminal:'checker-only-terminal'} : {})};
    const data = {core:'available',observed_at:'checker',rigs:[{id:'checker',name:'checker-rig',claimed:true,checkouts:fixture.checkouts,services:{web:service}}]};
    if (state.startsWith('apps-')) {
      fixture.observed_apps = {desktop:{repo:'app',process_name:'MyApp.exe',platform:'win32',machine:'windows-dev'}};
      fixture.order = []; fixture.services = {}; delete fixture.setup;
      data.rigs[0].claimed = false; data.rigs[0].services = {};
      data.rigs[0].observed_apps = {desktop:{...fixture.observed_apps.desktop,id:'desktop',ownership:'external',state:state === 'apps-unknown' ? 'unknown' : 'running',observed_at:'checker',matches:state === 'apps-unknown' ? [] : [{pid:42,name:'MyApp.exe',started_at:'2026-11-10T12:00:00.000Z',executable:'C:\\work\\MyApp.exe'}]}};
    }
    let initialize = state.startsWith('services-') || state.startsWith('apps-') && state !== 'apps-preview' ? `this.data = ${JSON.stringify(data)};` : state === 'new-menu' ? `this.menuMode = true; this.menuLoaded = true; this.profiles = [{path:'/tmp/example-profile.json',label:'Example profile',selections:{app:'/tmp/disposable-checkout'},services:1}];` : state === 'create' ? `this.createMode = true; this.repoSlots = ['app']; this.selections = {app:'/tmp/disposable-checkout'};` : `this.previewMode = true; this.setPreview(${JSON.stringify(fixture)},'checker'); ${state === 'apps-preview' ? `this.data = ${JSON.stringify(data)};` : ''} ${state === 'preview-error' ? "this.actionError = 'Preview changed; close and reopen to review the current configuration.';" : ''}`;
    const definition = {id:'checker',name:'checker-rig',profile:'/tmp/example-profile.json',revision:'checker-revision',active:false,checkouts:{app:'/tmp/disposable-checkout'}};
    const document = {path:definition.profile,content:'{"version":1,"repos":["app"],"services":{"compiler":{"repo":"app","argv":["tsc","--watch"]}}}',revision:'checker-revision',missing:false,rigs:state === 'delete-shared-profile' ? [{...definition,active:true}] : []};
    if (state === 'rig-menu' || state === 'profile-menu') initialize = `this.contextMode = '${state}';`;
    if (state === 'edit-rig') initialize = "this.createMode = true; this.editRig = 'checker'; this.repoSlots = ['app']; this.selections = {app:'/tmp/disposable-checkout'};";
    if (state === 'profile-editor') initialize = `this.profileMode = true; this.profileEditor = EditorState.new({language:'json',value:${JSON.stringify(document.content)},readonly:false});`;
    if (state.startsWith('delete-')) initialize = 'this.deleteMode = true;';
    initialize += `this.definition = ${JSON.stringify(definition)}; this.profileDocument = ${JSON.stringify(document)};`;
    await fs.writeFile(path.join(directory,'main.js'),`import Rigs from './rigs.js';\nimport {InputState,EditorState} from 'gpui-base';\nexport default class CheckState extends Rigs { init() { this.name = InputState.new({}); this.profile = InputState.new({}); ${initialize} } }\n`);
    process.stdout.write(execFileSync('herdr-app',['check',directory],{encoding:'utf8'}));
  }
} finally { await fs.rm(root,{recursive:true,force:true}); }
