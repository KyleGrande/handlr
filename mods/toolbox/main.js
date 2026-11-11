import { View, div } from 'gpui-kit';
import { h_flex, v_flex, InputState, Input } from 'gpui-base';
import { spaces, theme, shared, setShared, exec, run, props, layout } from 'herdr';
import { parameters, expand, saveEntry } from './model.js';
const KEY = 'toolbox.v1';
export default class Toolbox extends View {
  init(_, cx) { this.identity = {}; this.pending = {}; this.error = ''; }
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
  edit(entry, context) {
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
    const t = theme();
    const button = (id, text, action) => div().id(id).px(9).py(5).rounded(6).bg(t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => { action(); cx.notify(); }).child(text);
    if (props()?.toolbar) return button('toolbox-toggle', 'Toolbox', () => {
      const find = n => n?.id === 'toolbox-tray' ? n : n?.children?.map(find).find(Boolean);
      const tray = find(layout());
      if (tray) run(tray.hidden ? 'layout.show' : 'layout.hide', { id: 'toolbox-tray' });
    });
    const c = this.context(cx);
    const field = (name, input) => h_flex().gap(8).items_center().child(div().w(80).child(name)).child(Input.new(input).flex_1().h(30).px(8).bg(t.background).border_1().border_color(t.input).rounded(5));
    const shell = v_flex().id('toolbox').size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().font_semibold().child('Toolbox'))
        .child(div().id('toolbox-close').size(24).flex().items_center().justify_center().rounded(6)
          .text_color(t.muted).hover(s => s.bg(t.hover)).on_click(() => run('layout.hide', { id: 'toolbox-tray' })).child('×')));
    const root = v_flex().flex_1().min_h(0).p(12).gap(10).overflow_y_scrollbar();
    if (this.error) root.child(button('error', this.error + ' · Dismiss', () => { this.error = ''; this.pending = {}; }));
    if (!c?.owner) return shell.child(root.child(div().text_color(t.muted).child(c ? 'Loading Space toolbox…' : 'Select a Space to open its toolbox.')));
    if (this.editor) {
      const e = this.editor;
      root.child(field('Label', e.label)).child(field('Icon / text', e.icon)).child(field('Command', e.command)).child(div().text_color(t.muted).child('Parameters: pnpm build --mode {{mode}} · values are shell quoted'));
      root.child(h_flex().gap(6).child(button('save', 'Save shortcut', () => { try { setShared(KEY, saveEntry(shared(KEY), e.owner, { id: e.id, label: e.label.value(), icon: e.icon.value(), command: e.command.value() }, e.revision)); this.editor = null; } catch (error) { this.error = error.message; } })).child(button('cancel', 'Cancel', () => { this.editor = null; })));
    } else if (this.launch) {
      const l = this.launch;
      root.children(l.fields.map(f => field(f.name, f.input))).child(h_flex().gap(6).child(button('launch', 'Run ' + l.entry.label, () => this.execute(l.entry, l.context, Object.fromEntries(l.fields.map(f => [f.name, f.input.value()]))))).child(button('cancel-launch', 'Cancel', () => { this.launch = null; })));
    } else {
      const entries = shared(KEY)?.owners?.[c.owner]?.entries ?? [];
      root.child(h_flex().flex_wrap().gap(8).children(entries.map(entry => v_flex().gap(3).child(button('run-' + entry.id, `${entry.icon} ${entry.label}`, () => this.start(entry, c))).child(h_flex().gap(4).child(button('edit-' + entry.id, 'Edit', () => this.edit(entry, c))).child(button('copy-' + entry.id, 'Variant', () => this.edit({ ...entry, id: undefined, label: entry.label + ' copy' }, c)))))));
      if (!entries.length) root.child(div().text_color(t.muted).child('Pin builds, scripts, and everyday commands here.'));
      root.child(button('add', '+ Add command', () => this.edit(null, c)));
    }
    return shell.child(root);
  }
}
