import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { appHome, readTextFile, writeTextFile, workspaceCommand, shared, layouts, run, theme, props, closeOverlay } from "herdr";
import { capture, compose } from "./library.js";
import { LibraryStore } from "./store.js";

export default class Layouts extends View {
  init(_props, cx) {
    this.name = InputState.new({ placeholder: "Layout name…" });
    this.store = new LibraryStore(`${appHome()}/data/layouts/presets.json`, readTextFile, writeTextFile);
    this.perform(cx, async () => { await this.store.load(); await this.inspect(); });
    cx.timer.every(2000, cx => {
      if (this.busy || this.polling) return;
      this.polling = true;
      cx.spawn(async cx => { await this.inspect(); this.polling = false; cx.notify(); });
    });
  }
  perform(cx, action) {
    if (this.busy) return;
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async cx => {
      try { await action(); }
      catch (error) { this.error = String(error?.message ?? error); }
      this.busy = false; cx.notify();
    });
  }
  async inspect() {
    try { this.current = await workspaceCommand("workspace.inspect"); }
    catch { this.current = null; }
  }
  async edit(op, id) {
    const action = { op, id, name: this.name.value() };
    if (op === "save" || op === "update") {
      const current = await workspaceCommand("workspace.inspect");
      action.snapshot = capture(current.document);
    }
    if (op === "duplicate") action.newId = this.newId();
    await this.store.edit(action);
    await this.inspect();
  }
  newId() { return `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  async apply(preset) {
    const current = await workspaceCommand("workspace.inspect");
    const document = compose(preset.snapshot, current.document);
    for (const name of new Set(preset.snapshot.panels.map(panel => panel.mod))) {
      if (await readTextFile(`${appHome()}/mods/${name}/mod.json`) === null) throw new Error(`Install the ${name} panel before applying this layout.`);
    }
    await workspaceCommand("workspace.import", { document, expected_revision: current.revision,
      expected_space: current.space, expected_workspace: current.workspace });
    await this.inspect();
  }
  button(t, id, title, action) {
    return div().id(id).px(9).py(5).rounded(5).text_size(12).text_color(this.busy ? t.dim : t.foreground)
      .when(!this.busy, el => el.cursor_pointer().hover(s => s.bg(t.hover)))
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_click((_e, cx) => this.perform(cx, action)).child(title);
  }
  render() {
    const t = theme(), presets = this.store?.library?.presets ?? [];
    let currentSnapshot = null;
    try { if (this.current) currentSnapshot = JSON.stringify(capture(this.current.document)); } catch {}
    const action = (id, title, fn) => this.button(t, id, title, fn);
    return v_flex().size_full().when(Boolean(props()?.overlay), el => el.h(538)).min_h(0).p(16).gap(10).bg(t.surface).text_color(t.foreground).text_size(13)
      .child(h_flex().w_full().items_center().child(div().flex_1().text_size(16).font_semibold().child("Layouts"))
        .when(Boolean(props()?.overlay), el => el.child(action("layouts-close", "Close", async () => closeOverlay(props().overlay)))))
      .child(div().text_color(t.muted).child(`Current window layout: ${shared("layout") ?? "—"}`))
      .child(action("layouts-remember", `${shared("layouts.remember-per-space") ? "☑" : "☐"} Remember layout per space`,
        async () => { await workspaceCommand("workspace.remember", { enabled: !shared("layouts.remember-per-space") }); }))
      .child(h_flex().h(34).px(8).rounded(6).border_1().border_color(t.border)
        .child(Input.new(this.name).h_full().w_full().text_color(t.foreground)))
      .child(h_flex().gap(4)
        .child(action("layouts-save", "Save current layout…", () => this.edit("save", this.newId())))
        .child(action("layouts-reload", "Reload", async () => { await this.store.load(); await this.inspect(); })))
      .when(Boolean(this.error || this.store?.warning), el => el.child(div().text_color(t.ansi1).child(this.error || this.store.warning)))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(8)
        .child(div().font_semibold().child("Personal panel arrangements"))
        .child(div().text_color(t.dim).child("Enter a name for Save, Rename or Duplicate."))
        .when(!presets.length, el => el.child(div().text_color(t.dim).child("No saved panel arrangements yet.")))
        .children(presets.map(preset => v_flex().gap(3).border_b(1).border_color(t.border).pb(8)
          .child(div().child(`${JSON.stringify(preset.snapshot) === currentSnapshot ? "● " : ""}${preset.name}`))
          .child(h_flex().gap(2)
            .child(action(`apply-${preset.id}`, "Apply", () => this.apply(preset)))
            .child(action(`update-${preset.id}`, "Update saved layout", () => this.edit("update", preset.id))))
          .child(h_flex().gap(2)
            .child(action(`rename-${preset.id}`, "Rename", () => this.edit("rename", preset.id)))
            .child(action(`duplicate-${preset.id}`, "Duplicate", () => this.edit("duplicate", preset.id)))
            .child(action(`delete-${preset.id}`, "Delete", () => this.edit("delete", preset.id))))))
        .child(div().mt(10).font_semibold().child("Whole-window layouts"))
        .child(div().text_color(t.dim).child("Switch window layout. These are separate from saved panel arrangements."))
        .children(layouts().map(name => h_flex().gap(4)
          .child(action(`window-layout-${name}`, `${name === shared("layout") ? "● " : ""}${name}`, async () => run("layout.switch", { name })))
          .child(action(`clone-layout-${name}`, "Duplicate", async () => run("layout.clone", { name, as: this.name.value().trim() }))))));
  }
}
