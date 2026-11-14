# Herdr panel workspace development plan

Status: the user narrowed the local Handlr release to the existing docked workspace, native floating panel windows with resize/redocking, and practical keyboard shortcuts. The broader original plan remains future work. See IMPLEMENTATION.md for release verification and limitations.


Docking revision — 2026-11-13: add upper/lower center docks alongside full-width
top/bottom docks. Side zones surround the complete center column, including its
upper and lower docks. Full-width zones surround all three columns. These are
independent, movable and resizable destinations, not a global width toggle.

Scope revision — 2026-11-13: the user removed collapse from the desired UI.
Panels close/reopen instead. References below to collapse describe the earlier
plan and no longer impose a release requirement. Keep one panel title row,
share the original Files/Changes header, hide redundant single-view group labels,
use plain selected view tabs, and support quick rename without changing identity.

## Current release scope — revised 2026-11-13

The user narrowed this local Handlr release to the existing docked workspace,
real floating panel windows with resize/redocking and preserved live panel state,
and a small set of keyboard bindings. Terminal transfers, context pinning,
legacy migration and the other unfinished features below are future work rather
than requirements for this local release. The original complete plan below is
retained as the longer-term design. This does not authorize an upstream Herdr release.

## Original complete release scope

This is one complete implementation plan. All features described here are required for release; none are deferred to another release. Development steps express dependencies within that implementation, not separately shipped subsets. Optional layout choices mean the user can enable or hide a feature, not that its implementation is optional.

The release includes stable configurable zones, movable/resizable panels, stacked groups, alternative views, collapsible sections, activity navigation, keyboard/menu equivalents, center integration, floating windows with resize/redocking, context pinning, supported duplication, undo/redo, persistence, export/import, migration, recovery, and native verification.

## Agreed experience

Replace the solid, special-purpose left sidebar with configurable panels. Preserve stable side zones: left and right retain their arrangements as the center changes between terminal tabs and workspaces. Each side supports multiple stacked groups. All content panels can move and resize, including Spaces, Agents, Rigs, Toolbox, Files, Changes, and Context.

There are two distinct kinds of grouping:

- **Sections appear together.** Changes above Files, each with a collapsible header and a draggable divider, can belong to one view. Five sections can live under one view button.
- **Views replace one another.** A Code view containing Changes and Files can share a group with a Context view. Selecting Context fills that group's rectangle. Returning to Code restores both sections, their sizes, and their collapse state.

User confirmed: Context replaces only its dock pane's contents. Terminals and other panes remain visible. User additionally requested stable quadrants, with stackable groups on the left and right and a changing center. Interpret quadrants as stable layout regions, not four equal rectangles. If a side has two groups, each is independently selectable; explicitly merging them creates one larger group.

```text
Stable left zone             Changing center              Stable right zone
┌──────────────────────┐  ┌──────────────────────────┐  ┌────────────────────┐
│ Group A: Code Context│  │ Workspace / terminal tabs│  │ Group C: Toolbox   │
│ [Code selected]      │  │                          │  │                    │
│ ▾ Changes            │  │ Terminal 1 │ Terminal 2  │  ├────────────────────┤
│ ─── resize ───────── │  │            │             │  │ Group D: Rigs      │
│ ▾ Files              │  │            │             │  │                    │
├──────────────────────┤  │            │             │  │                    │
│ Group B: Spaces Agents│ │                          │  │                    │
└──────────────────────┘  └──────────────────────────┘  └────────────────────┘

Selecting Context in Group A:
┌──────────────────────┐
│ Group A: Code Context│   Only this rectangle changes.
│ [Context selected]   │   Group B, the center, and the right zone stay put.
│                      │
│ Context fills group  │
│                      │
└──────────────────────┘
```

The labels above are examples, not mandatory defaults. A single left group can occupy the entire left zone, so Context can fill the whole left pane in the user's original example.

## Product rules

### Stable zones

- Support left, center, right, top, and bottom zones in the complete release. Top and bottom are user-enabled layout choices and can remain hidden. Do not force a four-quadrant grid or fixed dimensions.
- Outer zones are window-local layout preferences. Their group order, widths/heights, proportions, selected views, and collapsed sections survive center tab/space switches and restart.
- A stable position does not freeze panel data: Files can follow the active checkout while remaining in the same rectangle. Support explicit pinning where appropriate.
- Zones can be empty, hidden, resized, or revealed through a compact configurable activity rail and commands. Empty side zones consume no content width. The rail is not a mandatory full-height content sidebar.
- Stacking a second group splits a left/right zone vertically; top/bottom zones support horizontal group arrangements. Each group has its own selected view. Dragging their divider changes their proportions.
- Switching a view never changes zone width or neighboring group sizes. Content must scroll or adapt within its allocated bounds.
- Group maximize is an explicit, temporary action with a restore affordance; selecting Context does not maximize the zone or workspace.

