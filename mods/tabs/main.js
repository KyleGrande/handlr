import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, setShared, layout, settings, props } from "herdr";
import { startGlass } from "./glass.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Native docks persist visibility with workspace transactions. This mod owns
// the terminal-only restore snapshot and visibility for legacy layouts.
class DockVisibility {
  constructor() {
    try { this.saved = JSON.parse(localStorage.getItem("dock-visibility") ?? "{}"); } catch { this.saved = {}; }
    if (!this.saved || typeof this.saved !== "object" || Array.isArray(this.saved)) this.saved = {};
    if (!shared("tabs.dock-visibility") && Object.keys(this.saved).length) setShared("tabs.dock-visibility", this.saved);
  }
  docks(root) {
    return [
      ["left", ["@workspace/zone/left", "sidebar"]],
      ["top", ["@workspace/zone/top", "@workspace/zone/top_center"]],
      ["bottom", ["@workspace/zone/bottom", "@workspace/zone/bottom_center"]],
      ["right", ["@workspace/zone/right", "panel"]],
    ].map(([edge, ids]) => ({ edge, nodes: ids.map(id => find(root, id)).filter(n => n && n.children?.length) }));
  }
  state(root) {
    // The window strip and fullscreen tab bar are two copies of this mod.
    this.saved = shared("tabs.dock-visibility") ?? this.saved;
    const key = String(shared("layout") ?? root?.workspace ?? root?.id ?? "main");
    const state = this.saved[key];
    if (!state || typeof state !== "object" || !state.hidden || typeof state.hidden !== "object") {
      this.saved[key] = { hidden: {}, restore: null };
    }
    return this.saved[key];
  }
  save() {
    setShared("tabs.dock-visibility", this.saved);
    localStorage.setItem("dock-visibility", JSON.stringify(this.saved));
  }
  sync(root) {
    const state = this.state(root);
    let changed = false;
    for (const { nodes } of this.docks(root)) for (const node of nodes) {
      const native = node.id.startsWith("@workspace/zone/");
      if (native && state.workspaceVisibility) {
        // Opening a panel deliberately reveals its dock. Replaying an old
        // preference would hide it again and resize terminals twice.
        continue;
      }
      if (state.restore && !(node.id in state.restore)) {
        state.restore[node.id] = Boolean(node.hidden);
        state.hidden[node.id] = true;
        this.save();
      }
      const hidden = state.hidden[node.id];
      if (typeof hidden === "boolean" && hidden !== Boolean(node.hidden)) run(hidden ? "layout.hide" : "layout.show", { id: node.id });
    }
    if (find(root, "@workspace/root") && !state.workspaceVisibility) {
      // Preserve saved visibility from builds where it lived only in the mod.
      state.workspaceVisibility = true;
      changed = true;
    }
    if (changed) this.save();
  }
  toggle(root, edge) {
    const state = this.state(root);
    const nodes = this.docks(root).find(d => d.edge === edge)?.nodes ?? [];
    const hidden = nodes.some(n => !n.hidden);
    // A side button exits terminal-only mode, keeping the other sides as-is.
    state.restore = null;
    for (const node of nodes) {
      state.hidden[node.id] = hidden;
      run(hidden ? "layout.hide" : "layout.show", { id: node.id });
    }
    this.save();
  }
  terminalOnly(root) {
    const state = this.state(root);
    const nodes = this.docks(root).flatMap(d => d.nodes);
    if (state.restore) {
      for (const node of nodes) {
        const hidden = state.restore[node.id] ?? Boolean(node.hidden);
        state.hidden[node.id] = hidden;
        run(hidden ? "layout.hide" : "layout.show", { id: node.id });
      }
      state.restore = null;
    } else {
      state.restore = Object.fromEntries(nodes.map(n => [n.id, Boolean(n.hidden)]));
      for (const node of nodes) {
        state.hidden[node.id] = true;
        run("layout.hide", { id: node.id });
      }
      const terminal = panes().find(p => p.terminal && p.focused) ?? panes().find(p => p.terminal && spaces().some(s => s.active && s.tabs.some(t => t.active && t.id === p.tab)));
      if (terminal) run("pane.focus", { pane: terminal.pane });
    }
    this.save();
  }
}

// Same as the agents mod: drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

export default class Tabs extends View {
  init(_props, cx) {
    startGlass(cx);
    this.dockVisibility = new DockVisibility();
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
  // small events per gesture: a short swipe or one smoothed notch (about
  // 25 px) switches one tab, a longer swipe keeps going a tab per 60 px, at
  // most one every 100 ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause
    // or a turn starts a new gesture.
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    this.dockVisibility.sync(root);
    const docks = this.dockVisibility.docks(root);
    const terminalOnly = Boolean(this.dockVisibility.state(root).restore);
    const hidePanelButtons = Boolean(shared("tabs.hide-panel-buttons"));
    // Match native traffic-light geometry even when the workspace is zoomed.
    const controlScale = props()?.windowControls ? 1 / settings().zoom : 1;
    const dockButton = (id, icon, tip, on, action) => button(id, svg(`mods/tabs/${icon}.svg`).size(15 * controlScale), action)
      .when(Boolean(props()?.windowControls), el => el.size(20 * controlScale))
      .tooltip(tip).bg(on ? t.selected : "#00000000").text_color(on ? t.foreground : t.dim);
    const controls = () => h_flex().id("dock-controls").h_full().gap(2 * controlScale).items_center()
      .children(docks.filter(d => d.nodes.length).map(d => {
        const visible = d.nodes.some(n => !n.hidden);
        return dockButton(`dock-${d.edge}`, `dock-${d.edge}`, `${visible ? "Hide" : "Show"} ${d.edge} panels`, visible, () => this.dockVisibility.toggle(layout(), d.edge));
      }))
      .when(docks.some(d => d.nodes.length), el => el.child(dockButton("terminal-only", "terminal-only", terminalOnly ? "Restore panels" : "Terminal only", terminalOnly, () => this.dockVisibility.terminalOnly(layout()))));
    if (props()?.windowControls) return h_flex().size_full().justify_end().pr(6 * controlScale)
      .when(!hidePanelButtons, el => el.child(controls()));
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(Boolean(panel) && enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(Boolean(panel) && enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(!hidePanelButtons && (w?.fullscreen || w?.platform !== "macos" || w?.titlebar !== "system"), el => el.child(controls()))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
