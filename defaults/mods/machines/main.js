import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { hc, machines, spaces, terminals, run, theme } from "herdr";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const settings = () => run("app.settings", { section: "machines" });

export default class Machines extends View {
  init(_props, cx) {
    this.list = null;
    this.loading = false;
    this.error = null;
    this.folded = new Set();
    this.refresh(cx);
    cx.timer.every(5000, cx => this.refresh(cx));
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async cx => {
      try {
        const result = await hc(["machine", "ls", "--json"]);
        if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Couldn't read machines.");
        const list = JSON.parse(result.stdout).machines;
        if (!Array.isArray(list)) throw new Error("Couldn't read machines.");
        this.list = list.filter(m => !m.temporary);
        this.error = null;
      } catch (error) {
        this.error = String(error.message ?? error);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  // Use the address's whole machine prefix: machine names can contain dots.
  rows() {
    const layouts = machines();
    const allSpaces = spaces();
    const allTerminals = terminals();
    return [{ name: null, state: "connected" }, ...(this.list ?? [])].map(machine => {
      const name = machine.name;
      return {
        ...machine,
        layout: layouts.find(m => m.name === name)?.layout,
        spaces: allSpaces.filter(s => (s.machine ?? null) === name),
        terminals: allTerminals.filter(t => {
          const address = t.address ?? "";
          const slash = address.lastIndexOf("/");
          return (slash < 0 ? null : address.slice(0, slash)) === name;
        }).length,
      };
    });
  }

  button(t, id, icon, label, action) {
    return h_flex().id(id).h(26).px(7).gap(5).items_center().rounded(5)
      .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .cursor_pointer().tooltip(label).on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(13).flex_none());
  }

  machineRow(t, machine, index) {
    const label = machine.name ?? "This computer";
    const folded = this.folded.has(machine.name);
    const online = ["connected", "online"].includes(machine.state);
    const loading = ["connecting", "reconnecting"].includes(machine.state) || (online && machine.layout === "loading");
    const unavailable = machine.layout === "unavailable";
    const state = unavailable && online ? "Layout unavailable" : loading ? "Connecting…" : online ? "Connected" : String(machine.state ?? "unknown").replace(/[_-]/g, " ");
    const color = loading ? t.working : online && !unavailable ? t.ansi2 : t.blocked;
    const canOpen = online && machine.layout === "ready";
    const row = v_flex().w_full().py(5)
      .child(h_flex().id(`machine-${index}`).w_full().px(7).py(7).gap(8).items_center().rounded(6)
        .hover(s => s.bg(t.hover)).cursor_pointer()
        .on_click((_e, cx) => {
          if (folded) this.folded.delete(machine.name);
          else this.folded.add(machine.name);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none().text_color(t.dim))
        .child(div().size(6).flex_none().rounded_full().bg(color))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().font_medium().text_color(t.foreground).child(label))
          .child(div().text_size(11).text_color(color).child(state)))
        .child(div().text_size(11).text_color(t.dim).child(String(machine.spaces.length))));
    if (folded) return row;
    row.child(v_flex().pl(32).pr(8).gap(5)
      .when(Boolean(machine.target), el => el.child(div().truncate().text_size(11).text_color(t.dim).tooltip(String(machine.target)).child(String(machine.target))))
      .child(div().text_size(11).text_color(t.dim).child(`${plural(machine.spaces.length, "space")} · ${plural(machine.terminals, "terminal")}`))
      .when(Boolean(machine.why), el => el.child(div().text_size(11).text_color(t.blocked).child(String(machine.why))))
      .when(machine.state === "needs_login", el => el.child(div().text_size(11).text_color(t.blocked).child(`Run hc machine login ${machine.name} in a terminal.`)))
      .when(machine.keeps_running_after_logout === false, el => el.child(div().text_size(11).text_color(t.blocked).child("Agents stop when you disconnect. Open machine settings for details.")))
      .children(machine.spaces.map((space, i) => h_flex().id(`machine-${index}-space-${i}`).min_h(28).px(7).gap(6).items_center().rounded(5)
        .bg(space.active ? t.hover : t.background).text_color(canOpen ? t.muted : t.dim)
        .when(canOpen, el => el.cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.select", { id: space.id })))
        .child(svg("mods/workspace-chrome/folder.svg").size(12).flex_none())
        .child(div().flex_1().min_w(0).truncate().child(space.name))
        .when(space.active, el => el.child(div().size(4).flex_none().rounded_full().bg(t.accent)))))
      .when(canOpen && !machine.spaces.length, el => el.child(div().py(3).text_size(11).text_color(t.dim).child("No spaces yet.")))
      .when(canOpen, el => el.child(h_flex().child(this.button(t, `machine-new-${index}`, "plus", `New space on ${label}`, () => run("space.new", { machine: machine.name ?? "" }))
        .child(div().text_size(11).child("New space"))))));
    return row;
  }

  render() {
    const t = theme();
    return v_flex().size_full().min_h(0).bg(t.background).text_size(12)
      .child(v_flex().id("machines-list").flex_1().min_h(0).px(6).overflow_y_scrollbar()
        .children(this.rows().map((m, i) => this.machineRow(t, m, i)))
        .when(this.list === null && !this.error, el => el.child(div().px(12).py(8).text_size(11).text_color(t.dim).child("Reading machines…")))
        .when(this.list?.length === 0, el => el.child(div().px(12).py(8).text_size(11).text_color(t.dim).child("Add another computer to work with its spaces here.")))
        .when(Boolean(this.error), el => el.child(div().px(12).py(8).text_size(11).text_color(t.blocked).child(`Couldn't refresh machines. ${this.error}`))))
      .child(h_flex().flex_none().h(36).px(6).gap(2).items_center().border_t(1).border_color(t.border)
        .child(this.button(t, "machines-add", "plus", "Add a machine", () => run("mod.open", { name: "machine-add" }))
          .child(div().text_size(11).child("Add machine")))
        .child(div().flex_1())
        .child(this.button(t, "machines-refresh", this.loading ? "spinner" : "refresh", "Refresh machines", (_e, cx) => this.refresh(cx)))
        .child(this.button(t, "machines-settings", "settings", "Manage machines", settings)));
  }
}