### Views and sections

- A view has a button/tab and an ordered collection of sections. A one-panel view has one section and uses the whole group.
- All sections have host-owned drag/collapse headers. Expanded sections share remaining height using saved weights; collapsed sections keep just their headers. All may be collapsed.
- Collapse redistributes space among expanded siblings without discarding the collapsed section's preferred expanded size. Restore using saved weights subject to available space.
- If minimum heights cannot fit, scroll the section stack; never silently hide content or expand the zone. Clamp restored sizes for smaller windows.
- Buttons select a view in its assigned group. A compact activity rail may select views in several groups; it must reveal/focus the owning group rather than move or duplicate a view.
- Closing/hiding a panel does not uninstall its mod or erase its data. Removing the last section removes an empty view; removing the last view removes an empty group. Keep valid focus and a way to reopen everything.

### Dragging and menus

Make the intended result visible before drop. Do not infer grouping from a generic center drop.

| Drop target | Result |
| --- | --- |
| Section insertion line in a view | Move section above/below another section; both remain visible |
| Group's view-button strip | Create/reorder an alternative view; it replaces other views when selected |
| Gap between side groups | Move/create an independent stacked group |
| Outer left/right/top/bottom zone target | Dock the dragged panel/view/group in that zone |
| Edge of a center pane | Split beside that pane using the moved panel or group |
| Center group tab strip | Add an alternative view to that group |
| Floating target / explicit Float command | Detach into a movable, resizable in-app window |
| Invalid target or Escape | Cancel without changing layout or state |

Drag a section header to move one panel; a view button to move its complete section arrangement; a group grip to move all its alternative views. Moving is the default. A separate Duplicate action is offered only for panels that support multiple instances.

Provide the same operations through context menus and the command palette: Move to zone/group/view, New group, New view, Reorder, Collapse/Expand, Hide, Float, and Restore. Keyboard navigation and movement must cover all supported targets. Menus, keyboard controls, and native drag-and-drop are all release requirements.

“Move anywhere” means meaningful workspace targets, not replacing status bars, title bars, dialogs, or the window controls. Those remain chrome. Content formerly embedded in chrome, such as Spaces and Agents, becomes ordinary panels.

### Center and terminal safety

- Retain the current tab/space-driven terminal model. Side stability must not require rebuilding the center when a panel switches.
- Center groups can host terminals or mods. Moving a terminal preserves its Core address, process, PTY, and buffer; a move never becomes close-and-relaunch.
- Moving a mod between the center and a side preserves its instance identity. Presentation location and contextual binding are separate properties.
- Terminal and mod panels both support collapsible sections and alternative views. Collapsing or hiding a terminal removes its visible content while retaining its process, address, buffer, and saved expanded size. Restore its display and deliver the correct terminal dimensions on expansion.
- Existing explicit terminal close/kill semantics remain. Hiding a group, collapsing a zone, switching a view, or moving a panel must not terminate a process or launch anything.
- Cross-machine center moves require valid machine ownership. Reject unsupported destinations without detaching the source. Side placement remains local to the screen; do not write personal dock widths into Core's shared machine layout.

## Existing foundation and gaps

Verified from installed files:

- Layout `row`/`column` nodes support weighted/fixed sizes, minimums/maximums, and resizable boundaries.
- Layout `stack` selects one child; a child can itself be a column. This can prototype Code-versus-Context replacement without a new renderer.
- Mod panes can live in terminal tabs. Existing pane dragging is limited to panes within a split tab. It does not provide universal side-to-center docking.
- `openOverlay` supports draggable in-app mod windows and saved positions. Interactive resize/redocking is not established by those declarations and needs host work/verification.
- Saved layout click state lives in `layouts/.state/`; tab structure lives in machine Core documents. These are separate persistence domains.
- Copies of a mod currently live with their layout block; removing a block or changing its mod/props can recreate it. Context uses per-copy localStorage for drafts and pending tags. Recreating a panel during a move risks losing continuity.
- Installed Toolbox has controls coupled to the specific `toolbox-tray` layout node. Open/reveal controls need to target panel identity instead of hardcoded placement.

