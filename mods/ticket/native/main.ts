import { View, div, svg, type Context, type Element } from 'gpui-kit';
import { v_flex, h_flex, Input, InputState, Radio, RadioGroup } from 'gpui-base';
import { exec, focused, spaces, theme, props, pickFolder } from 'herdr';
import * as host from 'herdr';
// @ts-ignore Packaged by the build/installer, never provider data.
import { runtime } from './runtime.js';
import type { Context as TicketContext, Ticket, ContextItem } from '../src/types.js';
const colors=()=>theme() as Record<string,`#${string}`>;
// Handlr owns docked/floating panel chrome. Older Herdr hosts have no panel API.
const panel=()=> (host as unknown as {panel?:()=>{id:string;title:string;embedded_header:boolean}|null}).panel?.()??null;
type Scope='Focused'|'All'|'Watching';
interface Listing { revision:number; tickets:Ticket[]; watched_items?:ContextItem[] }
type Form='create'|'rename'|'link'|'map'|'connections'|'';
function checkout():string|null {
  const f=focused(),s=spaces().find(s=>s.id===f?.space);
  if(s?.machine||f?.terminal?.includes('/'))return null;
  return f?.cwd||s?.folder||null;
}
export default class TicketPanel extends View {
  scope:Scope='Focused'; listing:Listing={revision:0,tickets:[]}; detail:TicketContext=null;
  selected=''; selection:string[]=[]; error=''; busy=false; loading=false; request=0; lastScope='';
  form:Form=''; editTarget=''; editRevision=0; name:InputState; url:InputState; role:InputState; path:InputState;
  diagnostics:any=null; showArchived=false; expanded=new Set<string>(); background=false;
  init(_props:unknown,cx:Context) {
    this.name=InputState.new({placeholder:'Ticket name'});this.url=InputState.new({placeholder:'Task or pull request URL'});
    this.role=InputState.new({placeholder:'Mapping name, e.g. web or api'});this.path=InputState.new({placeholder:'Checkout folder'});
    this.scope=(localStorage.getItem('scope') as Scope)||'Focused';
    this.background=localStorage.getItem('background')==='true';
    this.reload(cx);
    cx.timer.every(5000,cx=>{if(!this.busy&&!this.loading)this.reload(cx);});
    // Host keeps hidden copies alive. Watching refresh therefore continues with the panel hidden.
    cx.timer.every(60000,cx=>{if(this.background&&!this.busy)this.refreshWatches(cx);});
  }
  async call(args:string[]):Promise<any> {
    const node=props()?.node??runtime.node,cli=props()?.cli??runtime.cli,store=props()?.store??runtime.store;
    // env is an executable with separate arguments; provider URLs never enter a shell.
    const argv=store?[`HERDR_TICKET_STORE=${store}`,node,cli,...args]:[cli,...args];
    const r=await exec(store?'env':node,argv,{timeout:25000});
    let response:any;try{response=JSON.parse(r.stdout);}catch{throw new Error('Ticket CLI did not return JSON. Rebuild or reinstall Ticket.');}
    if(response.schema_version!==1)throw new Error('Unsupported Ticket response version.');
    if(!response.ok)throw new Error(response.error?.message??'Ticket operation failed.');
    return response.data;
  }
  reload(cx:Context) {
    if(this.loading)return;
    const path=checkout(),scope=this.scope,key=`${scope}:${path}:${this.showArchived}`,request=++this.request;
    if(key!==this.lastScope){this.lastScope=key;this.detail=null;this.selection=[];}
    if(scope==='Focused'&&!path){this.listing={revision:this.listing.revision,tickets:[]};this.error='Focused checkout is unavailable. Use All for saved Tickets. Remote checkout discovery is planned.';cx.notify();return;}
    this.loading=true;
    cx.spawn(async cx=>{
      try {
        const args=['list',...(scope==='Focused'?['--checkout',path]:scope==='Watching'?['--watching']:[]),...(this.showArchived?['--archived']:[])];
        const list=await this.call(args);
        if(request!==this.request||key!==this.lastScope)return;
        this.listing=list;
        // Preserve explicit selection only while it is in the filtered list; never choose another Ticket.
        if(!list.tickets.some((t:Ticket)=>t.id===this.selected)){this.selected='';this.detail=null;this.selection=[];}
        if(this.selected) {
          const id=this.selected,detail=await this.call(['read','--ticket',id]);
          if(request===this.request&&this.selected===id)this.detail=detail;
        }
        this.error='';
      }catch(e){this.error=String(e);}finally{this.loading=false;cx.notify();}
    });
  }
  select(id:string,cx:Context) {
    const close=this.selected===id,request=++this.request;
    this.selected=close?'':id;this.detail=null;this.selection=[];this.form='';
    if(!close)cx.spawn(async cx=>{try{const d=await this.call(['read','--ticket',id]);if(this.selected===id&&this.request===request)this.detail=d;}catch(e){if(this.request===request)this.error=String(e);}cx.notify();});cx.notify();
  }
  action(args:string[],cx:Context,done?: (r:any)=>void) {
    if(this.busy)return;this.busy=true;this.error='';
    cx.spawn(async cx=>{try{const r=await this.call(args);done?.(r);this.form='';}catch(e){this.error=String(e);}finally{this.busy=false;this.reload(cx);cx.notify();}});
  }
  refreshWatches(cx:Context) {this.action(['refresh','--watching','--timeout','20'],cx);}
  openForm(form:Form,cx:Context) {
    this.form=form;this.editTarget=form==='create'||form==='connections'?'':this.detail?.ticket.id??'';this.editRevision=this.detail?.revision??this.listing.revision;
    this.name.set_value(form==='rename'?this.detail?.ticket.name??'':'');this.url.set_value('');this.role.set_value('');this.path.set_value(checkout()??'');
    if(form==='connections')this.checkConnections(cx);
    cx.notify();
  }
  save(cx:Context) {
    const t=this.editTarget,expected=['--expected',String(this.editRevision)];
    if(this.form==='create'){const args=['create','--name',this.name.value(),...expected];if(this.url.value().trim())args.push('--url',this.url.value().trim());this.action(args,cx,r=>{this.selected=r.result.id;this.scope='All';localStorage.setItem('scope','All');});}
    if(this.form==='rename')this.action(['rename','--ticket',t,'--name',this.name.value(),...expected],cx);
    if(this.form==='link')this.action(['link','--ticket',t,'--url',this.url.value().trim(),...expected],cx);
    if(this.form==='map')this.action(['map','--ticket',t,'--name',this.role.value(),'--checkout',this.path.value(),...expected],cx);
    if(this.form==='connections')this.checkConnections(cx);
  }
  checkConnections(cx:Context) {
    if(this.busy)return;this.busy=true;this.diagnostics=null;
    cx.spawn(async cx=>{try{this.diagnostics=await this.call(['doctor']);}catch(e){this.diagnostics={error:String(e)};}finally{this.busy=false;cx.notify();}});
  }
  button(id:string,text:string,click:(cx:Context)=>void,active=false):Element {
    const c=colors();return div().id(id).flex_none().px(8).py(5).rounded(6).cursor_pointer()
      .bg(active?c.selected:c.raised).text_color(active?c.foreground:c.muted).text_size(12)
      .child(text).hover(s=>s.bg(c.hover).text_color(c.foreground)).on_click((_e,cx)=>{if(!this.busy)click(cx);});
  }
  icon(id:string,file:string,label:string,click:(cx:Context)=>void):Element {
    const c=colors();return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(6)
      .cursor_pointer().text_color(c.muted).tooltip(label).accessibility_label(label)
      .hover(s=>s.bg(c.hover).text_color(c.foreground)).on_click((_e,cx)=>{if(!this.busy)click(cx);})
      .child(svg(`mods/workspace-chrome/${file}.svg`).size(14));
  }
  text(text:string,muted=false):Element {return div().min_w(0).text_size(muted?11.5:12).whitespace_normal().text_color(muted?colors().muted:colors().foreground).child(text);}
  section(title:string,action:Element):Element {
    return h_flex().w_full().min_w(0).pt(6).gap(8).items_center().justify_between()
      .child(div().flex_1().min_w(0).text_size(11.5).font_semibold().text_color(colors().muted).child(title)).child(action);
  }
  field(label:string,input:InputState):Element {
    const c=colors();return v_flex().w_full().min_w(0).gap(5).child(this.text(label,true))
      .child(Input.new(input).w_full().h(30).px(8).rounded(6).bg(c.background).border_1().border_color(c.input).text_size(13).text_color(c.foreground));
  }
  copy(format:'links'|'status',cx:Context) {
    const d=this.detail;if(!d)return;const args=['copy','--ticket',d.ticket.id,'--format',format];if(this.selection.length)args.push('--items',this.selection.join(','));
    cx.spawn(async cx=>{try{const r=await this.call(args);cx.write_to_clipboard(r.text);}catch(e){this.error=String(e);cx.notify();}});
  }
  item(i:ContextItem,d:TicketContext,cxIgnored?:Context):Element {
    const selected=this.selection.includes(i.id),open=this.expanded.has(i.id),c=colors();
    const meta=i.sources.find(s=>s.source==='metadata');
    const row=v_flex().w_full().min_w(0).gap(6).p(10).rounded(8).border_1().border_color(c.border).bg(c.background);
    row.child(h_flex().gap(6).items_center().child(this.icon(`select-${i.id}`,selected?'circle-check':'square',selected?'Deselect source':'Select source',cx=>{this.selection=selected?this.selection.filter(x=>x!==i.id):[...this.selection,i.id];cx.notify();}))
      .child(v_flex().flex_1().min_w(0).gap(3).child(div().text_size(13).truncate().tooltip(i.title).child(i.title)).child(this.text(`${i.key??i.kind} · ${meta?.data.state??meta?.data.native_status??'Unknown'} · ${meta?.freshness??'unknown'}`,true)))
      .child(this.button(`open-${i.id}`,'Open',cx=>cx.open_url(i.url))).child(this.button(`copy-${i.id}`,'Copy',cx=>cx.write_to_clipboard(i.url))));
    row.child(div().min_w(0).text_size(11.5).text_color(c.dim).truncate().tooltip(i.url).child(i.url));
    for(const source of i.sources) {
      const failed=source.data.checks?.filter(ch=>['FAILURE','ERROR','TIMED_OUT','CANCELLED','ACTION_REQUIRED','STARTUP_FAILURE'].includes(ch.state));
      const detail=source.source==='checks'?`${source.data.checks?.length??'?'} checks · ${failed?.length??'?'} need attention`:source.source==='reviews'?`${source.data.reviews?.filter(r=>r.commit===meta?.head_sha).length??'?'} reviews on current head`:source.source==='threads'?`${source.data.unresolved_threads??'?'} unresolved`:source.data.review_decision??source.data.state??'No observation';
      row.child(this.text(`${source.source}: ${detail} · ${source.freshness} · ${source.observed_at??'never observed'}`,true));
      for(const [n,check] of (failed??[]).entries())row.child(h_flex().min_w(0).gap(6).justify_between().child(this.text(`${check.name}: ${check.state} · ${source.freshness}`)).when(!!check.url,el=>el.child(this.button(`attention-${i.id}-${n}`,'Open check',cx=>cx.open_url(check.url)))));
      if(source.error)row.child(this.text(source.error.message,true));
    }
    row.child(h_flex().flex_wrap().gap(6).child(this.button(`details-${i.id}`,open?'Less':'Details',cx=>{open?this.expanded.delete(i.id):this.expanded.add(i.id);cx.notify();}))
      .child(this.button(`watch-${i.id}`,d.watches.includes(i.id)?'Unwatch':'Watch',cx=>this.action(['watch','--item',i.id,'--value',String(!d.watches.includes(i.id)),'--expected',String(d.revision)],cx)))
      .child(this.button(`unlink-${i.id}`,'Unlink',cx=>this.action(['unlink','--ticket',d.ticket.id,'--item',i.id,'--expected',String(d.revision)],cx))));
    if(open) {
      for(const s of i.sources) {
        for(const check of s.data.checks??[])row.child(h_flex().min_w(0).gap(6).justify_between().child(this.text(`${check.name}: ${check.state} (${s.freshness})`)).when(!!check.url,el=>el.child(this.button(`check-${i.id}-${check.name}`,'Open',cx=>cx.open_url(check.url)))));
        for(const [n,review] of (s.data.reviews??[]).entries())row.child(h_flex().min_w(0).gap(6).justify_between().child(this.text(`${review.state} · ${review.commit===meta?.head_sha?'current head':'older/unknown head'}`)).when(!!review.url,el=>el.child(this.button(`review-${i.id}-${n}`,'Open',cx=>cx.open_url(review.url)))));
        for(const [n,thread] of (s.data.threads??[]).entries())row.child(h_flex().min_w(0).gap(6).justify_between().child(this.text(`${thread.resolved?'Resolved':'Unresolved'} · ${thread.path}:${thread.line??''}`)).when(!!thread.url,el=>el.child(this.button(`thread-${i.id}-${n}`,'Open',cx=>cx.open_url(thread.url)))));
        if(s.omitted.length)row.child(this.text(`Unavailable detail: ${s.omitted.join(', ')}`,true));
      }
    }
    return row;
  }
  render() {
    const c=colors(),dock=panel();
    const shell=v_flex().id('ticket').size_full().min_h(0).min_w(0).overflow_hidden()
      .bg(c.background).text_color(c.foreground).text_size(13)
      .when(!dock,el=>el.rounded(10).border_1().border_color(c.border))
      .when(!dock,el=>el.child(h_flex().h(42).flex_none().px(14).gap(6).items_center().border_b(1).border_color(c.border)
        .child(div().flex_1().font_semibold().child('Ticket'))
        .child(this.icon('connections','settings','Connections',cx=>this.openForm('connections',cx)))
        .child(this.icon('new','plus','New Ticket',cx=>this.openForm('create',cx)))));
    const root=v_flex().flex_1().min_h(0).min_w(0).p(dock?8:12).gap(10);
    const toolbar=h_flex().w_full().min_w(0).flex_none().gap(4).items_center();
    toolbar.child(RadioGroup.new('ticket-scope').accessibility_label('Ticket scope').flex().flex_1().min_w(0).p(3).gap(2).rounded(8)
      .bg(c.raised).border_1().border_color(c.border)
      .children((['Focused','All','Watching'] as Scope[]).map(scope=>Radio.new(`scope-${scope}`).checked(scope===this.scope)
        .flex_1().h(28).flex().items_center().justify_center().rounded(6).text_size(12).cursor_pointer()
        .bg(scope===this.scope?c.background:c.raised).text_color(scope===this.scope?c.foreground:c.muted)
        .hover(s=>s.bg(c.hover)).on_change((_checked,cx)=>{if(this.busy)return;this.scope=scope;localStorage.setItem('scope',scope);this.form='';this.reload(cx);cx.notify();}).child(scope))));
    // Keep actions in the content toolbar so Handlr's title, drag grip, and
    // float/dock controls never compete for space, including with No Headers.
    if(dock)toolbar.child(this.icon('connections','settings','Connections',cx=>this.openForm('connections',cx)))
      .child(this.icon('new','plus','New Ticket',cx=>this.openForm('create',cx)));
    root.child(toolbar);
    if(this.error)root.child(div().text_size(12).text_color(c.blocked).whitespace_normal().child(this.error));
    if(this.busy)root.child(this.text('Working…',true));
    const body=v_flex().id('ticket-scroll').flex_1().min_h(0).min_w(0).overflow_y_scrollbar().gap(8);
    if(this.form)body.child(this.renderForm());
    if(!this.listing.tickets.length)body.child(this.text(this.scope==='Focused'?'No Tickets mapped to this checkout. Create a Ticket or use All.':'No Tickets here yet. Start with a name or source URL.',true));
    for(const t of this.listing.tickets)body.child(h_flex().id(`ticket-${t.id}`).w_full().min_w(0).h(32).flex_none().px(8).gap(7).rounded(6).items_center().cursor_pointer()
      .when(this.selected===t.id,el=>el.bg(c.selected)).hover(el=>el.bg(c.hover)).on_click((_e,cx)=>{if(!this.busy)this.select(t.id,cx);})
      .child(svg(`mods/workspace-chrome/chevron-${this.selected===t.id?'down':'right'}.svg`).size(12).flex_none().text_color(c.dim))
      .child(div().flex_1().min_w(0).truncate().tooltip(t.name).text_size(13).child(t.name))
      .child(div().flex_none().text_size(11.5).text_color(c.dim).tooltip(`${t.mappings.length} checkout${t.mappings.length===1?'':'s'}`).child(t.archived?'Archived':String(t.mappings.length))));
    const d=this.detail;
    if(d) {
      body.child(h_flex().flex_wrap().gap(6).child(this.button('rename','Rename',cx=>this.openForm('rename',cx)))
        .child(this.button('archive',d.ticket.archived?'Restore':'Archive',cx=>this.action(['archive','--ticket',d.ticket.id,'--value',String(!d.ticket.archived),'--expected',String(d.revision)],cx)))
        .child(this.button('refresh','Refresh',cx=>this.action(['read','--ticket',d.ticket.id,'--refresh','--timeout','20'],cx,r=>{if(this.selected===d.ticket.id)this.detail=r;}))));
      body.child(this.section('Repositories / checkouts',this.icon('map','plus','Add checkout mapping',cx=>this.openForm('map',cx))));
      for(const m of d.mappings)body.child(v_flex().w_full().min_w(0).gap(6).p(10).rounded(8).border_1().border_color(c.border).child(this.text(`${m.name} · ${m.checkout.branch} · ${m.availability}`))
        .child(this.text(m.checkout.path,true)).when(!!m.identity_issue,el=>el.child(this.text(m.identity_issue.message,true)))
        .child(h_flex().flex_wrap().gap(6).child(this.button(`mapping-select-${m.id}`,this.selection.includes(m.checkout_id)?'Selected':'Select for relation',cx=>{this.selection=this.selection.includes(m.checkout_id)?this.selection.filter(x=>x!==m.checkout_id):[...this.selection,m.checkout_id];cx.notify();}))
          .child(this.button(`unmap-${m.id}`,'Remove mapping',cx=>this.action(['unmap','--ticket',d.ticket.id,'--mapping',m.id,'--expected',String(d.revision)],cx)))));
      body.child(this.section('Tasks, pull requests & links',this.icon('link','plus','Link a task or pull request URL',cx=>this.openForm('link',cx))));
      for(const i of [...d.tasks,...d.prs,...d.links])body.child(this.item(i,d));
      if(!d.tasks.length&&!d.prs.length&&!d.links.length)body.child(this.text('Paste a source URL to add work to this Ticket.',true));
      body.child(h_flex().flex_wrap().gap(6).child(this.button('copy-links','Copy links',cx=>this.copy('links',cx))).child(this.button('copy-status','Copy status',cx=>this.copy('status',cx))));
      body.child(this.button('copy-agent','Copy agent read command',cx=>{
        const quote=(v:string)=>`'${v.replace(/'/g,"'\\''")}'`,store=props()?.store??runtime.store;
        cx.write_to_clipboard(`${store?`HERDR_TICKET_STORE=${quote(store)} `:''}${quote(props()?.node??runtime.node)} ${quote(props()?.cli??runtime.cli)} read --ticket ${quote(d.ticket.id)}`);
      }));
      if(this.selection.length)body.child(h_flex().flex_wrap().gap(6).child(this.text(`${this.selection.length} selected`))
        .child(this.button('clear-selection','Clear',cx=>{this.selection=[];cx.notify();}))
        .when(this.selection.length===2,el=>el.child(this.button('associate','Link selected locally',cx=>this.action(['associate','--ticket',d.ticket.id,'--from',this.selection[0],'--to',this.selection[1],'--expected',String(d.revision)],cx)))));
      const items=[...d.tasks,...d.prs,...d.links];
      const title=(id:string)=>items.find(i=>i.id===id)?.title??d.mappings.find(m=>m.checkout_id===id)?.name??id;
      for(const e of d.associations)body.child(h_flex().min_w(0).gap(6).justify_between().child(this.text(`${title(e.from)} ↔ ${title(e.to)} · ${e.confirmed?'confirmed':'suggested'}`,true))
        .child(this.button(`remove-edge-${e.id}`,'Unlink relation',cx=>this.action(['dissociate','--ticket',d.ticket.id,'--edge',e.id,'--expected',String(d.revision)],cx))));
      body.child(this.text(`${d.completeness} snapshot · Observations expire after ${d.freshness_policy.max_age_seconds}s. Merge readiness is not inferred.`,true));
    }
    if(this.scope==='Watching')for(const i of this.listing.watched_items??[])if(!this.listing.tickets.some(t=>t.item_ids.includes(i.id)))body.child(v_flex().gap(4).child(this.text(i.title)).child(this.text(i.sources.map(s=>`${s.source}: ${s.freshness}`).join(' · '),true))
      .child(h_flex().flex_wrap().gap(6).child(this.button(`orphan-${i.id}`,'Open watched source',cx=>cx.open_url(i.url))).child(this.button(`unwatch-orphan-${i.id}`,'Unwatch',cx=>this.action(['watch','--item',i.id,'--value','false','--expected',String(this.listing.revision)],cx)))));
    root.child(body);
    root.child(h_flex().flex_wrap().flex_none().pt(10).border_t(1).border_color(c.border).gap(6).child(this.button('show-archived',this.showArchived?'Hide archived':'Show archived',cx=>{this.showArchived=!this.showArchived;this.reload(cx);cx.notify();}))
      .child(this.button('background',this.background?'Watching refresh: on':'Watching refresh: off',cx=>{this.background=!this.background;localStorage.setItem('background',String(this.background));cx.notify();})));
    return shell.child(root);
  }
  renderForm():Element {
    const c=colors(),f=v_flex().w_full().min_w(0).flex_none().gap(10).p(10).rounded(8).bg(c.raised).border_1().border_color(c.border);
    f.child(div().text_size(13).font_semibold().child(({create:'New Ticket',rename:'Rename Ticket',link:'Link source',map:'Add checkout mapping',connections:'Connections'} as Record<string,string>)[this.form]));
    if(this.form==='create'||this.form==='rename')f.child(this.field('Ticket name',this.name));
    if(this.form==='create'||this.form==='link')f.child(this.field(this.form==='create'?'Source URL (optional)':'Source URL',this.url));
    if(this.form==='map')f.child(this.field('Mapping name',this.role)).child(this.field('Checkout folder',this.path)).child(this.button('pick','Choose checkout folder',cx=>cx.spawn(async cx=>{const path=await pickFolder({prompt:'Choose existing checkout'});if(path)this.path.set_value(path);cx.notify();})));
    if(this.form==='connections') {
      f.child(this.text('GitHub uses your existing gh CLI authentication automatically. No Ticket login or connection setup is needed.',true));
      if(this.diagnostics?.error)f.child(this.text(this.diagnostics.error,true));
      if(this.diagnostics?.github) {
        const gh=this.diagnostics.github;
        f.child(this.text(gh.authenticated?`gh: authenticated as ${gh.account}`:gh.installed?'gh: authentication unavailable':'gh: not installed'));
        if(gh.issue)f.child(this.text(`${gh.issue.message} ${gh.issue.hint??''}`,true));
        f.child(this.text(`TWG: ${this.diagnostics.jira.installed?'installed':'missing'}`,true));
      }
      f.child(this.text('Jira and Linear: save source URLs. Tracker refresh is planned until commands and tenant reads are verified.',true));
    } else if(this.editTarget)f.child(this.text(`Editing ${this.detail?.ticket.id===this.editTarget?this.detail.ticket.name:'the captured Ticket'} · changes are local`,true));
    return f.child(h_flex().flex_wrap().gap(6).child(this.button('save',this.form==='connections'?'Check again':'Save',cx=>this.save(cx))).child(this.button('cancel',this.form==='connections'?'Close':'Cancel',cx=>{this.form='';cx.notify();})));
  }
}
