import { runKey, runStatus, loginArgv, findRunTerminal } from './runs.js';

import type { RunRecord, RunState, TerminalRecord } from './runs.js';
import type { Context, AsyncContext } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';
import type { ToolEntry, ToolboxState } from './model.js';
import type { LayoutNode } from '../layout.js';
type SpaceContext = { s: SpaceInfo; cwd: string; owner: string; signature: string };
type Editor = { owner: string; revision: number; id: string; label: InputState; command: InputState; icon: InputState };
const state = () => shared(KEY) as ToolboxState | undefined;
import { View, div, svg } from 'gpui-kit';
import { h_flex, v_flex, InputState, Input } from 'gpui-base';
import { spaces, panes, terminals, theme, shared, setShared, exec, run, props, layout, readTextFile, openOverlay, closeOverlay, appHome } from 'herdr';
import { parameters, expand, saveEntry, repoTools, spaceFolder } from './model.js';

// Namespace access keeps this mod compatible with Herdr versions without panel().
import * as WorkspaceHost from 'herdr';
type WorkspacePanel = { id: string; title: string; embedded_header: boolean };
const workspacePanel = (): WorkspacePanel | null =>
  (WorkspaceHost as unknown as { panel?: () => WorkspacePanel | null }).panel?.() ?? null;
