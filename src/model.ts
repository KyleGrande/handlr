import { randomUUID } from 'node:crypto';
import { TicketError } from './errors.js';
import type { Store, Ticket, Item, Kind, Checkout, Edge } from './types.js';
export const now = () => new Date().toISOString();
export function ticketById(s:Store,id:string): Ticket {
  const t=s.tickets.find(t=>t.id===id); if (!t) throw new TicketError('ticket_not_found','Ticket ID was not found.',4); return t;
}
export function createTicket(s:Store,name:string): Ticket {
  name=label(name); const t:Ticket={id:randomUUID(),name,archived:false,mappings:[],item_ids:[],created_at:now(),updated_at:now()}; s.tickets.push(t);return t;
}
export function label(x:string):string {
  const value=x.trim(); if (!value || value.length>200 || /[\u0000-\u001f]/.test(value)) throw new TicketError('invalid_arguments','Names must contain 1–200 characters without control characters.'); return value;
}
export function normalizeURL(raw:string): string {
  let u:URL; try {u=new URL(raw);} catch {throw new TicketError('invalid_url','Provide an absolute HTTP or HTTPS source URL.');}
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || raw.length>2048 || /[\u0000-\u0020]/.test(raw)) throw new TicketError('invalid_url','Provide an HTTP or HTTPS URL without credentials or whitespace.');
  // Queries and fragments may identify generic resources. Only known provider item routes discard them.
  if (/^\/[\w.-]+\/[\w.-]+\/(pull|issues)\/[1-9]\d*(\/.*)?$/.test(u.pathname) && u.hostname==='github.com') {
    u.pathname=u.pathname.split('/').slice(0,5).join('/');u.search='';u.hash='';
  } else if (/^\/browse\/[A-Z][A-Z0-9_]*-\d+\/?$/i.test(u.pathname)) {u.search='';u.hash='';u.pathname=u.pathname.replace(/\/$/,'');}
  return u.toString();
}
export function addURL(s:Store,ticketId:string,raw:string,kind?:Kind): Item {
  const t=ticketById(s,ticketId), url=normalizeURL(raw), u=new URL(url);
  let item=s.items.find(i=>i.url===url);
  if (!item) {
    const gh=u.hostname==='github.com' && u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)$/);
    const jira=u.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)$/i);
    item={id:randomUUID(),url,host:u.host,title:gh?`${gh[1]}/${gh[2]} #${gh[4]}`:jira?jira[1]:u.hostname,
      kind:gh?(gh[3]==='pull'?'pr':'task'):kind??(jira?'task':'link'),provider:gh?'github':jira?'jira':'url',
      ...(gh?{repository_locator:`${u.host}/${gh[1]}/${gh[2]}`,key:`#${gh[4]}`} : jira?{key:jira[1]}:{})};
    s.items.push(item);
  }
  if (!t.item_ids.includes(item.id)) t.item_ids.push(item.id);
  if (!s.watches.includes(item.id)) s.watches.push(item.id);
  t.updated_at=now();return item;
}
export function mapCheckout(s:Store,ticketId:string,name:string,checkout:Checkout):Ticket {
  const t=ticketById(s,ticketId);name=label(name);
  if (t.mappings.some(m=>m.name===name)) throw new TicketError('mapping_exists','A mapping with that name already exists. Remove it explicitly before replacement.');
  let c=s.checkouts.find(c=>c.fingerprint===checkout.fingerprint);
  if (!c) {c=checkout;s.checkouts.push(c);}
  t.mappings.push({id:randomUUID(),name,checkout_id:c.id});t.updated_at=now();return t;
}
export function removeMapping(s:Store,ticketId:string,mappingId:string):Ticket {
  const t=ticketById(s,ticketId), m=t.mappings.find(m=>m.id===mappingId);
  if (!m) throw new TicketError('mapping_not_found','Mapping ID was not found.');
  t.mappings=t.mappings.filter(m=>m.id!==mappingId);
  // Remove checkout edges only when its final mapping leaves; direct task–PR history and watches survive.
  if (!t.mappings.some(x=>x.checkout_id===m.checkout_id)) s.edges=s.edges.filter(e=>e.ticket_id!==t.id || (e.from!==m.checkout_id && e.to!==m.checkout_id));
  t.updated_at=now();return t;
}
export function associate(s:Store,ticketId:string,from:string,to:string,confirmed=true,evidence='Explicit local link'): Edge {
  const t=ticketById(s,ticketId);
  const kind=(id:string):Kind|'checkout' => {
    if (t.mappings.some(m=>m.checkout_id===id)) return 'checkout';
    const item=s.items.find(i=>i.id===id && t.item_ids.includes(id));
    if (!item) throw new TicketError('invalid_endpoint','Association endpoints must belong to the selected Ticket.'); return item.kind;
  };
  const fk=kind(from),tk=kind(to);
  if (from===to) throw new TicketError('invalid_endpoint','An association needs distinct endpoints.');
  const pair=[fk,tk].sort().join(':');
  const relation=pair==='pr:task'?'task_pr':pair==='checkout:task'?'task_checkout':pair==='checkout:pr'?'pr_checkout':'related';
  const existing=s.edges.find(e=>e.ticket_id===ticketId && ((e.from===from && e.to===to)||(e.from===to && e.to===from)));
  if (existing) { if (confirmed) {existing.confirmed=true;existing.origin='manual';} return existing; }
  const e:Edge={id:randomUUID(),ticket_id:ticketId,from,to,relation,confirmed,origin:confirmed?'manual':'discovered',evidence:label(evidence),created_at:now()};s.edges.push(e);return e;
}
