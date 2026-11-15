import { availability, identifyCheckout } from './identity.js';
import { TicketError } from './errors.js';
import { ticketById } from './model.js';
import type { Store, Ticket, Context, SourceView, Freshness, ContextItem } from './types.js';
import type { RefreshResult } from './providers.js';
export const MAX_AGE=300;
export async function matchingTickets(s:Store,path:string):Promise<Ticket[]> {
  const c=await identifyCheckout(path);
  const ids=new Set(s.checkouts.filter(x=>x.machine_id===c.machine_id&&x.fingerprint===c.fingerprint).map(x=>x.id));
  return s.tickets.filter(t=>!t.archived&&t.mappings.some(m=>ids.has(m.checkout_id)));
}
export async function resolveTicket(s:Store,id?:string,path=process.cwd()):Promise<Ticket> {
  if(id)return ticketById(s,id);
  const matches=await matchingTickets(s,path);
  if(!matches.length)throw new TicketError('no_matching_ticket','No active Ticket matches this verified checkout.',4);
  if(matches.length>1)throw new TicketError('ambiguous_ticket','Several Tickets match. Read with an explicit --ticket ID.',3,{candidates:matches.map(t=>({id:t.id,name:t.name}))});
  return matches[0];
}
export function mergeRefresh(s:Store,result:RefreshResult):void {
  for(const o of result.observations) {
    // A newer concurrent read wins. Failure never replaces newer successful payloads.
    const index=s.observations.findIndex(x=>x.item_id===o.item_id&&x.source===o.source);
    const prior=s.observations[index];
    if(prior && (prior.attempted_at??'')>(o.attempted_at??''))continue;
    const value=o.error&&prior?{...prior,attempted_at:o.attempted_at,error:o.error}:o;
    if(index<0)s.observations.push(value);else s.observations[index]=value;
  }
  for(const identity of result.identities) {
    const item=s.items.find(i=>i.id===identity.item_id);if(!item)continue;
    item.remote_id=identity.remote_id;item.title=identity.title;
    if(identity.repository_id)item.repository_id=identity.repository_id;
    if(identity.url)item.url=identity.url;
    // Verified URL aliases may share a remote identity. A refresh must never rewrite
    // memberships, relationships, or watches; alias consolidation needs a local edit.
  }
}
export function itemContext(s:Store,id:string,at=Date.now()):ContextItem {
  const i=s.items.find(i=>i.id===id)!;
  const saved=s.observations.filter(o=>o.item_id===id);
  const expected=i.provider==='github'&&i.kind==='pr'?['metadata','checks','reviews','threads']:['metadata'];
  const meta=saved.find(o=>o.source==='metadata');
  const sources:SourceView[]=expected.map(source=>{
    const o=saved.find(o=>o.source===source)??{item_id:id,source,observed_at:null,attempted_at:null,data:{},error:null,omitted:[source]};
    const observed=o.observed_at?Date.parse(o.observed_at):NaN;
    let freshness:Freshness=!Number.isFinite(observed)||observed>at+60000?'unknown':o.error?'stale':at-observed>MAX_AGE*1000?'stale':'fresh';
    if(o.error&&['unsupported_observation','unavailable','tool_missing','connection_required'].includes(o.error.code))freshness='unavailable';
    if(source!=='metadata'&&freshness==='fresh'&&(!meta?.head_sha||meta.error||!meta.observed_at||at-Date.parse(meta.observed_at)>MAX_AGE*1000||o.head_sha!==meta.head_sha)) freshness='stale';
    return {...o,freshness};
  });
  return {...i,title:meta?.data.title??i.title,sources};
}
export async function ticketContext(s:Store,id:string):Promise<Context> {
  const t=ticketById(s,id), at=Date.now();
  const mappings=await Promise.all(t.mappings.map(async m=>{
    const checkout=s.checkouts.find(c=>c.id===m.checkout_id)!;
    return {...m,...await availability(checkout)};
  }));
  const items=t.item_ids.map(id=>itemContext(s,id,at));
  const omitted=items.flatMap(i=>i.sources.flatMap(o=>o.omitted.map(field=>`${i.id}:${o.source}:${field}`)));
  return {ticket:structuredClone(t),revision:s.revision,generated_at:new Date(at).toISOString(),mappings,
    tasks:items.filter(i=>i.kind==='task'),prs:items.filter(i=>i.kind==='pr'),links:items.filter(i=>i.kind==='link'),
    associations:s.edges.filter(e=>e.ticket_id===id),watches:s.watches.filter(id=>t.item_ids.includes(id)),connections:s.connections,
    completeness:items.some(i=>i.sources.some(o=>o.freshness!=='fresh'||o.omitted.includes('pagination_limit')))||mappings.some(m=>m.availability!=='verified')?'partial':'complete',
    omitted,freshness_policy:{max_age_seconds:MAX_AGE,current_head_required:true}};
}
function selectedItemIds(c:Context,ids?:string[]):string[]|undefined {
  if(!ids)return undefined;
  const items=[...c.tasks,...c.prs,...c.links];
  const checkouts=new Set(c.mappings.map(m=>m.checkout_id));
  if(ids.some(id=>!items.some(i=>i.id===id)&&!checkouts.has(id)))throw new TicketError('invalid_selection','Copy selection contains an item outside this Ticket.');
  const selected=new Set(ids.filter(id=>items.some(i=>i.id===id)));
  for(const e of c.associations)if(e.confirmed) {
    if(ids.includes(e.from)&&checkouts.has(e.from)&&items.some(i=>i.id===e.to))selected.add(e.to);
    if(ids.includes(e.to)&&checkouts.has(e.to)&&items.some(i=>i.id===e.from))selected.add(e.from);
  }
  return [...selected];
}
export function copyLinks(c:Context,ids?:string[]):string {
  const items=[...c.tasks,...c.prs,...c.links];
  const selected=selectedItemIds(c,ids);
  return [...new Set(items.filter(i=>!selected||selected.includes(i.id)).map(i=>i.url))].join('\n');
}
export function copyStatus(c:Context,ids?:string[]):string {
  const selected=selectedItemIds(c,ids);
  return [c.ticket.name,...[...c.tasks,...c.prs,...c.links].filter(i=>!selected||selected.includes(i.id)).map(i=>{
    const signals=i.sources.map(o=>{
      const details=o.source==='checks'?(o.data.checks?.map(ch=>`${ch.name}: ${ch.state}`).join(', ')||'No checks observed'):o.source==='reviews'?(o.data.reviews?.map(r=>`${r.state} (${r.commit===i.sources.find(s=>s.source==='metadata')?.head_sha?'current head':'older/unknown head'})`).join(', ')||'No reviews observed'):o.source==='threads'?`${o.data.unresolved_threads??'?'} unresolved`:`${o.data.state??o.data.native_status??'Unknown'}${o.data.review_decision?`; review decision: ${o.data.review_decision}`:''}`;
      return `${o.source}: ${details} [${o.freshness}; observed ${o.observed_at??'never'}${o.head_sha?`; head ${o.head_sha}`:''}]`;
    });
    return `${i.title} — ${i.url}\n${signals.join('\n')}`;
  })].join('\n');
}
