# Native host audit and approval scope

Baseline audit recorded 2026-11-12. Implementation has since continued at the
user's explicit instruction. See [../IMPLEMENTATION.md](../IMPLEMENTATION.md)
for current changes, installed toolchains, tests and build blockers. Findings
below describe the initial audit snapshot.

Source: `https://github.com/herdrdev/herdr-app`, checked out in `../host`,
commit `ce0fd1b245a7fdaa4e6c9e3c7ddac23ddbb1e799`, version 0.1.15.
The checkout is shallow; its Ghostty submodule is not initialized.

## Maintainer decision required

`host/AGENTS.md`, “Before you grow the app's core: ask Can”, says:

> Before adding anything to it, answer these three, then discuss with Can and wait for his go

The three answers for the full workspace engine are:

1. **Yes, the app acts on it.** Placement, ownership, terminal dimensions, focus,
   and instance lifetime affect host behavior, not just presentation.
2. **Yes, only the app sees some transitions.** Layout reload, disappearing owners,
   remote document replacement, and process/display detachment occur outside mod control.
3. **Yes, mods cannot implement it correctly with current APIs.** Mods cannot reparent
   live host entities, atomically transfer Core-owned panes, or extend native drop targets.

Requested approval is for the complete scope in `../PLAN.md`: a host-owned panel
registry and composition model; validated atomic mutations and history; all five
zones and the center; universal section/view/group drag targets; resizing and
redocking floating windows; terminal-preserving presentation changes; focus and
binding separation; capability-controlled duplication; a versioned local workspace
document with migration, import/export and recovery; and compatibility routing in
the bridge and affected mods. Existing layouts remain supported, with opt-in activation.
No new Core RPC is assumed. Any required Core extension needs a separate maintainer
decision under the same rule.

No maintainer approval is recorded in this workspace. No message or PR was sent.
The user subsequently directed continued local implementation; this is not
represented as maintainer approval or an upstream release.

## Findings and integration points

| Concern | Source | Finding and implementation consequence |
| --- | --- | --- |
| Tree model | `host/src/layout.rs`, `Content`, `Kind`, `Node` | Native row/column/stack composition already exists. Terminal content and active-tab content are separate variants. Keep the center's Core-owned split tree separate from local side layout preferences. |
| Native rendering | `host/src/window.rs`, `render_node`, `builtin_tabs`, `separator` | Reuse split boundaries and stack selection. A column under one stack child can hold Changes and Files while another child contains Context. Existing stack tabs select an explicit child. |
| Mod lifetime | `host/src/window.rs`, `copies`, `owned_mods`, `sync`, `remove_copy` | Runtime copies are keyed by slot ID. Hidden nodes and inactive views keep existing copies alive; only visible slots start copies. Removing a slot or changing its mod/props invokes close and reload. A layout switch also discards layout-owned copies. Preserve slot/instance identity through moves and commit once before reconciliation. |
| Persistent mod state | `host/src/mods.rs`, `Instance::key`, `prepare_load` | localStorage uses `data/<mod>/store.json` when props are null, otherwise a hash of serialized props. It is not keyed by slot ID. Distinct copies with identical props can share persistent storage. Introduce instance namespaces only with a legacy storage migration and a policy for ambiguous copies. Never inject instance IDs into props as a shortcut. |
| Pane dragging | `host/src/window/pane_drag.rs`, `pane_movable`, `pane_target`; `host/src/model.rs`, `move_pane` | Dragging is limited to another pane in the active, unzoomed, multi-pane tab. The middle swaps; outer quarters split. It cannot move a sole panel, target an empty side zone, or express section/view/group semantics. Extend hit testing only after shared composition operations exist. |
| Focus | `host/src/window.rs`, `render_slot`, `restore_focus`, `publish`, `focused_block` | Mod panes participate in model pane focus; layout blocks defer focus back to the pane unless a focusable control takes it. Keyboard focus, work context, and panel binding need separate handling for a moved Context editor. |
| Terminal presentation | `host/src/window.rs`, `sync`; `host/src/window/pane_size.rs` | Terminal views are reconciled by visible slots; disappearing displays detach. This is not an explicit process kill, but it is not proof of buffer/selection/size continuity for new transfers. Capture address, process identity, buffer and delivered dimensions in native transfer/collapse tests. |
| Floating surfaces | `host/src/window/movable.rs`; `host/src/window/floats.rs` | Overlay windows and layout edge floats are different mechanisms. Dragging/position persistence exists; universal resize and redock integration must be implemented. Opening a new overlay with a mod name alone does not transfer its existing runtime entity. |
| Core documents | `host/src/mirror.rs`, `Document::capture`, `Document::replace`; `host/src/mirror_sync.rs`, `round_timeout` | `doc.get` returns a version; `doc.set` takes the expected version. Conflicts read the accepted document. Existing synchronization flushes latest state per machine, without an operation queue. |
| Conflict behavior | `host/src/window.rs`, `documents_updated` | Conflicts replace the machine projection and report the conflict. Local workspace mutations need a transfer record and recovery states rather than claiming a two-file transaction is atomic. |
| Local persistence | `host/src/layout_sync.rs`, `State`; `host/src/persist.rs`, `write_atomic` | Click state is separate from authored layout. Atomic local replacement exists. Workspace schema validation, last-known-good recovery, unknown fields, and migration remain work. |
| Tab bar coupling | Installed `mods/tabs/main.js`, `syncPanel`; installed Toolbox routes | The standard bar restores side-panel selection per space using `panel`/`panel-body`. The prototype uses its own minimal center tab bar, so those routes do not control its stable sides. Full release needs registry-based compatibility routes. |

