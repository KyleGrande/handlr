// Review the two versions without changing a panel's identity or placement.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { props, theme, settings, appHome, readTextFile, writeTextFile, run, closeOverlay } from "herdr";

export default class PanelUpdates extends View {
  init(_props, cx) {
    this.updates = props()?.updates ?? [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (this.updates.length) this.choose(this.updates[0], this.updates[0].files[0], cx);
  }

  choose(update, file, cx) {
    if (this.dirty) { this.note = "Save or discard your edits before changing files."; cx.notify(); return; }
    this.user?.release(); this.app?.release(); this.user = null; this.app = null;
    this.selected = update; this.file = file; this.note = null; this.status = null; this.original = null;
    if (!file) { cx.notify(); return; }
    const path = `${update.name}/${file}`;
    this.loading = true;
    cx.spawn(async cx => {
      try {
        const [user, app] = await Promise.all([
          readTextFile(`${appHome()}/mods/${path}`),
          readTextFile(`${appHome()}/app-provided/mods/${path}`),
        ]);
        if (this.selected !== update || this.file !== file) return;
        if (user?.includes("\0") || app?.includes("\0")) throw Error("Binary files cannot be merged here. Keep your version or use the complete update.");
        this.original = user;
        const ext = file.split(".").pop(), language = /^(ts|tsx|jsx|mjs)$/.test(ext) ? "js" : ext;
        const options = { language, font_family: settings().font_family, font_size: 12 };
        this.user = EditorState.new({ ...options, value: user ?? "" });
        this.app = EditorState.new({ ...options, value: app ?? "", readonly: true });
        this.user.on("change", (_e, cx) => { this.dirty = this.user.value() !== (this.original ?? ""); cx.notify(); });
        this.status = app === null ? "The app-provided update removes this file. Keeping your version retains it." : user === null ? "This file is new in the update." : "Edit your version to incorporate the changes you want.";
      } catch (error) { this.note = String(error); }
      finally { this.loading = false; cx.notify(); }
    });
    cx.notify();
  }

  save(cx) {
    if (!this.user || this.saving) return;
    const text = this.user.value(), path = `${appHome()}/mods/${this.selected.name}/${this.file}`;
    this.saving = true;
    cx.spawn(async cx => {
      try {
        await writeTextFile(path, text, this.original);
        this.original = text; this.dirty = this.user.value() !== text;
        this.note = "Your version was saved. Review other files or choose Keep Mine.";
      } catch (error) { this.note = String(error); }
      finally { this.saving = false; cx.notify(); }
    });
    cx.notify();
  }

  resolve(action, cx) {
    if (this.dirty || this.saving) { this.note = "Save or discard your edits first."; cx.notify(); return; }
    const update = this.selected;
    run("mod.update", { name: update.name, action, version: update.version, user_version: update.user_version });
  }

  close(cx) {
    if (this.dirty || this.saving) { this.note = "Save or discard your edits before closing."; cx.notify(); return; }
    closeOverlay(props().overlay);
  }

  button(id, text, action, primary = false) {
    const t = theme();
    return h_flex().id(id).h(30).px(12).items_center().rounded(6).cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover(s => s.opacity(0.85)).on_click(action).child(text);
  }

  render() {
    const t = theme(), selected = this.selected;
    const column = (title, editor) => v_flex().flex_1().min_w(0).min_h(0).gap(6)
      .child(div().font_semibold().child(title))
      .child(div().flex_1().min_h(0).relative().border_1().border_color(t.border).rounded(6).overflow_hidden()
        .child(editor ? Editor.new(editor).absolute().inset_0() : div().p(12).text_color(t.dim).child(this.loading ? "Loading…" : "No text preview")));
    const rows = this.updates.flatMap(update => [
      div().id(`update-${update.name}`).p(6).rounded(4).cursor_pointer().bg(selected === update ? t.selected : t.background)
        .on_click((_e, cx) => this.choose(update, update.files[0], cx)).child(update.title ?? update.name),
      ...(selected === update ? update.files.map(file => div().id(`update-file-${file}`).px(10).py(4).truncate().cursor_pointer()
        .text_color(this.file === file ? t.accent : t.muted).on_click((_e, cx) => this.choose(update, file, cx)).child(file)) : []),
    ]);
    const sidebar = v_flex().w(210).flex_none().min_h(0).overflow_y_scrollbar().gap(5).children(rows);
    const save = h_flex().gap(8)
      .child(this.button("updates-save", this.saving ? "Saving…" : "Save User Version", (_e, cx) => this.save(cx)))
      .when(Boolean(this.dirty), e => e.child(this.button("updates-discard", "Discard Edits", (_e, cx) => {
        this.user.set_value(this.original ?? ""); this.dirty = false; this.note = null; cx.notify();
      })));
    const review = v_flex().flex_1().min_w(0).min_h(0).gap(8)
      .child(div().truncate().child(this.file ?? "Your version already matches the app-provided update."))
      .child(h_flex().flex_1().min_h(0).items_stretch().gap(12).child(column("Your Version", this.user)).child(column("App-provided Update", this.app)))
      .when(Boolean(this.status), e => e.child(div().text_color(t.dim).child(this.status)))
      .child(save);
    const actions = h_flex().gap(8).justify_end()
      .child(this.button("updates-keep", "Keep Mine", (_e, cx) => this.resolve("keep", cx), true))
      .child(this.button("updates-use", "Use Update", (_e, cx) => this.resolve("use", cx)));
    return v_flex().id("panel-updates").size_full().min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(12)
      .track_focus(this.handle).on_key_down((e, cx) => { if (e.key === "escape") { this.close(cx); cx.stop_propagation(); } })
      .child(h_flex().gap(8).items_center().child(div().flex_1().text_size(16).font_semibold().child("Panel Updates"))
        .child(this.button("updates-close", "Close", (_e, cx) => this.close(cx))))
      .child(div().text_color(t.muted).child("Your customized panels stay active. Keep your version, review and merge changes, or replace it with the app-provided update."))
      .when(!selected, el => el.child(div().p(16).text_color(t.muted).child("No panel updates are waiting for a decision.")))
      .when(Boolean(selected), el => el.child(h_flex().flex_1().min_h(0).items_stretch().gap(14).child(sidebar).child(review)).child(actions))
      .when(Boolean(this.note), el => el.child(div().text_color(t.blocked).child(this.note)));
  }
}
