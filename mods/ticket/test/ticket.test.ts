import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execute } from '../src/process.js';
import { emptyStore, updateStore, loadStore } from '../src/store.js';
import { createTicket, addURL, mapCheckout, associate, removeMapping, normalizeURL } from '../src/model.js';
import { identifyCheckout } from '../src/identity.js';
import { resolveTicket, matchingTickets, ticketContext, mergeRefresh, copyLinks, copyStatus } from '../src/context.js';
import { doctor, refreshItems, type Runner } from '../src/providers.js';
import { connectionIssue, TicketError } from '../src/errors.js';
import type { Context, Store } from '../src/types.js';
let root:string,repo:string,other:string;
const env={...process.env};
before(async()=>{
  root=await mkdtemp(join(tmpdir(),'herdr-ticket-tests-'));
  process.env.HERDR_TICKET_STORE=join(root,'store.json');
  process.env.HERDR_TICKET_CORE_ID_FILE=join(root,'core.json');
  await writeFile(process.env.HERDR_TICKET_CORE_ID_FILE,JSON.stringify({id:'test-machine-1234'}));
  repo=join(root,'web');other=join(root,'api');
  for(const path of [repo,other]) {
    await mkdir(path);await execute('git',['init','-q',path]);
    await execute('git',['-C',path,'-c','user.name=Ticket test','-c','user.email=ticket@example.invalid','commit','--allow-empty','-qm','initial']);
  }
});
after(async()=>{process.env=env;await rm(root,{recursive:true,force:true});});
test('cross-repo context, nested checkout and many-to-many explicit edges',async()=>{
  const s=emptyStore(),a=createTicket(s,'Authentication'),b=createTicket(s,'Shared checkout');
  const web=await identifyCheckout(repo),api=await identifyCheckout(other);
  mapCheckout(s,a.id,'web',web);mapCheckout(s,a.id,'api',api);mapCheckout(s,b.id,'shared',web);
  const task1=addURL(s,a.id,'https://example.atlassian.net/browse/APP-421'),task2=addURL(s,a.id,'https://example.atlassian.net/browse/APP-438');
  const pr=addURL(s,a.id,'https://github.com/example/web/pull/12');
  associate(s,a.id,task1.id,web.id);associate(s,a.id,task2.id,web.id);associate(s,a.id,task1.id,pr.id);
  await mkdir(join(repo,'src'));
  assert.deepEqual((await matchingTickets(s,join(repo,'src'))).map(t=>t.id),[a.id,b.id]);
  await assert.rejects(resolveTicket(s,undefined,repo),(e:unknown)=>e instanceof TicketError&&e.code==='ambiguous_ticket'&&(e.details as any).candidates.length===2);
  const c=await ticketContext(s,a.id);assert.equal(c.mappings.length,2);assert.equal(c.tasks.length,2);
  assert.equal(c.associations.filter(e=>e.relation==='task_pr').length,1);
  assert.equal((await resolveTicket(s,a.id,'/missing')).id,a.id);
  removeMapping(s,a.id,a.mappings[0].id);
  assert.equal(s.edges.filter(e=>e.relation==='task_pr').length,1);assert.ok(s.watches.includes(pr.id));
});
test('distinct checkouts of same repo; recreation and machine replacement never reattach',async()=>{
  const work=join(root,'work');await execute('git',['-C',repo,'worktree','add','-qb','topic',work]);
  const s=emptyStore(),t=createTicket(s,'Two checkouts'),a=await identifyCheckout(repo),b=await identifyCheckout(work);
  assert.equal(a.repository_id,b.repository_id);assert.notEqual(a.fingerprint,b.fingerprint);
  mapCheckout(s,t.id,'main',a);mapCheckout(s,t.id,'topic',b);assert.equal(t.mappings.length,2);
  await execute('git',['-C',repo,'checkout','-qb','observed-branch']);
  assert.equal((await ticketContext(s,t.id)).mappings[0].checkout.branch,'observed-branch');
  assert.equal((await matchingTickets(s,repo))[0].id,t.id);
  await execute('git',['-C',repo,'checkout','-q',a.branch]);
  await execute('git',['-C',repo,'worktree','remove',work]);
  await execute('git',['-C',repo,'worktree','add','-q',work,'topic']);
  assert.notEqual((await identifyCheckout(work)).fingerprint,b.fingerprint);
  assert.equal((await matchingTickets(s,work)).length,0);
  const c=await ticketContext(s,t.id);assert.equal(c.mappings[1].availability,'unavailable');
  await writeFile(process.env.HERDR_TICKET_CORE_ID_FILE!,JSON.stringify({id:'different-machine-1234'}));
  assert.equal((await matchingTickets(s,repo)).length,0);
  await writeFile(process.env.HERDR_TICKET_CORE_ID_FILE!,JSON.stringify({id:'test-machine-1234'}));
});
test('atomic local updates, conflict detection and corrupt-store preservation',async()=>{
  await updateStore(s=>createTicket(s,'Durable'),0);
  const first=await loadStore();assert.equal(first.revision,1);
  await assert.rejects(updateStore(s=>createTicket(s,'Lost update'),0),{code:'revision_conflict'});
  assert.equal((await loadStore()).tickets.length,1);
  assert.equal((await stat(process.env.HERDR_TICKET_STORE!)).mode&0o777,0o600);
  const bad=join(root,'bad.json');await writeFile(bad,'{bad');
  await assert.rejects(updateStore(s=>createTicket(s,'No'),undefined,bad),{code:'unreadable_storage'});
  assert.equal(await readFile(bad,'utf8'),'{bad');
  const before=await readFile(process.env.HERDR_TICKET_STORE!,'utf8');
  await assert.rejects(updateStore(s=>{s.tickets[0].item_ids.push('missing');}),{code:'invalid_storage'});
  assert.equal(await readFile(process.env.HERDR_TICKET_STORE!,'utf8'),before);
});
test('URL normalization, deduplication, safe schemes and copy selection',async()=>{
  const s=emptyStore(),t=createTicket(s,'Copies');
  const one=addURL(s,t.id,'https://github.com/example/web/pull/12/files#abc');
  assert.equal(addURL(s,t.id,'https://github.com/example/web/pull/12?x=1').id,one.id);
  const task=addURL(s,t.id,'https://example.atlassian.net/browse/APP-421?from=search');
  const web=await identifyCheckout(repo);mapCheckout(s,t.id,'web',web);associate(s,t.id,one.id,web.id);
  const c=await ticketContext(s,t.id);
  assert.equal(copyLinks(c,[task.id]),task.url);assert.equal(copyLinks(c,[web.id]),one.url);
  assert.equal(copyLinks(c).split('\n').length,2);assert.ok(!copyLinks(c).includes(repo));
  assert.throws(()=>copyLinks(c,['outside']),{code:'invalid_selection'});
  for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.com/a'])assert.throws(()=>normalizeURL(url));
  assert.equal(normalizeURL('https://example.org/doc?id=1#part'),'https://example.org/doc?id=1#part');
});
function providerStore():{s:Store;id:string;pr:string;task:string} {
  const s=emptyStore(),t=createTicket(s,'Provider tests'),pr=addURL(s,t.id,'https://github.com/example/web/pull/12'),task=addURL(s,t.id,'https://example.atlassian.net/browse/APP-421');
  s.connections.push({provider:'github',host:'github.com',account:'test-user',projects:[]});
  return {s,id:t.id,pr:pr.id,task:task.id};
}
const head='a'.repeat(40),newHead='b'.repeat(40);
function fakeRunner(options:{push?:boolean;failReviews?:boolean;calls?:string[][]}={}):Runner {
  let metadata=0;
  return async(command,args)=>{
    assert.equal(command,'gh');assert.ok(!args.slice(0,2).some(a=>['login','comment','merge','retry'].includes(a)));
    options.calls?.push(args);
    if(args.includes('user'))return JSON.stringify({login:'test-user'});
    if(args[0]==='pr'){metadata++;return JSON.stringify({id:'PR_remote',title:'Authentication',state:'OPEN',headRefOid:options.push&&metadata>1?newHead:head,reviewDecision:'APPROVED',mergeable:'MERGEABLE'});}
    const query=args.find(x=>x.startsWith('query='))!;
    if(query.includes('reviewThreads'))return JSON.stringify({data:{repository:{pullRequest:{headRefOid:head,reviewThreads:{nodes:[{isResolved:false,path:'app.ts',line:8,comments:{nodes:[{url:'https://github.com/example/web/pull/12#discussion_r1'}]}}],pageInfo:{hasNextPage:false}}}}}});
    if(query.includes('reviews(')){
      if(options.failReviews)throw Object.assign(new Error('permission 403 token=PRIVATE'),{stderr:'PRIVATE'});
      return JSON.stringify({data:{repository:{pullRequest:{headRefOid:head,reviews:{nodes:[{state:'APPROVED',commit:{oid:head},url:'https://github.com/example/web/pull/12#pullrequestreview-1'}],pageInfo:{hasNextPage:false}}}}}});
    }
    return JSON.stringify({data:{repository:{id:'R_remote',pullRequest:{headRefOid:head},object:{oid:head,statusCheckRollup:{contexts:{nodes:[{name:'test',conclusion:'FAILURE',detailsUrl:'https://github.com/example/web/actions/runs/1'}],pageInfo:{hasNextPage:false}}}}}}});
  };
}
test('partial provider refresh retains separate source health and exact attention links',async()=>{
  const {s,id,pr,task}=providerStore();const r=await refreshItems(s,s.items,1,fakeRunner({failReviews:true}));mergeRefresh(s,r);
  const c=await ticketContext(s,id),p=c.prs[0];
  assert.equal(c.completeness,'partial');assert.equal(p.sources.find(s=>s.source==='checks')?.freshness,'fresh');
  assert.equal(p.sources.find(s=>s.source==='checks')?.data.checks?.[0].url,'https://github.com/example/web/actions/runs/1');
  assert.equal(p.sources.find(s=>s.source==='reviews')?.freshness,'unavailable');
  assert.equal(c.tasks[0].sources[0].freshness,'unavailable');
  assert.ok(!JSON.stringify(c).includes('PRIVATE'));assert.equal(s.items.find(i=>i.id===pr)?.remote_id,'PR_remote');
  assert.equal(s.items.find(i=>i.id===pr)?.repository_id,'github:github.com:R_remote');
  assert.ok(s.watches.includes(task));
});
test('a changed head invalidates checks/reviews even when timestamps are fresh',async()=>{
  const {s,id}=providerStore();mergeRefresh(s,await refreshItems(s,s.items,1,fakeRunner({push:true})));
  const c=await ticketContext(s,id),p=c.prs[0];assert.equal(p.sources.find(s=>s.source==='metadata')?.head_sha,newHead);
  assert.equal(p.sources.find(s=>s.source==='checks')?.freshness,'stale');
  assert.equal(p.sources.find(s=>s.source==='reviews')?.freshness,'stale');
  assert.match(copyStatus(c),/checks: test: FAILURE \[stale/);
});
test('failed refresh preserves successful data and its observation time',async()=>{
  const {s,id}=providerStore();mergeRefresh(s,await refreshItems(s,s.items,1,fakeRunner()));
  const old=s.observations.find(o=>o.source==='checks')!;
  old.observed_at='2020-01-01T00:00:00.000Z';
  mergeRefresh(s,await refreshItems(s,s.items,1,async()=>{throw new Error('offline');}));
  const c=await ticketContext(s,id),checks=c.prs[0].sources.find(s=>s.source==='checks')!;
  assert.equal(checks.observed_at,'2020-01-01T00:00:00.000Z');assert.equal(checks.data.checks?.[0].state,'FAILURE');assert.notEqual(checks.freshness,'fresh');
});
test('pagination follows cursors and combines results without duplicate sources',async()=>{
  const {s}=providerStore();let pages=0;const delegate=fakeRunner();
  const run:Runner=async(cmd,args,timeout)=>{
    const q=args.find(x=>x.startsWith('query='))??'';
    if(q.includes('reviewThreads')){
      pages++;if(pages===2)assert.ok(args.includes('cursor=next'));
      return JSON.stringify({data:{repository:{pullRequest:{reviewThreads:{nodes:[{isResolved:pages===2,path:'a.ts',line:1,comments:{nodes:[]}}],pageInfo:{hasNextPage:pages===1,endCursor:'next'}}}}}});
    }
    return delegate(cmd,args,timeout);
  };
  const r=await refreshItems(s,s.items,1,run);assert.equal(pages,2);
  assert.equal(r.observations.filter(o=>o.source==='metadata').length,2); // one per PR and Jira item
  assert.equal(r.observations.find(o=>o.source==='threads')?.data.threads?.length,2);
});
test('total refresh deadline and noninteractive process failure are bounded',async()=>{
  const {s,pr}=providerStore(),started=Date.now();
  const r=await refreshItems(s,s.items,0.1,async(_cmd,_args,timeout)=>{await execute(process.execPath,['-e','setTimeout(()=>{},5000)'],timeout);return '{}';});
  assert.ok(Date.now()-started<1500);assert.equal(r.observations.find(o=>o.source==='metadata'&&o.item_id===pr)?.error?.code,'timeout');
  assert.equal(connectionIssue({code:'ENOENT'}).code,'tool_missing');assert.equal(connectionIssue({stderr:'HTTP 401 SECRET'}).code,'connection_required');
  assert.ok(!JSON.stringify(connectionIssue({message:'SECRET'})).includes('SECRET'));
});
test('cached CLI reads with app/provider absent are read-only and return versioned JSON',async()=>{
  const {s,id}=providerStore();s.tickets[0].archived=true;
  await writeFile(process.env.HERDR_TICKET_STORE!,JSON.stringify(s));await chmod(process.env.HERDR_TICKET_STORE!,0o400);
  const before=await readFile(process.env.HERDR_TICKET_STORE!,'utf8');
  const cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const run=(args:string[])=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env:{...process.env,PATH:'/no-programs',HERDR_TICKET_CORE_ID_FILE:'/no-core'}});
  const read=run(['read','--ticket',id]);assert.equal(read.status,0);const json=JSON.parse(read.stdout);assert.equal(json.schema_version,1);assert.equal(json.data.ticket.archived,true);assert.equal(json.data.prs.length,1);
  assert.equal(await readFile(process.env.HERDR_TICKET_STORE!,'utf8'),before);
  const invalid=run(['read','--ticket',id,'--checkout',repo]);assert.equal(invalid.status,2);assert.equal(JSON.parse(invalid.stdout).error.code,'invalid_arguments');
  const missing=run(['read']);assert.equal(missing.status,5);assert.equal(JSON.parse(missing.stdout).error.code,'unverified_checkout');
  await chmod(process.env.HERDR_TICKET_STORE!,0o600);
});
test('merge refresh preserves concurrent local edits and confirmed edges',async()=>{
  const {s,id,pr,task}=providerStore();associate(s,id,task,pr);
  const result=await refreshItems(s,s.items,1,fakeRunner());
  s.tickets[0].name='Renamed while reading';s.tickets[0].archived=true;
  mergeRefresh(s,result);assert.equal(s.tickets[0].name,'Renamed while reading');assert.equal(s.tickets[0].archived,true);assert.equal(s.edges[0].confirmed,true);
});
test('malformed checks cannot become a fresh empty success',async()=>{
  const {s,id}=providerStore(),delegate=fakeRunner();
  const run:Runner=async(cmd,args,timeout)=>args.some(a=>a.startsWith('query=')&&a.includes('statusCheckRollup'))?JSON.stringify({data:{repository:{object:null}}}):delegate(cmd,args,timeout);
  mergeRefresh(s,await refreshItems(s,s.items,1,run));
  const check=(await ticketContext(s,id)).prs[0].sources.find(o=>o.source==='checks')!;
  assert.equal(check.freshness,'unknown');assert.equal(check.observed_at,null);assert.ok(check.error);
});
test('confirmed relationships survive suggestions; refresh never changes association choices',async()=>{
  const {s,id,pr,task}=providerStore();const edge=associate(s,id,task,pr,true);
  associate(s,id,pr,task,false,'Branch key suggestion');assert.equal(s.edges.length,1);assert.equal(edge.confirmed,true);
  const other=createTicket(s,'Other');const duplicate=addURL(s,other.id,'https://github.com/renamed/web/pull/12');
  duplicate.remote_id='PR_remote';
  const choices=JSON.stringify({tickets:s.tickets,edges:s.edges,watches:s.watches});
  mergeRefresh(s,await refreshItems(s,s.items.filter(i=>i.id===pr),1,fakeRunner()));
  assert.equal(JSON.stringify({tickets:s.tickets,edges:s.edges,watches:s.watches}),choices);
  assert.equal(s.items.filter(i=>i.remote_id==='PR_remote').length,2);assert.ok(other.item_ids.includes(duplicate.id));assert.ok(s.watches.includes(pr));assert.equal(s.edges[0].confirmed,true);
});
test('installer preserves other mods/layouts and refuses local edits and collisions',async()=>{
  const host=join(root,'host'),bin=join(root,'bin/herdr-ticket');
  await mkdir(join(host,'mods/other'),{recursive:true});await writeFile(join(host,'mods/other/main.js'),'user code');
  await mkdir(join(host,'layouts'));await writeFile(join(host,'layouts/personal.json'),'user layout');
  const script=fileURLToPath(new URL('../../scripts/install.mjs',import.meta.url));
  const run=()=>spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,HERDR_APP_HOME:host,HERDR_TICKET_BIN:bin}});
  const first=run();assert.equal(first.status,0,first.stderr);assert.equal(run().status,0);
  const target=join(host,'mods/ticket/main.js');await writeFile(target,'local edit');
  assert.notEqual(run().status,0);assert.equal(await readFile(target,'utf8'),'local edit');
  assert.equal(await readFile(join(host,'mods/other/main.js'),'utf8'),'user code');assert.equal(await readFile(join(host,'layouts/personal.json'),'utf8'),'user layout');
});
test('GitHub refresh uses gh authentication without a saved Ticket connection',async()=>{
  const {s,id}=providerStore();s.connections=[];
  const choices=JSON.stringify(s),calls:string[][]=[];
  const result=await refreshItems(s,s.items,1,fakeRunner({calls}));
  assert.equal(JSON.stringify(s),choices); // The adapter itself writes no connection or associations.
  mergeRefresh(s,result);
  const c=await ticketContext(s,id);
  assert.ok(c.prs[0].sources.every(source=>source.freshness==='fresh'));
  assert.equal(calls.filter(args=>args.includes('user')).length,1);
  assert.ok(!calls.some(args=>args.includes('auth')||args.includes('login')));
});
test('changing gh active account is not blocked by an old Ticket connection record',async()=>{
  const {s,id}=providerStore();s.connections[0].account='previous-user';
  mergeRefresh(s,await refreshItems(s,s.items,1,fakeRunner()));
  assert.ok((await ticketContext(s,id)).prs[0].sources.every(source=>source.freshness==='fresh'));
  assert.equal(s.connections[0].account,'previous-user'); // Cached references are informational, not credential selection.
});
test('Connections detects gh account without asking for login or starting authentication',async()=>{
  const calls:string[][]=[];
  const result=await doctor(async(cmd,args)=>{
    calls.push([cmd,...args]);
    if(cmd==='twg')throw Object.assign(new Error('missing'),{code:'ENOENT'});
    if(args.includes('user'))return JSON.stringify({login:'existing-user'});
    return 'gh version test';
  });
  assert.equal(result.github.authenticated,true);assert.equal(result.github.account,'existing-user');
  assert.ok(!calls.some(args=>args.includes('login')||args.includes('connect')));
});
test('Ticket closes while loading and an older response cannot reopen or replace it',async()=>{
  // Exercise the built view controller without a renderer; the real host separately checks and renders it.
  const module=await readFile(fileURLToPath(new URL('../../build/ticket/main.js',import.meta.url)),'utf8');
  const source=module.replace(/^import .+;\n/gm,'').replace('export default class','return class');
  const Panel=new Function('View',source)(class {}),panel=new Panel();
  const replies:((value:unknown)=>void)[]=[],tasks:Promise<void>[]=[];
  panel.call=()=>new Promise(resolve=>replies.push(resolve));
  const cx={notify(){},spawn(work:(cx:unknown)=>Promise<void>){tasks.push(work(cx));}};
  panel.select('ticket-a',cx);assert.equal(panel.selected,'ticket-a');
  panel.select('ticket-a',cx);assert.equal(panel.selected,'');assert.equal(panel.detail,null);
  replies[0]({ticket:{id:'ticket-a'},marker:'closed response'});await tasks[0];assert.equal(panel.detail,null);
  panel.select('ticket-a',cx);panel.select('ticket-a',cx);panel.select('ticket-a',cx);
  replies[2]({ticket:{id:'ticket-a'},marker:'new response'});await tasks[2];
  replies[1]({ticket:{id:'ticket-a'},marker:'old response'});await tasks[1];
  assert.equal(panel.detail.marker,'new response');
  panel.select('ticket-a',cx);assert.equal(panel.selected,'');assert.equal(panel.detail,null);
});