Sources inspected: `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `layouts/toolbox-workspace.json`, Context's `native/panel.js`, and Toolbox's `main.js`. Live status identified `toolbox-workspace` with no reported errors. No live docking interactions were performed.

## Proposed implementation

### 1. Separate identity, composition, and placement

Use stable IDs for panel instances, sections, views, and groups. Titles, mod names, tree indexes, and paths are not instance identities. A panel registry owns live instances; layout trees reference those instances.

Illustrative model, not an installed API:

```ts
type PanelInstance = {
  id: string;
  content: { kind: 'mod'; mod: string; props: unknown }
         | { kind: 'terminal'; machineId: string; address: string };
  binding: { kind: 'follow-active' }
         | { kind: 'pinned'; machineId: string; checkoutId: string };
};
type Section = { id: string; panelId: string; collapsed: boolean; weight: number };
type View = { id: string; title: string; sections: Section[] };
type Group = { id: string; activeViewId: string; views: View[] };
type Zone = { id: string; edge: 'left' | 'right' | 'top' | 'bottom';
              extent: number; hidden: boolean;
              groups: { groupId: string; weight: number }[] };
```

Use discriminated content types in production so terminal lifecycle and resizing are handled correctly inside sections as well as full-group views. Runtime validation must enforce unique placement, valid references, active-view membership, positive weights, and acyclic ownership. Model the center's existing split tree separately from outer-zone extent preferences while allowing the same groups and panels to move between them.

### 2. One mutation engine

Proposed commands: `panel.move`, `view.move`, `group.move`, `view.select`, `section.collapse`, `group.resize`, and `zone.resize`. These names are design proposals.

Each operation resolves explicit stable source/target IDs, validates the complete destination, updates a draft model, normalizes empty containers, then commits atomically. Rejected or cancelled operations leave the original model intact. Menus, drag-and-drop, keyboard shortcuts, and agent-accessible app commands use the same mutations. Include undo/redo for structural moves and grouping.

A panel may occupy one location per instance. Switching an activity button locates/reveals its current instance. Existing global “open panel” routes through this registry rather than recreating a right-side copy.

### 3. Native rendering and host bridge

Proposed host responsibilities:

- `workspace_model`: zones, groups, views, sections, layout version, validation.
- `workspace_operations`: pure move/select/collapse/resize logic and undo records.
- `panel_registry`: stable runtime instances, focus, state namespaces, and visibility.
- `workspace_render`: split boundaries, group strips, accordion headers, empty targets.
- `workspace_drag`: shared drag payloads, hit testing, previews, insertion zones, cancellation.
- `workspace_persistence`: atomic local saves, migration, recovery, export/import.
- `mod_bridge`: reveal-by-instance, container information, focus/visibility notifications, declarations.

Prefer extending existing split/stack rendering and GPUI interactions after a host source audit. Keep these as logical boundaries rather than requiring seven new files or a wholesale renderer rewrite.

### 4. Instance lifetime and context

Moving reparents an existing instance rather than invoking destructive close/create behavior. Preserve localStorage namespace, pending edits, scroll, watchers, and tasks. A temporary detach during commit must not run the mod's close cleanup. Crash recovery restores persistent state; live moves should retain the runtime instance when possible.

Track keyboard focus separately from the active work context. Clicking Context must not erase the checkout it was following. Capture the target when an edit or run begins, so later focus changes cannot redirect the operation. A pinned panel remains pinned when moved.

Multiple copies are explicit and capability-controlled. They have distinct drafts/state namespaces but may share durable domain data. Stable localStorage namespaces for legacy copies need migration before instance keys change.

### 5. Persist local composition without duplicating Core ownership

Keep personal side-zone composition in a versioned local workspace document. Preserve machine Core as the owner of terminal/tab structure. For cross-boundary transfers, stage the destination, apply revision-checked ownership/reference changes, and commit or recover using an operation record. On failure, retain the original placement. Audit Core APIs before choosing the exact transfer protocol; do not promise cross-store atomicity from two file writes.

Save resize changes at a bounded/debounced rate and flush settled state. Use atomic replace, last-known-good recovery, and layout export. Preserve unknown fields when compatibility requires it. Missing mods restore as removable placeholders rather than dropping their saved arrangement.

### 6. Migration

Make the complete panel workspace available as an opt-in layout. Keep shipped layouts and the user's active layout intact. Import into a new named layout after creating a fresh backup. Opt-in activation protects existing choices; it does not reduce release scope.

- Map existing right-panel stack children to alternative views in one group.
- Convert existing left Spaces/Agents/Rigs placement into ordinary panels in a stable left group, preserving relative sizes where possible.
- Convert Toolbox tray into a fully movable view, preserving its current location during import.
- Preserve user props, hidden/selected state, theme, sizes, and terminal identity.
- Offer explicit composition actions to combine Changes and Files into one view; do not assume this grouping for every user.
- Preserve unconvertible custom blocks as compatibility content, or report them before activation. Never silently discard them.
- Update panel-opening buttons and hardcoded layout IDs through compatibility routing; independently audit mods before changing them.

## Implementation dependencies and release acceptance

Every work item below belongs to the same release. The release is complete only when all work items and acceptance checks pass.

| Development step | Work | Required evidence |
| --- | --- | --- |
| Host audit and interaction prototype | Locate actual model/render/bridge code; prototype stable side groups and nested stack/column composition in a new layout; establish lifecycle and Core constraints | Changes above Files switches to full-group Context and back without changing other rectangles; constraints resolved for the complete implementation |
| Model and composition operations | Stable identities, validation, registry, operations, independent groups in all outer zones, accordion resizing, persistence, undo/redo | Every supported composition can be made through menus and keyboard commands and survives restart |
| Dragging and resizing | Host-owned grips, group/view/section payloads, drop previews, cancellation, empty zones, cross-zone moves | Same results as menu operations; no state/process loss; sole panels can move into empty zones |
| Center and floating integration | Center mod and terminal transfer, collapsible terminal sections, floating resize/redock, keyboard focus/context, pinning and supported duplication | Move the same Context instance side → center → float → side; preserve draft; terminal move/collapse preserves address/process |
| Migration and complete verification | Legacy mod routes, fresh backup/import, export/import, small-window behavior, recovery, activity navigation, maximize/restore, native checks | Upgrade/rollback and all required workflows verified with existing mods and custom layouts |

Implement shared composition operations before connecting input methods to them. Resolve lifecycle and cross-machine transfer constraints during the host audit, then implement the complete supported transfer behavior. No partial composition milestone substitutes for the complete release acceptance criteria.

Meaningful automated coverage:

- Moving a section, whole view, or whole group preserves each instance exactly once; invalid/self-descendant targets roll back.
- Alternative-view selection preserves inactive composition, weights, drafts, collapse state, and neighboring rectangles.
- Multiple stable side groups retain independent selections across center tab/space changes.
- Collapse/expand, narrow windows, all-collapsed state, and minimum-size constraints yield usable layouts.
- Hide/move/select never kills terminals or executes mod commands. Explicit terminal close remains separate.
- Revision conflicts, failed cross-domain transfers, missing mods, restart recovery, migration, and round-trip export retain identity and state.

Native/live verification:

1. Put Changes above Files in Code; select Context; return to Code. Observe unchanged side-zone width, adjacent group, and terminal geometry.
2. Place Spaces/Agents in another group on the same side. Switch each group's view independently.
3. Resize both side zones and group dividers; switch center tabs/spaces; restart; check persistence.
4. Drag Files between groups and zones, then undo; confirm no duplicate copy.
5. Type an unsaved Context draft; move it repeatedly, including floating; check draft, focus, and target.
6. Move a running terminal; check Core address and process identity before/after. Switch/hide views without killing it.
7. Cancel a drag, disconnect a remote machine mid-transfer, shrink the window, and restore a missing mod. Confirm explicit recovery.
8. Import a copy of the current custom layout and return to the untouched original. Run host native build/checks and appropriate mod checks before reporting implementation complete.
9. Enable top/bottom zones, dock groups into each, resize them, hide/reveal them, and restart. Confirm saved arrangements and unaffected neighboring regions.
10. Collapse and expand a running terminal section, switch its view, float and redock it. Verify process identity, buffer continuity, dimensions, and keyboard routing.
11. Reproduce drag operations with menus and keyboard commands; undo/redo moves and grouping; reveal moved views through the activity rail without creating duplicates.
12. Pin Context to a checkout, move it, and switch center context. Verify the pinned target remains correct. Duplicate a supported panel and verify independent view state; unsupported duplication must be unavailable.
13. Maximize and restore a group; export/import its workspace arrangement; verify all group selections, proportions, collapsed sections, pinned bindings, and mod props survive.

## First implementation task

Obtain the host source checkout and audit its existing layout trees, pane drag handling, mod-instance keys, focus routing, and Core document commands. Build a separate native prototype proving stable left/right zones with two independent groups, Code containing collapsible Changes/Files, and Context replacing Code within only its group. Do not start by rewriting each mod's UI.
