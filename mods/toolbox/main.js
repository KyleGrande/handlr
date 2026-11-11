import { View, div, svg } from 'gpui-kit';
import { h_flex, v_flex, InputState, Input } from 'gpui-base';
import { spaces, theme, shared, setShared, exec, run, props, layout, readTextFile, openOverlay, closeOverlay, appHome } from 'herdr';
import { parameters, expand, saveEntry, repoTools } from './model.js';
const KEY = 'toolbox.v1';
export default class Toolbox extends View {
  init(_, cx) {
    this.identity = {}; this.pending = {}; this.error = ''; this.repoTools = []; this.repoText = null;
    if (props()?.view === 'manual') this.edit(null, props().context);
    if (!props()?.view && !props()?.toolbar) {
      this.reloadRepo(cx);
      cx.timer.every(5000, cx => this.reloadRepo(cx));
    }
  }
  reloadRepo(cx) {
    const space = spaces().find(s => s.active);
    if (!space || this.repoLoading) return;
    const key = JSON.stringify([space.id, space.folder, space.machine]);
    if (this.repoKey !== key) { this.repoKey = key; this.repoTools = []; this.repoText = null; }
    this.repoLoading = true;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(space.folder.replace(/\/$/, '') + '/.herdr/toolbox.json', { on: space.machine });
        if (this.repoKey !== key || text === this.repoText) return;
        this.repoTools = repoTools(text);
        this.repoText = text; this.repoError = ''; cx.notify();
      } catch (error) { this.repoError = String(error.message ?? error); cx.notify(); }
      finally { this.repoLoading = false; }
    });
  }
  renderMenu() {
    const t = theme(), context = props().context;
    const item = (id, label, icon, action) => h_flex().id(id).h(34).flex_none().px(9).gap(9).rounded(6).items_center().cursor_pointer().text_size(13).text_color(t.foreground)
      .hover(s => s.bg(t.hover)).child(svg('mods/workspace-chrome/' + icon + '.svg').size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().child(label)).on_click((_e, cx) => action(cx));
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
  context(cx) {
    const s = spaces().find(s => s.active);
    if (!s) return null;
    const cwd = s.folder;
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
        } catch (e) { this.error = String(e.message ?? e); }
        cx.notify();
      });
    }
    return { s, cwd, owner: this.identity[signature], signature };
  }
  input(value) { return InputState.new({ value }); }
  edit(entry, context, cx) {
    const record = shared(KEY)?.owners?.[context.owner];
    this.editor = { owner: context.owner, revision: record?.revision ?? 0, id: entry?.id ?? `${Date.now()}-${Math.random()}`, label: this.input(entry?.label ?? ''), command: this.input(entry?.command ?? ''), icon: this.input(entry?.icon ?? '▶') };
    this.launch = null;
  }
  start(entry, context) {
    const names = parameters(entry.command);
    if (names.length) this.launch = { entry, context, fields: names.map(name => ({ name, input: this.input('') })) };
    else this.execute(entry, context, {});
  }
  execute(entry, context, values) {
    try {
      const command = expand(entry.command, values);
      run('tab.new', { space: context.s.id, folder: context.cwd, name: entry.label, argv: ['sh', '-lc', `${command}\n_toolbox_status=$?; printf '\\n[Toolbox exit %s]\\nPress Enter to close…' "$_toolbox_status"; read _toolbox_done; exit "$_toolbox_status"`] });
      this.launch = null;
    } catch (e) { this.error = e.message; }
  }
  render(cx) {
    if (props()?.view === 'menu') return this.renderMenu();
    const t = theme();
    const button = (id, text, action) => div().id(id).px(9).py(5).rounded(6).bg(t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => { action(cx); cx.notify(); }).child(text);
    if (props()?.toolbar) return button('toolbox-toggle', 'Toolbox', () => {
      const find = n => n?.id === 'toolbox-tray' ? n : n?.children?.map(find).find(Boolean);
      const tray = find(layout());
      if (tray) run(tray.hidden ? 'layout.show' : 'layout.hide', { id: 'toolbox-tray' });
    });
    const c = props()?.view === 'manual' ? props().context : this.context(cx);
    if (!props()?.view && c && this.repoKey !== JSON.stringify([c.s.id, c.cwd, c.s.machine])) this.reloadRepo(cx);
    const field = (name, input) => h_flex().gap(8).items_center().child(div().w(80).child(name)).child(Input.new(input).flex_1().h(30).px(8).bg(t.background).border_1().border_color(t.input).rounded(5));
    const shell = v_flex().id('toolbox').size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().font_semibold().child(props()?.view === 'manual' ? 'Add a tool' : 'Toolbox'))
        .when(props()?.view !== 'manual', el => el.child(div().id('toolbox-add').size(24).flex().items_center().justify_center().rounded(6)
          .text_color(t.muted).hover(s => s.bg(t.hover)).tooltip('Add a tool').on_click(() => { if (c?.owner) openOverlay({ mod: 'toolbox', kind: 'popup', width: 240, props: { view: 'menu', context: c } }); }).child(svg('mods/workspace-chrome/plus.svg').size(14)))));
    const root = v_flex().flex_1().min_h(0).p(12).gap(10).overflow_y_scrollbar();
    if (this.error) root.child(button('error', this.error + ' · Dismiss', () => { this.error = ''; this.pending = {}; }));
    if (!c?.owner) return shell.child(root.child(div().text_color(t.muted).child(c ? 'Loading Space toolbox…' : 'Select a Space to open its toolbox.')));
    if (this.editor) {
      const e = this.editor;
      root.child(field('Label', e.label)).child(field('Icon / text', e.icon)).child(field('Command', e.command));
      root.child(h_flex().gap(6).child(button('save', 'Save shortcut', () => { try { setShared(KEY, saveEntry(shared(KEY), e.owner, { id: e.id, label: e.label.value(), icon: e.icon.value(), command: e.command.value() }, e.revision)); this.editor = null; if (props()?.view === 'manual') closeOverlay(props().overlay); } catch (error) { this.error = error.message; } })).child(button('cancel', 'Cancel', () => { this.editor = null; if (props()?.view === 'manual') closeOverlay(props().overlay); })));
    } else if (this.launch) {
      const l = this.launch;
      root.children(l.fields.map(f => field(f.name, f.input))).child(h_flex().gap(6).child(button('launch', 'Run ' + l.entry.label, () => this.execute(l.entry, l.context, Object.fromEntries(l.fields.map(f => [f.name, f.input.value()]))))).child(button('cancel-launch', 'Cancel', () => { this.launch = null; })));
    } else {
      const repoTools = this.repoKey === JSON.stringify([c.s.id, c.cwd, c.s.machine]) ? this.repoTools : [];
      const entries = [...new Map([...repoTools, ...(shared(KEY)?.owners?.[c.owner]?.entries ?? [])].map(e => [e.id, e])).values()];
      if (this.repoError) root.child(div().text_color(t.blocked).child(this.repoError));
      root.child(h_flex().flex_wrap().gap(8).children(entries.map(entry => v_flex().gap(3).child(button('run-' + entry.id, `${entry.icon} ${entry.label}`, () => this.start(entry, c))).child(h_flex().gap(4).child(button('edit-' + entry.id, 'Edit', () => this.edit(entry, c))).child(button('copy-' + entry.id, 'Variant', () => this.edit({ ...entry, id: undefined, label: entry.label + ' copy' }, c)))))));
    }
    return shell.child(root);
  }
}