## Transfer constraints

Same-tab pane moves already operate on a cloned tree and preserve addresses.
This does not establish cross-boundary or cross-machine transfer support.
Destination validation must finish before source detachment. Stage the destination,
record source and destination revisions and bindings, perform version-checked Core
reference changes, then publish local composition. Recover after restart using the
record and actual accepted versions. A conflict or unavailable destination must
retain or restore the source. The exact protocol and failure cases must be
implemented and verified; the current source offers no cross-store transaction.
Reject incompatible machine ownership instead of moving the PTY or launching a replacement.

## Prototype and evidence

`../prototype/layouts/panel-workspace-prototype.json` uses the existing native
renderer and a new personal control mod. It provides:

- Independently selected Code/Context and Spaces/Agents groups on the left.
- Separate Toolbox and Rigs groups on the right, with resizable side boundaries.
- Changes above Files in Code, with saved preferred spans and collapsible headers.
- An active-tab center with a minimal tab selector; no terminal creation is triggered by selecting or collapsing a section.

The prototype's headers are mod-owned, and collapse sends two existing host
commands. This deliberately does not stand in for the required atomic engine.
It has no universal movement, history, top/bottom docking, terminal sections,
floating transfer, pinning, duplication, activity rail, maximize, workspace
import/export, migration, missing-mod recovery, or complete keyboard/menu support.
It also lacks the required small-window section-stack scrolling behavior.

Validation completed:

- `npm run build`: generated the separate layout.
- `npm test`: seven checks passed for layout references, stable side composition,
  collapse/restore weights, neighboring state, all-collapsed serialized state,
  invalid targets, invalid saved sizes, and retained mod identity/props.
- `herdr-app check <absolute prototype mod path>`: passed initial section render.
- `herdr-app check <absolute .checks/tabs path>`: passed initial tab-bar render.
- `herdr-app status`: active `toolbox-workspace`, no reported errors.

The serialized restart test is an in-memory round trip, not a native restart.
The native checker does not lay out the complete workspace or exercise later
events. No live docking, geometry, terminal, migration, or restart acceptance
check has passed. Existing installed layout and mod files were not changed.

At this baseline, Rust and Zig were absent. Both are now installed and the pinned
Ghostty source is present. Cargo's dependency-download access is the current
build blocker. Live verification still requires an isolated app home/Core session.

## Release status

Every item in `../PLAN.md` remains required. Source acquisition and audit are done;
the prototype is staged and initially checked. Model, operations, persistence and
native adapter implementation has started; see `../IMPLEMENTATION.md`.
The complete native/live release criteria remain open.
