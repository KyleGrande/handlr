import { View, div } from 'gpui-kit';
import { h_flex, v_flex, InputState, Input } from 'gpui-base';
import { spaces, agents, terminals, focused, theme, shared, setShared, exec, run, props } from 'herdr';
import { parameters, expand, saveEntry } from './model.js';
const KEY = 'toolbox.v1';
export default class Toolbox extends View {
  init(_, cx) { this.scope = 'workspace'; this.identity = {}; this.pending = {}; this.error = ''; }
  context(cx) {
    const s = spaces().find(s => s.active);
    if (!s) return null;
    const a = agents().find(a => a.space === s.id && a.focused) ?? agents().find(a => a.space === s.id && a.address === focused()?.agent);
    const terminal = terminals().find(t => t.address === a?.address);
    const cwd = s.folder;
    const signature = JSON.stringify([s.id, s.machine, cwd, a?.address, terminal?.created_ms, terminal?.foreground?.pid]);
    if (!this.identity[signature] && !this.pending[signature]) {
      this.pending[signature] = true;
      cx.spawn(async cx => {
        try {
          const result = await exec('hc', ['server', 'status', '--json'], { on: s.machine });
          if (result.code) throw new Error('Core identity unavailable');
          const data = JSON.parse(result.stdout), machine = data.core?.id ?? data.id;
          if (!machine) throw new Error('Core identity unavailable');
          const git = await exec('git', ['rev-parse', '--show-toplevel'], { cwd, on: s.machine });
          let agent = null;
          if (a && terminal?.created_ms && terminal?.foreground?.pid) {
            const ps = await exec('ps', ['-p', String(terminal.foreground.pid), '-o', 'lstart='], { on: s.machine });
            if (!ps.code && ps.stdout.trim()) agent = JSON.stringify([machine, a.address, terminal.created_ms, terminal.foreground.pid, ps.stdout.trim()]);
          }
          this.identity[signature] = { workspace: JSON.stringify([machine, 'space', s.id.replace(s.machine ? s.machine + '/' : /^$/, '')]), worktree: git.code ? null : JSON.stringify([machine, 'worktree', git.stdout.trim()]), agent };
        } catch (e) { this.error = String(e.message ?? e); }
        cx.notify();
      });
    }
    return { s, cwd, owner: this.identity[signature]?.[this.scope], signature };
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
    const t = theme(), c = this.context(cx);
    const button = (id, text, action) => div().id(id).px(9).py(5).rounded(6).bg(t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => { action(); cx.notify(); }).child(text);
    if (props()?.toolbar) return button('toolbox-toggle', 'Toolbox', () => run(shared('toolbox.open') ? 'layout.hide' : 'layout.show', { id: 'toolbox-tray' }) || null).on_click((_e, cx) => { const open = !shared('toolbox.open'); setShared('toolbox.open', open); run(open ? 'layout.show' : 'layout.hide', { id: 'toolbox-tray' }); cx.notify(); });
    const field = (name, input) => h_flex().gap(8).items_center().child(div().w(80).child(name)).child(Input.new(input).flex_1().h(30).px(8).bg(t.background).border_1().border_color(t.input).rounded(5));
    const root = v_flex().size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(12).p(10).gap(8).overflow_y_scrollbar();
    root.child(h_flex().gap(6).items_center().child(div().font_semibold().child('Toolbox')).children(['workspace', 'agent', 'worktree'].map(scope => button('scope-' + scope, (scope === this.scope ? '• ' : '') + scope, () => { this.scope = scope; this.editor = null; this.launch = null; }))).child(div().flex_1()).child(button('close', '×', () => { setShared('toolbox.open', false); run('layout.hide', { id: 'toolbox-tray' }); })));
    if (this.error) root.child(button('error', this.error + ' · Dismiss', () => { this.error = ''; this.pending = {}; }));
    if (!c?.owner) return root.child(div().text_color(t.muted).child(this.scope === 'agent' ? 'Select a live agent to open its toolbox.' : 'Resolving workspace… Worktree scope requires a Git checkout.'));
    root.child(div().text_color(t.dim).child(c.s.name + ' · ' + c.cwd));
    if (this.editor) {
      const e = this.editor;
      root.child(field('Label', e.label)).child(field('Icon / text', e.icon)).child(field('Command', e.command)).child(div().text_color(t.muted).child('Parameters: pnpm build --mode {{mode}} · values are shell quoted'));
      root.child(h_flex().gap(6).child(button('save', 'Save shortcut', () => { try { setShared(KEY, saveEntry(shared(KEY), e.owner, { id: e.id, label: e.label.value(), icon: e.icon.value(), command: e.command.value() }, e.revision)); this.editor = null; } catch (error) { this.error = error.message; } })).child(button('cancel', 'Cancel', () => { this.editor = null; })));
    } else if (this.launch) {
      const l = this.launch;
      root.children(l.fields.map(f => field(f.name, f.input))).child(h_flex().gap(6).child(button('launch', 'Run ' + l.entry.label, () => this.execute(l.entry, l.context, Object.fromEntries(l.fields.map(f => [f.name, f.input.value()]))))).child(button('cancel-launch', 'Cancel', () => { this.launch = null; })));
    } else {
      const entries = shared(KEY)?.owners?.[c.owner]?.entries ?? [];
      root.child(h_flex().gap(8).children(entries.map(entry => v_flex().gap(3).child(button('run-' + entry.id, `${entry.icon} ${entry.label}`, () => this.start(entry, c))).child(h_flex().gap(4).child(button('edit-' + entry.id, 'Edit', () => this.edit(entry, c))).child(button('copy-' + entry.id, 'Variant', () => this.edit({ ...entry, id: undefined, label: entry.label + ' copy' }, c)))))));
      if (!entries.length) root.child(div().text_color(t.muted).child('Pin builds, scripts, and everyday commands here.'));
      root.child(button('add', '+ Add command', () => this.edit(null, c)));
    }
    return root;
  }
}
