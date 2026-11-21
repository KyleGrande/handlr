import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, props, run, spaces, theme } from "herdr";
import { collapseActions, find } from "./actions.js";

export default class WorkspacePrototype extends View {
  options() { return props() ?? {}; }

  init(_props, cx) {
    this.focus = cx.focus_handle();
    try { this.preferred = JSON.parse(localStorage.getItem("preferred-span") ?? "null"); }
    catch { this.preferred = null; }
  }

  toggle() {
    const p = this.options();
    const change = collapseActions(layout(), p.section, p.body, this.preferred);
    if (!change) return;
    this.preferred = change.preferred;
    localStorage.setItem("preferred-span", JSON.stringify(this.preferred));
    for (const [name, args] of change.commands) run(name, args);
  }

  render() {
    const p = this.options(), t = theme();
    const stop = (_event, cx) => cx.stop_propagation();
    if (p.role === "tabs") {
      const active = spaces().find(space => space.active);
      return h_flex().id("center-tabs").size_full().items_center().gap(4).px(8)
        .bg(t.chrome).overflow_x_scrollbar().children((active?.tabs ?? []).map(tab =>
          div().id(`tab-${tab.id}`).px(10).py(5).rounded(4)
            .bg(tab.active ? t.raised : t.chrome)
            .text_color(tab.active ? t.foreground : t.muted)
            .hover(style => style.bg(t.hover))
            .on_mouse_down("left", stop)
            .on_click(() => run("tab.select", { id: tab.id })).child(tab.name)
        )).child(div().id("new-tab").px(10).py(5).hover(style => style.bg(t.hover))
          .on_mouse_down("left", stop).on_click(() => run("tab.new")).child("+"));
    }
    const collapsed = Boolean(find(layout(), p.body)?.hidden);
    return div().id("section-header").size_full().flex().items_center().px(8)
      .bg(t.surface).text_color(t.foreground).text_size(12)
      .track_focus(this.focus).hover(style => style.bg(t.hover))
      .on_mouse_down("left", (_event, cx) => { cx.stop_propagation(); this.focus.focus(); })
      .on_click(() => this.toggle())
      .on_key_down((event, cx) => {
        if (["enter", "space", " "].includes(event.keystroke?.key)) {
          cx.stop_propagation(); this.toggle();
        }
      })
      .child(`${collapsed ? "▸" : "▾"} ${p.title ?? "Section"}`);
  }
}
