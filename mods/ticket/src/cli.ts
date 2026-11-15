import { pathToFileURL } from 'node:url';
import { loadStore, updateStore } from './store.js';
import { TicketError } from './errors.js';
import { identifyCheckout } from './identity.js';
import { createTicket, addURL, mapCheckout, removeMapping, associate, ticketById, label, now } from './model.js';
import { matchingTickets, resolveTicket, ticketContext, mergeRefresh, itemContext, copyLinks, copyStatus } from './context.js';
import { doctor, githubConnection, refreshItems } from './providers.js';
import type { Kind } from './types.js';
const help={name:'herdr-ticket',version:'0.1.0',schema_version:1,commands:{
  list:'[--checkout PATH | --watching] [--archived]',read:'[--ticket ID | --checkout PATH] [--refresh] [--timeout SECONDS]',
  create:'--name NAME [--url URL]',rename:'--ticket ID --name NAME',archive:'--ticket ID [--value true|false]',
  link:'--ticket ID --url URL [--kind task|pr|link]',unlink:'--ticket ID --item ID',
  map:'--ticket ID --name ROLE --checkout PATH',unmap:'--ticket ID --mapping ID',
  associate:'--ticket ID --from ID --to ID [--suggestion] [--evidence TEXT]',dissociate:'--ticket ID --edge ID',
  watch:'--item ID --value true|false',connect:'--provider github --host github.com [--account LOGIN]',
  copy:'--ticket ID [--format links|status] [--items ID,ID]',refresh:'--watching [--timeout SECONDS]',doctor:'',help:''
},notes:['All output is versioned JSON. Reads never log in or mutate providers.','--expected REVISION guards local edits. HERDR_TICKET_STORE selects a store.','Cached read/list/copy make no provider calls or writes. Refresh writes only observation cache.'],exit_codes:{'0':'Usable result (inspect freshness)','2':'Invalid arguments or unsupported action','3':'Ambiguous Ticket','4':'Missing target','5':'Unverified checkout','6':'Storage/installation failure','7':'Revision conflict'}};
type Args=Record<string,string|boolean>;
function parse(argv:string[]):{command:string;a:Args} {
  let command=argv[0]??'help';if(command==='--help'||command==='-h')command='help';
  const a:Args={}; const flags=new Set(['refresh','watching','archived','suggestion']);
  for(let x=1;x<argv.length;x++) {
    const key=argv[x].replace(/^--/,'');if(!argv[x].startsWith('--')||key in a)throw new TicketError('invalid_arguments','Use named, non-repeated options.');
    if(flags.has(key))a[key]=true;else{const v=argv[++x];if(!v||v.startsWith('--'))throw new TicketError('invalid_arguments',`Missing value for --${key}.`);a[key]=v;}
  }
  const allowed:Record<string,string[]>={help:[],doctor:[],list:['checkout','watching','archived'],read:['ticket','checkout','refresh','timeout'],create:['name','url'],rename:['ticket','name'],archive:['ticket','value'],link:['ticket','url','kind'],unlink:['ticket','item'],map:['ticket','name','checkout'],unmap:['ticket','mapping'],associate:['ticket','from','to','suggestion','evidence'],dissociate:['ticket','edge'],watch:['item','value'],connect:['provider','host','account'],copy:['ticket','format','items'],refresh:['watching','timeout']};
  if(!Object.hasOwn(allowed,command))throw new TicketError('invalid_arguments','Unknown command. Run herdr-ticket help.');
  for(const key of Object.keys(a))if(!allowed[command].includes(key)&&key!=='expected')throw new TicketError('invalid_arguments',`Unknown option --${key}.`);
  if(a.ticket&&a.checkout&&command==='read')throw new TicketError('invalid_arguments','--ticket and --checkout are mutually exclusive for read.');
  if(a.watching&&a.checkout)throw new TicketError('invalid_arguments','--watching and --checkout are mutually exclusive.');
  return {command,a};
}
const required=(a:Args,key:string)=>{const v=a[key];if(typeof v!=='string'||!v.trim())throw new TicketError('invalid_arguments',`--${key} is required.`);return v;};
const bool=(a:Args,key:string,fallback:boolean)=>{if(!(key in a))return fallback;if(!['true','false'].includes(String(a[key])))throw new TicketError('invalid_arguments',`--${key} must be true or false.`);return a[key]==='true';};
export async function command(argv:string[]):Promise<unknown> {
  const {command:cmd,a}=parse(argv);
  if(cmd==='help')return help;
  if(cmd==='doctor')return doctor();
  if(cmd==='refresh') {
    if(!a.watching)throw new TicketError('invalid_arguments','refresh requires --watching. Use read --refresh for a selected Ticket.');
    const seconds=Number(a.timeout??20);if(!Number.isFinite(seconds)||seconds<0.1||seconds>120)throw new TicketError('invalid_arguments','--timeout must be between 0.1 and 120 seconds.');
    const s=await loadStore(),result=await refreshItems(s,s.items.filter(i=>s.watches.includes(i.id)),seconds);
    await updateStore(s=>mergeRefresh(s,result));
    return {refreshed_items:[...new Set(result.observations.map(o=>o.item_id))]};
  }
  if(a.expected!==undefined&&!/^\d+$/.test(String(a.expected)))throw new TicketError('invalid_arguments','--expected must be a revision integer.');
  const expected=a.expected===undefined?undefined:Number(a.expected);
  if(cmd==='list') {
    const s=await loadStore();
    const tickets=a.checkout?await matchingTickets(s,String(a.checkout)):s.tickets.filter(t=>a.archived||!t.archived);
    return {revision:s.revision,tickets:a.watching?tickets.filter(t=>t.item_ids.some(id=>s.watches.includes(id))):tickets,
      ...(a.watching?{watched_items:s.watches.map(id=>itemContext(s,id))}:{})};
  }
  if(cmd==='read'||cmd==='copy') {
    let s=await loadStore();const t=await resolveTicket(s,a.ticket?String(a.ticket):undefined,String(a.checkout??process.cwd()));
    let cacheIssue:string|undefined;
    if(a.timeout&&!a.refresh)throw new TicketError('invalid_arguments','--timeout requires --refresh.');
    if(a.refresh) {
      const seconds=Number(a.timeout??20);if(!Number.isFinite(seconds)||seconds<0.1||seconds>120)throw new TicketError('invalid_arguments','--timeout must be between 0.1 and 120 seconds.');
      const result=await refreshItems(s,s.items.filter(i=>t.item_ids.includes(i.id)),seconds);
      // Merge cache into the latest local state: provider latency must not overwrite user edits.
      try {await updateStore(current=>mergeRefresh(current,result));s=await loadStore();}
      catch(e){mergeRefresh(s,result);cacheIssue=e instanceof TicketError?e.code:'cache_write_failed';}
    }
    const context=await ticketContext(s,t.id);
    if(cmd==='copy') {
      const ids=a.items?String(a.items).split(','):undefined;const format=String(a.format??'links');
      if(!['links','status'].includes(format))throw new TicketError('invalid_arguments','--format must be links or status.');
      return {text:format==='links'?copyLinks(context,ids):copyStatus(context,ids)};
    }
    return {...context,...(cacheIssue?{cache_issue:cacheIssue}:{})};
  }
  const checkout=cmd==='map'?await identifyCheckout(required(a,'checkout')):undefined;
  const connection=cmd==='connect'?await (async()=>{if(required(a,'provider')!=='github')throw new TicketError('unsupported_provider','Only the verified GitHub adapter is available. Jira/Linear URLs work without a connection.');return githubConnection(required(a,'host'),a.account?String(a.account):undefined);})():undefined;
  const result=await updateStore(s=>{
    const id=a.ticket?String(a.ticket):'';
    if(cmd==='create'){const t=createTicket(s,required(a,'name'));if(a.url)addURL(s,t.id,String(a.url));return t;}
    if(cmd==='rename'){const t=ticketById(s,required(a,'ticket'));t.name=label(required(a,'name'));t.updated_at=now();return t;}
    if(cmd==='archive'){const t=ticketById(s,required(a,'ticket'));t.archived=bool(a,'value',true);t.updated_at=now();return t;}
    if(cmd==='link') {const kind=a.kind?String(a.kind):undefined;if(kind&&!['task','pr','link'].includes(kind))throw new TicketError('invalid_arguments','Unknown item kind.');return addURL(s,required(a,'ticket'),required(a,'url'),kind as Kind|undefined);}
    if(cmd==='map')return mapCheckout(s,required(a,'ticket'),required(a,'name'),checkout!);
    if(cmd==='unmap')return removeMapping(s,required(a,'ticket'),required(a,'mapping'));
    if(cmd==='associate')return associate(s,required(a,'ticket'),required(a,'from'),required(a,'to'),!a.suggestion,String(a.evidence??'Explicit local link'));
    if(cmd==='dissociate'){ticketById(s,required(a,'ticket'));const eid=required(a,'edge');if(!s.edges.some(e=>e.id===eid&&e.ticket_id===id))throw new TicketError('edge_not_found','Association was not found in this Ticket.');s.edges=s.edges.filter(e=>e.id!==eid);return {removed:eid};}
    if(cmd==='unlink') {const t=ticketById(s,required(a,'ticket')),item=required(a,'item');if(!t.item_ids.includes(item))throw new TicketError('item_not_found','Item does not belong to this Ticket.');t.item_ids=t.item_ids.filter(x=>x!==item);s.edges=s.edges.filter(e=>e.ticket_id!==id||(e.from!==item&&e.to!==item));return t;}
    if(cmd==='watch'){const item=required(a,'item');if(!s.items.some(i=>i.id===item))throw new TicketError('item_not_found','Item was not found.');s.watches=s.watches.filter(id=>id!==item);if(bool(a,'value',true))s.watches.push(item);return {item_id:item,watching:s.watches.includes(item)};}
    if(cmd==='connect'){s.connections=s.connections.filter(c=>c.provider!==connection!.provider||c.host!==connection!.host);s.connections.push(connection!);return connection;}
    throw new TicketError('invalid_arguments','Unknown local command.');
  },expected);
  return {result,revision:(await loadStore()).revision};
}
export async function main(argv=process.argv.slice(2)):Promise<void> {
  try {const data=await command(argv);process.stdout.write(JSON.stringify({schema_version:1,ok:true,data,error:null})+'\n');}
  catch(e){const err=e instanceof TicketError?e:new TicketError('internal_error','Ticket could not complete the operation. No provider writes were attempted.',6);process.stdout.write(JSON.stringify({schema_version:1,ok:false,data:null,error:{code:err.code,message:err.message,...(err.details?{details:err.details}:{})}})+'\n');process.exitCode=err.exit;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