const KEY = 'toolbox.v1';
const RUNS_KEY = 'toolbox.runs.v1';
const runs = () => (shared(RUNS_KEY) as RunState | undefined)?.runs ?? {};
const DISPLAY_KEY = 'toolbox.display.v1';
export default class Toolbox extends View {
  identity: Record<string, string> = {};
  pending: Record<string, boolean> = {};
  error = '';
  repoTools: ToolEntry[] = [];
  repoText: string | null = null;
  repoKey?: string;
  repoLoading = false;
  repoError = '';
  editor: Editor | null = null;
  launch: { entry: ToolEntry; context: SpaceContext; fields: { name: string; input: InputState }[] } | null = null;
  init(_: unknown, cx: AsyncContext) {
    this.identity = {}; this.pending = {}; this.error = ''; this.repoTools = []; this.repoText = null;
    if (props()?.view === 'run') this.start(props().entry, props().context, cx);
    if (props()?.view === 'manual') this.edit(props().entry ?? null, props().context);
    if (!props()?.view && !props()?.toolbar) {
      this.reloadRepo(cx);
      cx.timer.every(5000, cx => this.reloadRepo(cx));
    }
  }
  reloadRepo(cx: Context) {
    const space = spaces().find(s => s.active);
    if (!space || this.repoLoading) return;
    const cwd = spaceFolder(space, panes());
    const key = JSON.stringify([space.id, cwd, space.machine]);
    if (this.repoKey !== key) { this.repoKey = key; this.repoTools = []; this.repoText = null; }
    this.repoLoading = true;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(cwd.replace(/\/$/, '') + '/.herdr/toolbox.json', { on: space.machine });
        if (this.repoKey !== key || text === this.repoText) return;
        this.repoTools = repoTools(text);
        this.repoText = text; this.repoError = ''; cx.notify();
      } catch (error: unknown) { this.repoError = error instanceof Error ? error.message : String(error); cx.notify(); }
      finally { this.repoLoading = false; }
    });
  }
  renderMenu() {
    const t = theme() as Record<string, `#${string}`>, context = props().context;
    const item = (id: string, label: string, icon: string, action: (cx: Context) => void) => h_flex().id(id).h(34).flex_none().px(9).gap(9).rounded(6).items_center().cursor_pointer().text_size(13).text_color(t.foreground)
      .hover(s => s.bg(t.hover)).child(svg('mods/workspace-chrome/' + icon + '.svg').size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().child(label)).on_click((_e, cx) => action(cx));
    if (props()?.view === 'tool-menu') {
      const entry = props().entry as ToolEntry;
      const edit = (variant: boolean) => {
        closeOverlay(props().overlay);
        openOverlay({ mod: 'toolbox', kind: 'dialog', width: 620, height: 300, props: {
          view: 'manual', context,
          entry: variant ? { ...entry, id: undefined, label: entry.label + ' copy' } : entry,
        } });
      };
      const record = runs()[runKey(context.owner, entry.id)];
      const terminal = record ? findRunTerminal(record, terminals()) : undefined;
      const status = record ? runStatus(record, terminal) : null;
      const busy = status?.kind === 'starting' || status?.kind === 'running';
      return v_flex().id('toolbox-tool-menu').w_full().p(6).gap(3).bg(t.popover).text_color(t.foreground)
        .when(!busy, el => el.child(item('run-tool', record ? 'Run again' : 'Run', 'plus', () => {
          closeOverlay(props().overlay);
          openOverlay({ mod: 'toolbox', kind: 'dialog', width: 620, height: 300, props: { view: 'run', entry, context } });
        })))
        .child(item('edit-tool', 'Edit', 'files', () => edit(false)))
        .child(item('variant-tool', 'Variant', 'plus', () => edit(true)));
    }
    return v_flex().id('toolbox-new-menu').w_full().p(6).gap(3).bg(t.popover).text_color(t.foreground)
      .child(item('copy-agent-prompt', 'Copy agent prompt', 'files', cx => {
        cx.write_to_clipboard('Read ' + appHome() + '/mods/toolbox/AGENT_SETUP.md and set up Herdr Toolbox tools from the repo at ' + JSON.stringify(context.cwd) + (context.s.machine ? ' on Herdr machine ' + JSON.stringify(context.s.machine) : '') + '.');
        closeOverlay(props().overlay);
      }))
      .child(item('add-manual', 'Add a tool (manual)', 'plus', () => {
        closeOverlay(props().overlay);
        openOverlay({ mod: 'toolbox', kind: 'dialog', width: 620, height: 300, props: { view: 'manual', context } });
      }));
  }
  context(cx: Context) {
    const s = spaces().find(s => s.active);
    if (!s) return null;
    const cwd = spaceFolder(s, panes());
    const signature = JSON.stringify([s.id, s.machine, cwd]);
    if (!this.identity[signature] && !this.pending[signature]) {
      this.pending[signature] = true;
      cx.spawn(async cx => {
        try {
          const result = await exec('hc', ['server', 'status', '--json'], { on: s.machine });
          if (result.code) throw new Error('Core identity unavailable');
          const data = JSON.parse(result.stdout), machine = data.core?.id ?? data.id;
          if (!machine) throw new Error('Core identity unavailable');
          const id = s.machine && s.id.startsWith(s.machine + '/') ? s.id.slice(s.machine.length + 1) : s.id;
          this.identity[signature] = JSON.stringify([machine, 'space', id]);
        } catch (e: unknown) { this.error = e instanceof Error ? e.message : String(e); }
        cx.notify();
      });
    }
    return { s, cwd, owner: this.identity[signature], signature };
  }
  input(value: string) { return InputState.new({ value }); }
  edit(entry: Partial<ToolEntry> | null, context: SpaceContext) {
    const record = state()?.owners?.[context.owner];
    this.editor = { owner: context.owner, revision: record?.revision ?? 0, id: entry?.id ?? `${Date.now()}-${Math.random()}`, label: this.input(entry?.label ?? ''), command: this.input(entry?.command ?? ''), icon: this.input(entry?.icon ?? '▶') };
    this.launch = null;
  }
  start(entry: ToolEntry, context: SpaceContext, cx: Context) {
    const key = runKey(context.owner, entry.id), record = runs()[key];
    if (record) {
      const status = runStatus(record, findRunTerminal(record, terminals()));
      if (status.kind === 'starting' || status.kind === 'running') {
        const terminal = findRunTerminal(record, terminals());
        if (terminal) run('terminal.peek', { terminal: terminal.address });
        if (props()?.view === 'run') closeOverlay(props().overlay);
        return;
      }
    }
    const names = parameters(entry.command);
    if (names.length) this.launch = { entry, context, fields: names.map(name => ({ name, input: this.input('') })) };
    else this.execute(entry, context, {}, cx);
  }
  execute(entry: ToolEntry, context: SpaceContext, values: Record<string, string>, cx: Context) {
    try {
      const command = expand(entry.command, values), key = runKey(context.owner, entry.id);
      const previous = runs()[key];
      if (previous) {
        const status = runStatus(previous, findRunTerminal(previous, terminals()));
        if (status.kind === 'starting' || status.kind === 'running') throw new Error('This tool is already running.');
      }
      const token = `${Date.now()}-${Math.random()}`;
      const record: RunRecord = { token, started: Date.now() };
      setShared(RUNS_KEY, { version: 1, runs: { ...runs(), [key]: record } });
      this.launch = null;
      cx.spawn(async cx => {
        try {
          const environment = await exec('sh', ['-c', 'printf %s "$SHELL"'], { on: context.s.machine });
          if (environment.code) throw new Error('Could not load terminal environment');
          const result = await exec('hc', ['run', '--bg', '--json', '--no-parent', '--no-notify',
            '--cwd', context.cwd, '--label', 'toolbox.owner=' + context.owner,
            '--label', 'toolbox.tool=' + entry.id, '--label', 'toolbox.run=' + token,
            '--', ...loginArgv(environment.stdout.trim(), command)], { on: context.s.machine });
          if (result.code) throw new Error(result.stderr || 'Could not start terminal');
          const data = JSON.parse(result.stdout);
          const address = data.address;
          if (typeof address !== 'string' || !address) throw new Error('Core did not return a terminal address');
          const terminal = context.s.machine && !address.includes('/') ? context.s.machine + '/' + address : address;
          if (runs()[key]?.token === token) setShared(RUNS_KEY, { version: 1, runs: { ...runs(), [key]: { ...record, terminal } } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (runs()[key]?.token === token) setShared(RUNS_KEY, { version: 1, runs: { ...runs(), [key]: { ...record, error: message } } });
          this.error = message;
        }
        cx.notify();
        if (props()?.view === 'run') closeOverlay(props().overlay);
      });
    } catch (e: unknown) { this.error = e instanceof Error ? e.message : String(e); }
  }
  headerHovered = false;
  render(cx: Context) {
    if (props()?.view === 'menu' || props()?.view === 'tool-menu') return this.renderMenu();
    const t = theme() as Record<string, `#${string}`>;
    const button = (id: string, text: string, action: (cx: Context) => void) => div().id(id).px(9).py(5).rounded(6).bg(t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => { action(cx); cx.notify(); }).child(text);
    if (props()?.toolbar) return button('toolbox-toggle', 'Toolbox', () => {
      const find = (n: LayoutNode | null): LayoutNode | undefined => n?.id === 'toolbox-tray' ? n : n?.children?.map(find).find(Boolean);
      const tray = find(layout() as LayoutNode);
      if (tray) run(tray.hidden ? 'layout.show' : 'layout.hide', { id: 'toolbox-tray' });
    });
    const dock = !props()?.view ? workspacePanel() : null;
    const showLabels = (shared(DISPLAY_KEY) as { labels?: boolean } | undefined)?.labels ?? true;
    const c = props()?.view === 'manual' || props()?.view === 'run' ? props().context : this.context(cx);
    if (!props()?.view && c && this.repoKey !== JSON.stringify([c.s.id, c.cwd, c.s.machine])) this.reloadRepo(cx);
    const field = (name: string, input: InputState) => h_flex().gap(8).items_center().child(div().w(80).child(name)).child(Input.new(input).flex_1().h(30).px(8).bg(t.background).border_1().border_color(t.input).rounded(5));
    const shell = v_flex().id('toolbox').size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().id("toolbox-header").on_hover((on,cx) => { this.headerHovered = on; cx.notify(); }).h(42).flex_none().pl(14).pr(dock?.embedded_header ? 82 : 14).items_center().gap(8).border_b(1).border_color(t.border)
        .child(div().min_w(0).truncate().font_semibold().when(Boolean(dock?.embedded_header),el=>el.flex_none().max_w(72)).on_click((event,cx) => {
          if (dock && event.click_count >= 2) { cx.stop_propagation(); run('workspace.rename',{panel:dock.id}); }
        }).child(props()?.view === 'manual' ? (props().entry?.id ? 'Edit tool' : 'Add a tool') : props()?.view === 'run' ? 'Run tool' : dock?.title ?? 'Toolbox'))
        .when(!props()?.view, el => el
          .child(div().id('toolbox-labels').opacity(this.headerHovered ? 1 : 0).size(24).flex().items_center().justify_center().mr(8)
            .text_size(12).text_color(showLabels ? t.muted : t.dim).cursor_pointer()
            .tooltip(showLabels ? 'Hide labels' : 'Show labels')
            .on_click(() => setShared(DISPLAY_KEY, { version: 1, labels: !showLabels })).child('Aa'))
          .child(div().id('toolbox-add').opacity(this.headerHovered ? 1 : 0).size(24).flex().items_center().justify_center().rounded(6)
          .text_color(t.muted).hover(s => s.bg(t.hover)).tooltip('Add a tool').on_click(() => { if (c?.owner) openOverlay({ mod: 'toolbox', kind: 'popup', width: 240, props: { view: 'menu', context: c } }); }).child(svg('mods/workspace-chrome/plus.svg').size(14)))));
    const root = v_flex().flex_1().min_h(0).p(12).gap(10).overflow_y_scrollbar();
    if (this.error) root.child(button('error', this.error + ' · Dismiss', () => { this.error = ''; this.pending = {}; }));
    if (!c?.owner) return shell.child(root.child(div().text_color(t.muted).child(c ? 'Loading Space toolbox…' : 'Select a Space to open its toolbox.')));
    if (this.editor) {
      const e = this.editor;
      root.child(field('Label', e.label)).child(field('Icon / text', e.icon)).child(field('Command', e.command));
      root.child(h_flex().gap(6).child(button('save', 'Save shortcut', () => { try { setShared(KEY, saveEntry(state(), e.owner, { id: e.id, label: e.label.value(), icon: e.icon.value(), command: e.command.value() }, e.revision)); this.editor = null; if (props()?.view === 'manual') closeOverlay(props().overlay); } catch (error: unknown) { this.error = error instanceof Error ? error.message : String(error); } })).child(button('cancel', 'Cancel', () => { this.editor = null; if (props()?.view === 'manual') closeOverlay(props().overlay); })));
    } else if (this.launch) {
      const l = this.launch;
      root.children(l.fields.map(f => field(f.name, f.input))).child(h_flex().gap(6).child(button('launch', 'Run ' + l.entry.label, cx => this.execute(l.entry, l.context, Object.fromEntries(l.fields.map(f => [f.name, f.input.value()])), cx))).child(button('cancel-launch', 'Cancel', () => { this.launch = null; if (props()?.view === 'run') closeOverlay(props().overlay); })));
    } else {
      const repoTools = this.repoKey === JSON.stringify([c.s.id, c.cwd, c.s.machine]) ? this.repoTools : [];
      const entries = [...new Map([...repoTools, ...(state()?.owners?.[c.owner]?.entries ?? [])].map(e => [e.id, e])).values()];
      if (this.repoError) root.child(div().text_color(t.blocked).child(this.repoError));
      root.child(h_flex().w_full().flex_wrap().justify_around().items_center().gap(8).children(entries.map(entry => {
        const record = runs()[runKey(c.owner, entry.id)];
        const terminal = record ? findRunTerminal(record, terminals()) as TerminalRecord | undefined : undefined;
        const status = record ? runStatus(record, terminal) : null;
        const active = status?.kind === 'starting' || status?.kind === 'running';
        const color = status?.kind === 'passed' ? t.ansi2 : status?.kind === 'failed' ? t.ansi1 : t.ansi4;
        return v_flex().w(110).flex_none().items_center().gap(2)
          .child(div().id('run-' + entry.id).relative().size(36).flex_none().flex().items_center().justify_center()
            .text_size(18).cursor_pointer().hover(s => s.text_color(t.accent))
            .tooltip(entry.label + (status ? ' · ' + status.label + (terminal ? ' · Click for output' : '') : ' · Run'))
            .child(entry.icon?.trim() || '▶')
            .when(Boolean(status), el => el.child(div().absolute().right(0).top(0).size(10).flex().items_center().justify_center()
              .child(active ? svg('mods/workspace-chrome/spinner.svg').size(10).text_color(t.ansi4).spin(900)
                : div().size(6).rounded(3).bg(color))))
            .on_click((_e, cx) => {
              if (terminal) run('terminal.peek', { terminal: terminal.address });
              else if (status?.kind !== 'starting') this.start(entry, c, cx);
              cx.notify();
            })
            .on_mouse_down('right', (_e, cx) => {
              cx.stop_propagation();
              openOverlay({ mod: 'toolbox', kind: 'popup', width: 180, props: { view: 'tool-menu', entry, context: c } });
            }))
          .when(showLabels, el => el.child(div().max_w(110).truncate().text_size(11).text_color(t.dim).child(entry.label)));
      })));

    }
    return shell.child(root);
  }
}
