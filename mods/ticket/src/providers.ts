import { execute } from './process.js';
import { connectionIssue, TicketError } from './errors.js';
import type { Item, Observation, Store, Connection } from './types.js';
import { now } from './model.js';
export type Runner = (command:string,args:string[],timeout:number) => Promise<string>;
export interface RefreshResult { observations: Observation[]; identities: {item_id:string;remote_id:string;title:string;repository_id?:string;url?:string}[] }
const timeoutIssue={code:'timeout',message:'Provider refresh exceeded its total deadline.'};
export async function githubConnection(host:string,account?:string,run:Runner=execute):Promise<Connection> {
  if (host !== 'github.com') throw new TicketError('unsupported_host','This release supports GitHub observations on github.com; other hosts work as saved URLs.');
  try {
    const user=JSON.parse(await run('gh',['api','--hostname',host,'user'],5000));
    if (typeof user.login!=='string') throw new Error('invalid schema');
    if (account && account.toLowerCase()!==user.login.toLowerCase()) throw new TicketError('account_mismatch','The active gh account does not match the selected account. Switch it in your own terminal.');
    return {provider:'github',host,account:user.login,projects:[]};
  } catch (e) { if (e instanceof TicketError) throw e; const issue=connectionIssue(e);throw new TicketError(issue.code,issue.message,2); }
}
export async function doctor(run:Runner=execute) {
  const inspect=async(command:string)=>{
    try { const version=await run(command,['--version'],3000); await run(command,['--help'],3000); return {installed:true,version:version.split('\n')[0].slice(0,150)}; }
    catch(e) {return {installed:false,issue:connectionIssue(e)};}
  };
  const [gh,twg]=await Promise.all([inspect('gh'),inspect('twg')]);
  let authentication:{authenticated:boolean;account?:string;issue?:{code:string;message:string;hint?:string}}={authenticated:false};
  if(gh.installed) {
    try {const connection=await githubConnection('github.com',undefined,run);authentication={authenticated:true,account:connection.account};}
    catch(error) {authentication={authenticated:false,issue:error instanceof TicketError?{code:error.code,message:error.message,hint:'Check gh auth status in your terminal.'}:connectionIssue(error)};}
  }
  return {github:{...gh,...authentication,capabilities:['pr','checks','reviews','threads']},jira:{...twg,capabilities:[],adapter_issue:{code:'adapter_unverified',message:'TWG Jira commands and tenant reads have not been verified. Saved Jira URLs remain usable.'}},remote_checkouts:{supported:false}};
}
export async function refreshItems(store:Store,items:Item[],seconds:number,run:Runner=execute):Promise<RefreshResult> {
  const deadline=Date.now()+seconds*1000, attempted=now();
  const result:RefreshResult={observations:[],identities:[]};
  const remaining=()=>Math.max(1,deadline-Date.now());
  const call=async(args:string[])=>{
    if(Date.now()>=deadline) throw Object.assign(new Error('timeout'),{killed:true});
    return JSON.parse(await run('gh',args,remaining()));
  };
  const auth=new Map<string,Promise<void>>();
  const verify=(host:string)=>{
    if(!auth.has(host)) auth.set(host,(async()=>{
      const user=await call(['api','--hostname',host,'user']);
      if(typeof user.login!=='string'||!user.login.trim())throw new Error('authentication unavailable');
    })());
    return auth.get(host)!;
  };
  const observe=async(item:Item,source:string,work:()=>Promise<{data:Observation['data'];head_sha?:string;omitted?:string[]}>)=>{
    const prior=store.observations.find(o=>o.item_id===item.id&&o.source===source);
    try {
      const value=await work();
      result.observations.push({item_id:item.id,source,attempted_at:attempted,observed_at:now(),error:null,data:value.data,head_sha:value.head_sha,omitted:value.omitted??[]});
    } catch(e) {
      result.observations.push({item_id:item.id,source,attempted_at:attempted,observed_at:prior?.observed_at??null,error:Date.now()>=deadline?timeoutIssue:connectionIssue(e),data:prior?.data??{},head_sha:prior?.head_sha,omitted:prior?.omitted??[source]});
    }
  };
  const readItem=async(item:Item)=>{
    if(item.provider!=='github'||item.kind!=='pr') {
      const prior=store.observations.find(o=>o.item_id===item.id&&o.source==='metadata');
      result.observations.push({item_id:item.id,source:'metadata',attempted_at:attempted,observed_at:prior?.observed_at??null,data:prior?.data??{},error:{code:'unsupported_observation',message:item.provider==='jira'?'Jira refresh awaits verified TWG commands and tenant access.':'This source is available as a saved URL only.'},omitted:['metadata']});return;
    }
    const u=new URL(item.url), [,owner,repo,,number]=u.pathname.split('/');
    let head:string|undefined;
    await observe(item,'metadata',async()=>{
      await verify(item.host);
      const p=await call(['pr','view',item.url,'--json','id,url,title,state,headRefOid,reviewDecision,mergeable']);
      if(typeof p.id!=='string'||typeof p.title!=='string'||!['OPEN','CLOSED','MERGED'].includes(p.state)|| !/^[0-9a-f]{40,64}$/.test(p.headRefOid)) throw new Error('invalid provider schema');
      head=p.headRefOid; result.identities.push({item_id:item.id,remote_id:p.id,title:p.title.slice(0,500),url:safeURL(p.url)??undefined});
      return {data:{title:p.title.slice(0,500),state:p.state,head_sha:head,review_decision:p.reviewDecision||'UNKNOWN',mergeable:p.mergeable},head_sha:head};
    });
    if(!head) {
      for(const source of ['checks','reviews','threads']) {
        const prior=store.observations.find(o=>o.item_id===item.id&&o.source===source);
        result.observations.push({item_id:item.id,source,attempted_at:attempted,observed_at:prior?.observed_at??null,data:prior?.data??{},head_sha:prior?.head_sha,error:{code:'head_unverified',message:'Current PR head could not be verified.'},omitted:prior?.omitted??[source]});
      }
      return;
    }
    const query=async(body:string,cursor:string|null)=>{
      const args=['api','graphql','--hostname',item.host,'-f',`query=query($owner:String!,$repo:String!,$number:Int!,$head:GitObjectID!,$cursor:String){repository(owner:$owner,name:$repo){id ${body}}}`,'-f',`owner=${owner}`,'-f',`repo=${repo}`,'-F',`number=${number}`,'-f',`head=${head}`];
      // GraphQL rejects unused variables. Use the same referenced values in a cheap head verification field.
      if(cursor) args.push('-f',`cursor=${cursor}`);
      const r=await call(args);if(r.errors||!r.data?.repository)throw new Error('provider permission or schema error');
      const identity=result.identities.find(x=>x.item_id===item.id);
      if(identity&&typeof r.data.repository.id==='string')identity.repository_id=`github:${item.host}:${r.data.repository.id}`;
      return r.data.repository;
    };
    const pages=async(body:string,select:(r:any)=>any)=>{
      let cursor:string|null=null;const nodes:any[]=[];
      for(let page=0;page<20;page++) {
        const connection=select(await query(body,cursor));
        if(!connection||!Array.isArray(connection.nodes)||typeof connection.pageInfo?.hasNextPage!=='boolean')throw new Error('invalid pagination schema');
        nodes.push(...connection.nodes);
        if(!connection.pageInfo.hasNextPage)return {nodes,omitted:[] as string[]};
        if(!connection.pageInfo.endCursor||connection.pageInfo.endCursor===cursor)throw new Error('invalid cursor');
        cursor=connection.pageInfo.endCursor;
      }
      return {nodes,omitted:['pagination_limit']};
    };
    // Every source is bound to the verified head, and final context compares it with metadata.
    await Promise.all([
      observe(item,'checks',async()=>{
        const body='pullRequest(number:$number){headRefOid} object(oid:$head){... on Commit {oid statusCheckRollup{contexts(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{__typename ... on CheckRun{name status conclusion detailsUrl} ... on StatusContext{context state targetUrl}}}}}}';
        const p=await pages(body,r=>{
          if(r.object?.oid!==head)throw new Error('invalid head schema');
          return r.object.statusCheckRollup===null?{nodes:[],pageInfo:{hasNextPage:false}}:r.object.statusCheckRollup?.contexts;
        });
        if(p.nodes.some(c=>typeof(c.name??c.context)!=='string'||typeof(c.conclusion??c.status??c.state)!=='string'))throw new Error('invalid check schema');
        return {head_sha:head,data:{checks:p.nodes.map(c=>({name:String(c.name??c.context).slice(0,500),state:String(c.conclusion??c.status??c.state),url:safeURL(c.detailsUrl??c.targetUrl)}))},omitted:p.omitted};
      }),
      observe(item,'reviews',async()=>{
        const body='object(oid:$head){oid} pullRequest(number:$number){headRefOid reviews(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{state commit{oid} url}}}';
        const p=await pages(body,r=>r.pullRequest?.reviews);
        if(p.nodes.some(r=>typeof r.state!=='string'||(r.commit!==null&&typeof r.commit?.oid!=='string')))throw new Error('invalid review schema');
        return {head_sha:head,data:{reviews:p.nodes.map(r=>({state:String(r.state),commit:r.commit?.oid??null,url:safeURL(r.url)}))},omitted:[...p.omitted,'branch_protection_rules','merge_readiness']};
      }),
      observe(item,'threads',async()=>{
        const body='object(oid:$head){oid} pullRequest(number:$number){headRefOid reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{isResolved path line comments(first:1){nodes{url}}}}}';
        const p=await pages(body,r=>r.pullRequest?.reviewThreads);
        if(p.nodes.some(t=>typeof t.isResolved!=='boolean'||typeof t.path!=='string'||!Array.isArray(t.comments?.nodes)))throw new Error('invalid thread schema');
        const threads=p.nodes.map(t=>({resolved:!!t.isResolved,path:String(t.path).slice(0,1000),line:t.line??null,url:safeURL(t.comments?.nodes?.[0]?.url)}));
        return {head_sha:head,data:{threads,unresolved_threads:threads.filter(t=>!t.resolved).length},omitted:p.omitted};
      }),
    ]);
    // A push during refresh invalidates that batch; cached prior results keep their timestamps.
    await observe(item,'metadata',async()=>{
      const p=await call(['pr','view',item.url,'--json','id,title,state,headRefOid,reviewDecision,mergeable']);
      if(typeof p.id!=='string'||typeof p.title!=='string'||!['OPEN','CLOSED','MERGED'].includes(p.state)||!/^[0-9a-f]{40,64}$/.test(p.headRefOid))throw new Error('invalid schema');
      return {head_sha:p.headRefOid,data:{title:String(p.title).slice(0,500),state:p.state,head_sha:p.headRefOid,review_decision:p.reviewDecision||'UNKNOWN',mergeable:p.mergeable}};
    });
  };
  // At most three PRs in flight. All operations share a single wall-clock deadline.
  let index=0;
  await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{for(;;){const item=items[index++];if(!item)return;await readItem(item);}}));
  // The final metadata observation supersedes the initial one for each item/source.
  result.observations=[...new Map(result.observations.map(o=>[`${o.item_id}:${o.source}`,o])).values()];
  return result;
}
function safeURL(value:unknown):string|null {try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.toString():null;}catch{return null;}}
