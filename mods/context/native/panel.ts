import { View, div, type Context, type AsyncContext } from 'gpui-kit';
import { h_flex, v_flex, Input, InputState, Editor, EditorState, RadioGroup, Radio } from 'gpui-base';
import { spaces, agents, focused, terminals, exec, writeTextFile, theme, nextCommand, run } from 'herdr';
import { config } from './config.js';
import { Autosave, Drafts, highlightedAgent, type Draft } from '../src/drafts.js';
import { scratchpad, targetKey, target as validateTarget } from '../src/model.js';
import type { ContextTarget, ContextRecord, ContextPatch, Request, Response } from '../src/types.js';

// Namespace access keeps this mod compatible with Herdr versions without panel().
import * as WorkspaceHost from 'herdr';
type WorkspacePanel = { id: string; title: string; embedded_header: boolean };
const workspacePanel = (): WorkspacePanel | null =>
  (WorkspaceHost as unknown as { panel?: () => WorkspacePanel | null }).panel?.() ?? null;

function location() {
  const space = spaces().find(s => s.active);
  const selected = highlightedAgent(space?.id ?? '', agents(), focused()?.agent ?? null);
  const terminal = selected ? terminals().find(t => t.address === selected.address) : undefined;
  return { space: space?.id ?? '', on: space?.machine ?? null, agent: selected?.address ?? '',
    name: selected ? `${selected.program.name} · ${selected.address}` : '',
    pid: terminal?.foreground?.pid ?? null, created: terminal?.created_ms ?? null };
}
function ownerLabel(owner: ContextTarget): string {
  if (owner.kind === 'space') {
    const current = spaces().find(s => s.active);
    const id = current?.machine ? current.id.slice(current.machine.length + 1) : current?.id;
    return current && id === owner.id ? current.name : owner.id;
  }
  return owner.kind === 'agent' ? owner.id : owner.path;
}
class RequestError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
async function request<T>(body: Request): Promise<T> {
  if (!config.cli) throw new Error('Install Context to configure the local CLI.');
  const file = `${config.requests}/request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await writeTextFile(file, JSON.stringify(body), null);
  const r = await exec(config.node, [config.cli, 'request', '--input', file, '--consume-from', config.requests, '--home', config.home], { timeout: 30000 });
  let response: Response<T>;
  try { response = JSON.parse(r.stdout); } catch { throw new Error('Context could not load. Your draft is kept.'); }
  if (response.schema_version !== 1) throw new Error('Unsupported Context response version.');
  if (!response.ok) throw new RequestError(response.error.code, response.error.message);
  if (r.code !== 0) throw new Error('Context could not load. Your draft is kept.');
  return response.data;
}
interface Opened { record: ContextRecord; parent: ContextTarget }

export default class ContextPanel extends View {
  drafts = new Drafts();
  autosave = new Autosave(this.drafts);
  targets = new Map<string, { target: ContextTarget; parent: ContextTarget }>();
  owner: ContextTarget | null = null;
  parent: ContextTarget | null = null;
  scope: 'shared' | 'agent' = 'shared';
  locationKey = '';
  agentName = '';
  resolving = false;
  error = '';
  message = '';
  noteInput!: EditorState;
  tagInput!: InputState;
  applying = false;
  pendingTags: Record<string, string> = {};

  init(_props: Record<string, unknown> | undefined, cx: AsyncContext) {
    try {
      const saved = JSON.parse(localStorage.getItem('drafts-v1') ?? '[]');
      for (const [key, d] of saved) if (targetKey(validateTarget(d.record.target)) === key) {
        this.drafts.entries.set(key, d); this.autosave.schedule(d.record.target);
      }
    } catch { this.error = 'A saved draft could not be loaded; it has been left in local storage.'; }
    this.noteInput = EditorState.new({ language: 'markdown', soft_wrap: true, line_numbers: false, folding: false });
    this.noteInput.on('change', (_e, cx) => {
      if (this.applying || !this.owner || !this.current()) return;
      this.edit({ notes: this.noteInput.value(), instructions: '', handoff: '' }); cx.notify();
    });
    try { this.pendingTags = JSON.parse(localStorage.getItem('pending-tags-v1') ?? '{}'); } catch { /* Preserve the stored source. */ }
    this.tagInput = InputState.new({ placeholder: 'Add a tag' });
    this.tagInput.on('change', (_e, cx) => {
      if (this.applying || !this.owner || !this.current()) return;
      this.pendingTags[targetKey(this.owner)] = this.tagInput.value();
      localStorage.setItem('pending-tags-v1', JSON.stringify(this.pendingTags)); cx.notify();
    });
    this.tagInput.on('submit', (_e, cx) => this.addTag(cx));
    this.refresh(cx);
    cx.timer.every(250, cx => this.flush(cx));
    cx.timer.every(10000, cx => { if (!this.resolving && !this.autosave.saving.size) this.poll(cx); });
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === 'space' || command === 'agent') { this.scope = command === 'space' ? 'shared' : 'agent'; this.refresh(cx); }
        if (command === 'refresh') this.refresh(cx);
      }
    });
  }
  selectionKey(loc = location()) {
    return JSON.stringify([loc.space, loc.on, this.scope, ...(this.scope === 'agent' ? [loc.agent, loc.pid, loc.created] : [])]);
  }
  current() { return this.selectionKey() === this.locationKey; }
  persist() { localStorage.setItem('drafts-v1', JSON.stringify([...this.drafts.entries])); }
  draft(): Draft | undefined { return this.owner ? this.drafts.entries.get(targetKey(this.owner)) : undefined; }
  edit(update: ContextPatch) {
    if (!this.owner || !this.current()) return;
    this.drafts.edit(this.owner, update); this.persist(); this.autosave.schedule(this.owner); this.message = '';
  }
  apply() {
    const d = this.draft(); if (!d) return;
    this.applying = true;
    const text = scratchpad({ ...d.record, ...d.patch });
    if (this.noteInput.value() !== text) this.noteInput.set_value(text);
    const tag = this.owner ? this.pendingTags[targetKey(this.owner)] ?? '' : '';
    if (this.tagInput.value() !== tag) this.tagInput.set_value(tag);
    this.applying = false;
  }
  open(loc = location()) {
    if (!loc.space) throw new Error('Select a Space to open its notes and tags.');
    if (this.scope === 'agent' && !loc.agent) throw new Error('Select an agent in Herdr’s Agents list to open its scratchpad.');
    return request<Opened>({ op: 'open', space: loc.space, ...(this.scope === 'agent' ? { agent: loc.agent } : {}), on: loc.on });
  }
  acceptOpened(epoch: number, key: string, data: Opened) {
    if (epoch !== this.drafts.epoch || key !== this.selectionKey()) return;
    const owner = data.record.target;
    this.drafts.selected = targetKey(owner);
    if (!this.drafts.accept(epoch, data.record)) return;
    this.drafts.reconcile(owner, data.record);
    this.owner = owner; this.parent = data.parent;
    this.targets.set(key, { target: owner, parent: data.parent });
    this.error = ''; this.apply(); this.persist(); this.autosave.schedule(owner);
  }
  poll(cx: Context) {
    const epoch = this.drafts.epoch, key = this.locationKey;
    cx.spawn(async cx => {
      try { this.acceptOpened(epoch, key, await this.open()); }
      catch (e) { if (epoch === this.drafts.epoch) this.error = (e as Error).message; }
      cx.notify();
    });
  }
  refresh(cx: Context) {
    const loc = location(), key = this.selectionKey(loc), cached = this.targets.get(key);
    this.message = ''; this.error = ''; this.locationKey = key; this.agentName = loc.name;
    const epoch = this.drafts.select(null);
    this.resolving = true; this.owner = null; this.parent = null;
    cx.spawn(async cx => {
      try {
        if (epoch !== this.drafts.epoch || key !== this.selectionKey()) return;
        if (cached && this.drafts.entries.has(targetKey(cached.target))) {
          this.owner = cached.target; this.parent = cached.parent; this.drafts.selected = targetKey(cached.target);
          this.apply(); cx.notify();
        }
        this.acceptOpened(epoch, key, await this.open(loc));
      } catch (e) { if (epoch === this.drafts.epoch) this.error = (e as Error).message; }
      finally { if (epoch === this.drafts.epoch) { this.resolving = false; cx.notify(); } }
    });
  }
  flush(cx: Context) {
    if (!this.autosave.hasDue()) return;
    cx.spawn(async cx => {
      await this.autosave.flush({
        write: async snapshot => (await request<{ record: ContextRecord }>({ op: 'write', target: snapshot.target, expected_revision: snapshot.expected_revision, patch: snapshot.patch })).record,
        read: async target => (await request<{ record: ContextRecord }>({ op: 'read', target })).record,
      });
      this.persist();
      if (this.owner && this.current()) this.apply();
      cx.notify();
    });
  }
  resolveConflict(keepLocal: boolean, cx: Context) {
    if (!this.owner || !this.current()) return;
    this.drafts.resolveConflict(this.owner, keepLocal);
    this.persist(); this.apply(); this.autosave.schedule(this.owner, 0); cx.notify();
  }
  addTag(cx: Context) {
    const d = this.draft(), tag = this.tagInput.value().trim();
    if (!d || !tag || !this.owner || !this.current()) return;
    const tags = d.patch.tags ?? d.record.tags;
    if (tags.includes(tag)) return;
    this.edit({ tags: [...tags, tag] });
    this.pendingTags[targetKey(this.owner)] = '';
    localStorage.setItem('pending-tags-v1', JSON.stringify(this.pendingTags));
    this.tagInput.set_value(''); cx.notify();
  }
  render(cx: Context) {
    const dock = workspacePanel();
    // Follow live host selection directly, as Files and Changes do.
    if (this.selectionKey() !== this.locationKey) this.refresh(cx);
    const t = theme() as Record<string, `#${string}`>, d = this.draft();
    const button = (id: string, label: string, action: (_e: unknown, cx: Context) => void) => div().id(id).px(8).py(5).rounded(6).text_size(12).bg(t.raised).hover(s => s.bg(t.hover)).on_click(action).child(label);
    const label = (value: string) => div().text_size(11.5).text_color(t.muted).child(value);
    const current = this.current(), content = d && current ? { ...d.record, ...d.patch } : null;
    const shell = v_flex().id('context').size_full().min_h(0).rounded(10).overflow_hidden().bg(t.surface).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().pl(14).pr(dock?.embedded_header ? 82 : 14).items_center().border_b(1).border_color(t.border).child(div().min_w(0).truncate().font_semibold().on_click((event,cx) => {
        if (dock && event.click_count >= 2) { cx.stop_propagation(); run('workspace.rename',{panel:dock.id}); }
      }).child(dock?.title ?? 'Context')));
    const root = v_flex().flex_1().min_h(0).p(12).gap(10)
      .child(RadioGroup.new('context-scope').accessibility_label('Context scope').flex().p(3).gap(2).rounded(8).bg(t.raised).border_1().border_color(t.border)
        .children((['shared', 'agent'] as const).map(scope => Radio.new(`scope-${scope}`).checked(this.scope === scope)
          .flex_1().h(28).flex().items_center().justify_center().rounded(6).text_size(12)
          .bg(this.scope === scope ? t.background : t.raised).text_color(this.scope === scope ? t.foreground : t.muted)
          .hover(s => s.bg(t.hover)).on_change((_checked, cx) => { this.scope = scope; this.refresh(cx); })
          .child(scope === 'shared' ? 'Space' : 'Agent'))));
    if (this.owner && current) root.child(div().text_size(12).child(this.owner.kind === 'agent' ? this.agentName : ownerLabel(this.owner)));
    if (!content && (this.resolving || !current)) root.child(label('Loading context…'));
    if (this.error) root.child(div().text_size(12).text_color(t.blocked).child(this.error));
    if (this.message) root.child(label(this.message));
    if (this.owner && this.autosave.errors.has(targetKey(this.owner))) root.child(label(this.autosave.errors.get(targetKey(this.owner))!));
    if (d?.conflict && current) root.child(v_flex().gap(6)
      .child(label('Another editor changed this context. Your edits are kept.'))
      .child(h_flex().gap(6).child(button('keep-edits', 'Keep my edits', (_e, cx) => this.resolveConflict(true, cx)))
        .child(button('use-saved', 'Use saved version', (_e, cx) => this.resolveConflict(false, cx)))));
    const body = v_flex().flex_1().min_h(0).gap(10);
    if (content) {
      body.child(h_flex().gap(5).items_center().child(label('Tags'))
        .child(Input.new(this.tagInput).h(28).flex_1().px(8).rounded(6).border_1().border_color(t.input))
        .child(button('add-tag', '+ Add', (_e, cx) => this.addTag(cx))));
      if (content.tags.length) body.child(h_flex().flex_wrap().gap(6).children(content.tags.map((tag, i) => button(`tag-${i}`, `${tag} ×`, (_e, cx) => { this.edit({ tags: content.tags.filter(v => v !== tag) }); cx.notify(); }))));
      body.child(Editor.new(this.noteInput).flex_1().min_h(100).rounded(6).border_1().border_color(t.border));
    }
    if (this.owner && current && this.parent?.kind === 'space') {
      const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
      const cmd = `${quote(config.launcher)} read --space ${quote(this.parent.id)}${location().on ? ` --on ${quote(location().on!)}` : ''}${this.owner.kind === 'agent' ? ` --agent ${quote(this.owner.id)}` : ''}`;
      body.child(button('agent-read-command', 'Copy agent read command', (_e, cx) => { cx.write_to_clipboard(cmd); this.message = 'Read command copied.'; cx.notify(); }));
    }
    return shell.child(root.child(body));
  }
}
