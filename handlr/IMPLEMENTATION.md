# Implementation status — 2026-11-13

The user instructed continued local implementation after the source audit and
authorized obtaining Rust and Zig. No maintainer approval, upstream PR or release
is claimed. The complete release scope in PLAN.md is unchanged.

## Compiled implementation

`host/crates/panel-workspace` contains the shared Rust engine, without GPU, Core
or process dependencies. It implements:

- Stable identities, unique placement, reference/selection validation, positive
  finite weights, valid instance namespaces and typed ownership without cycles.
- Revision-checked draft transactions that validate and commit once. Errors leave
  the document, revision and history intact. Empty views/groups are normalized.
- Section/view/group movement and reordering across independent outer zones;
  collapse weights and minimum allocation with a required scroll extent.
- Hide/reopen/reveal without deleting registration; focus-reference repair.
- Binding metadata separate from props/location; explicit duplication with distinct
  namespaces and terminal duplication rejection. Floating bounds and redocking
  are modeled, but not yet rendered by the native adapter.
- Bounded session undo/redo, versioned import/export, extension-field preservation
  on composition objects, and validation before importing.
- Atomic primary-file replacement, validated last-good rotation, corrupt-primary
  preservation and recovery. Invalid primary and backup data produce an error.
  This is local persistence, not a transaction with Core. External-writer CAS and
  locking are not implemented.

`host/src/workspace.rs` compiles against the actual native layout parser in the
offline harness. It projects docked groups around an unchanged center tree,
using panel IDs as body slots. Empty/hidden zones take no space. Persistent
sessions save candidates before publishing; failed writes leave state/history
intact. Projection rejects collisions with host/center identities.

## Built native integration

The new window module and small hooks in the existing host provide:

- `workspace.activate`, `workspace.inspect`, `workspace.apply`, `workspace.undo`,
  `workspace.redo`, `workspace.export` and `workspace.import` in the command table.
- An explicit `workspace` document name on a personal layout root. Documents live
  in `workspaces/<name>.json`; activation preserves unrelated/shipped layouts.
- Host-owned collapse/hide headers, native stack selection through the shared
  engine, settled divider-size persistence, and last-good authored-layout handling.
- Registry ownership of hidden panel copies and stable body slots during moves.
- Optional instance storage in `Instance`/`prepare_load`. Legacy instances retain
  their mod/props-derived paths. Moving/binding never modifies props. Installed
  `multiple_instances` capability is checked for new multiple instances.

**The full GPUI/window integration now builds and runs in an isolated app.**
Its initial layout was visually verified through the app frame capture API.
Live collapse/undo and view selection/undo command smoke checks passed and
restored the original document. The native adapter rejects
terminal registrations and floating placements before commit because their
ownership/rendering integration remains unfinished. Binding commands record
metadata only; delivery of pinned context to mods is not implemented yet.

## Verification

- Rust 1.100.0, Cargo 1.100.0, rustfmt/Clippy and Zig 0.16.0 installed locally.
  Zig's standard-library compile/link and executable smoke run succeeded.
- `npm run test:rust`: **33 passed** — 13 composition tests and 20 tests covering
  the real native parser, real command table/guide consistency, generated native
  document, projection/identity checks and failed-save rollback.
- `npm test`: **7 passed** for the original prototype.
- Locked, offline Cargo metadata accepts the native workspace and updated lock
  file. This checks metadata, not dependency builds.
- Modified existing window/mod files parse through rustfmt. New files are
  formatted; unrelated original formatting was retained. `git diff --check` passes.
- The original prototype's two initial native control-render checks passed in
  the audit turn. They do not verify the new GPUI integration.

Offline checks compile the actual source files using upstream dependencies pinned
in `scripts/rust-check-sources.json`. Temporary manifests enable the required
engine dependency features, excluding GPU libraries and window integration.

## Resolved dependency blocker (earlier attempts)

Earlier, normal Cargo testing failed while fetching `longbridge/quickjs-jit` because the
Cargo process cannot resolve github.com in the restricted environment. The
stdlib dependency requires revision `605da483611a3548edb8c33fdff602e3f5f42076`;
the shell also references `96593cd7a54440ac060a391b8baea7e9a3cf1393`.
Installing the compilers resolved that prerequisite but initially did not grant
Cargo dependency-download access. Network permissions have since been enabled;
Cargo downloaded dependencies and the full desktop build succeeded.

### Launch attempt and available preview

On the user's request to run it, the pinned QuickJS, QuickJS C submodule and
LLRT sources were obtained through the available GitHub connection and populated
into the local Cargo Git cache. The build then advanced beyond those sources but initially failed downloading
crates.io `config.json`. That DNS restriction is now resolved.

As a limited, runnable preview, a copy of the installed Herdr 0.1.15 app was
prepared at `.checks/HerdrWorkspacePreview.app` with a distinct bundle identifier
and separate app home, Core session/socket, XDG state/config/runtime paths under
`.checks/preview/`. The original layout prototype and copies of Context, Toolbox
and Rigs were staged there with fresh persistent data. Computer Use's application
inventory confirmed **Herdr Workspace Preview** running. The preview produced its
own window state and sockets; its selected layout setting is the prototype.
Screen capture initially failed. Its frame has since been inspected, showing
the prototype behind a welcome dialog. The full native engine is not included
in that older preview; use the newly built app described below.

## Successful native launch and verification

The modified debug build is running as **Herdr Workspace Native**, at
`.checks/HerdrWorkspaceNative.app`, with a separate bundle identifier, app home,
Core session/socket and XDG paths under `.checks/native/`. Copies of Context,
Toolbox and Rigs use fresh data. The production app was not changed or restarted.

- The complete desktop build succeeded. The lockfile includes the shared crate;
  no existing dependency versions were changed.
- `cargo test --locked --workspace --manifest-path host/Cargo.toml --lib --bins`:
  **455 host tests passed, two ignored** for explicit environment prerequisites.
- `cargo test --locked --manifest-path host/Cargo.toml -p panel-workspace`:
  **33 passed** using the regular Cargo dependency graph.
- Native `status` reports `panel-workspace-native`, with no overlays or errors.
- `.checks/native/workspace.png` was visually inspected: Code/Context and
  Spaces/Agents on the left, Toolbox and Rigs on the right, empty test center.
- Live `workspace.apply` collapse and view selection, each followed by
  `workspace.undo`, passed and restored the exact original document. Evidence
  is saved in `.checks/native/smoke.json`.

These are initial native smoke checks, not the complete release acceptance suite.
Bun checks and dedicated screenshot integration tests have not run in this retry.

## Docked drag controls — 2026-11-13

The native window now renders section and group grips and draggable view tabs.
Drops show an insertion marker or highlighted destination. Section drops can
reorder or move into other views, including a view selected through its tab.
View tabs reorder or move between groups; whole groups reorder between zones,
and dropping a group on a view tab merges its views. Window-edge bands accept
new groups even where a zone is initially empty or hidden. Escape and dropping
outside valid targets cancel; a conflicting revision rejects the transaction.

The planner emits existing workspace commands, and commits use the existing
preflight, persistence and undo path. The pointer regression test verifies
section reorder, cross-side movement, view-to-empty-zone movement, whole-group
movement, cancellation, disk persistence and retention of the loaded mod ID.
Four new pure planner tests cover index adjustment, cleanup, merge and rollback.
The workspace suite now has 37 passing tests; the host suite has 457 passing
tests and two ignored tests. This does not implement terminal-to-dock or floating
window transfers.

The updated executable was installed in `.checks/HerdrWorkspaceNative.app` and
reopened on the same isolated Core session. The saved composition initially
matched its pre-update backup exactly, but contained no groups (all panels were
hidden). Starter groups were reopened through `workspace.import`, preserving the
existing panel registry and data. Existing terminal tab and focused-pane IDs
survived the restart. The final rendered frame at
`.checks/native/drag-handles.png` visibly shows the section/group grips around
the running terminal. Native `status` reports no host errors. The backup is
`.checks/native/pre-drag-update.json`.

## Terminal-style area previews — 2026-11-13

Docked drag previews now shade the receiving half of a section/group instead
of drawing a thin insertion line, with the same 18% accent fill and outline as
terminal dragging. Dropping on a view tab highlights its whole group. Edge drops
highlight the configured receiving zone extent (capped at half the window).
Drop operations and target selection are unchanged. The pointer regression test
checks the rendered preview bounds, insertion, cancellation and persistence;
it passes. The desktop build also passes. The updated native app uses the same
isolated home/session, with the pre-update arrangement backed up in
`.checks/native/pre-area-preview-update.json`.

## Terminal-style panel headers — 2026-11-13

Section headers now share the terminal header's background, bottom border,
12px medium title, spacing, six-dot centered grip and hover action styling.
The expand/restore and close controls reuse the shipped terminal SVG assets.
Expand uses the existing maximize command for the section's current view/group;
restore returns to the unchanged dock arrangement. Drag grips are suppressed
while expanded, matching terminal behavior. Group grips are also centered and
appear on header hover. Collapse remains on the title at the left.

The pointer regression now clicks expand and restore, checks that the center is
removed/restored and the document is unchanged afterwards, then exercises the
centered grips and area previews through the existing movement/cancellation
checks. No new storage format or ownership operation was introduced.
The updated native app was rebuilt and reopened. Its arrangement matches
`.checks/native/pre-header-update.json` exactly, and native status reports no
host errors. The rendered frame was inspected at
`.checks/native/terminal-style-headers.png`. All 457 host tests pass (two ignored).

## Single-title headers and quick rename — 2026-11-13

The latest user direction removes collapse controls and redundant title rows.
Single-view groups now omit their tab bar. Files and Changes retain their own
original 42px card header, counter/path details and body; native drag, rename,
expand/restore and close controls overlay that row. Their title comes from the
copy-scoped reactive `panel()` reader, without changing mod props or storage.
This avoids the former group-title/host-title/body-title duplication. Other
panels keep a single native control header where the body has no integration.
Selected view tabs no longer have a persistent filled background.

Double-click a panel title or view tab, or use the hover pencil, to open Herdr's
standard selected-text rename prompt. Enter submits and Escape cancels.
`workspace.rename` emits revision-checked `rename_panel`/`rename_view` commands.
Panel labels are extension metadata; view labels use the existing title field.
Names are validated, persisted and undoable. Empty panel names restore defaults.
No identity, content, props, storage namespace or process ownership changes.

The workspace suite has 39 passing tests. Native pointer tests cover rename
submission, exact expand/restore, drag previews, moves and Escape. Description
checks ensure the original Files/Changes header has one custom title and reserves
native control space. A lifecycle test verifies copy-scoped panel metadata stays
reactive and leaves props unchanged. The standalone native mod checks for both
Files and Changes pass.

## Full-width and center-only horizontal docks — 2026-11-13

`top_center` and `bottom_center` are independent destinations in addition to
`left`, `right`, `top` and `bottom`. The projection now places the original Core
center between the two center docks, with the side panes outside that complete
column. Full-width top/bottom docks remain outside the three-column layout.
Each zone retains its own extent, groups and persisted state.

Drag labels distinguish Top/Bottom · full width (outer 24px window bands) from
Top/Bottom · center (inner bands of the central column). Area previews use the
correct horizontal bounds. Older four-zone documents remain valid; missing
center zones are created transactionally on first use and removed by undo if
that restores the original document. Fresh generated documents include all six.

The workspace suite now has 41 passing tests, including legacy load/undo and
layout ancestry. The complete host suite passes 459 tests (two ignored);
all seven JavaScript prototype checks pass. The native app was updated and
reopened on its existing isolated session, retaining panel data and placement.
A backup of the final saved document is at
`.checks/native/center-docks-saved-before-update.json`. Pointer tests drag to all four horizontal destinations and
verify both preview width and rendered side-pane height after commit.

## Mod repository branches for shared headers — 2026-11-13

Separate worktrees at `mod-worktrees/context`, `mod-worktrees/toolbox` and
`mod-worktrees/rigs` use `fix/workspace-shared-headers` in their own repositories.
Original checkouts and their branches are preserved. The mods declare
`workspace_header: true`; the host reads the cached manifest capability and
projects a single shared 42px header. Namespace-based optional `panel()` access
retains the standalone UI on released Herdr versions without that API. Existing
mod-specific header actions remain available beside the workspace controls.
Spaces and Agents adopt the same capability in the host repository.

Context: 25 tests plus native build/check pass. Toolbox: six tests plus panel/tab
bar native checks pass. Rigs: native build and eager state checks pass, including
the workspace header. The Rigs checker now supplies real popup props; its old
missing-props failure was reproduced on the unmodified baseline. No rig services
were started or stopped for these header checks.

## Required remaining release work

1. Run the remaining Bun and dedicated screenshot integration checks. Desktop
   compilation, host unit tests and shared workspace tests now pass.
2. Extend docked drag controls to center/terminal and floating transfers, then
   complete the full drag/drop release acceptance matrix.
3. Complete menus, keyboard navigation/movement, activity rail, hide/reopen UI and
   compatibility routing for existing panel-opening buttons.
4. Connect small-window scrolling/minimum allocation and terminal dimensions to
   native section rendering; verify narrow and multiple-panel cases.
5. Implement center/terminal transfers with revision-checked Core ownership,
   transfer records and recovery. Preserve the live entity, address, PTY, process,
   buffer and selection; failed cross-machine transfers must retain the source.
6. Connect resizable floating windows/redocking, live focus, maximize/restore and
   native undo/redo controls.
7. Deliver pinned context without changing props or redirecting in-flight edits;
   implement legacy storage migration and full duplication verification.
8. Implement fresh-backup legacy migration into a named opt-in layout, custom
   compatibility blocks, missing-mod recovery, export/import UI and restart checks.
9. Run every native/live acceptance check in PLAN.md using an isolated app home
   and Core session. None of those acceptance checks is claimed complete.

All remaining items are part of the same release. This is implementation progress,
not a replacement for the full release criteria. The production app is untouched.

## Shared mod headers verified — 2026-11-13

Created and pushed `fix/workspace-shared-headers` in KyleGrande/herdr-context (724af1f), herdr-toolbox (30d4d75), and herdr-rigs (4a15c41), using isolated worktrees under `mod-worktrees/`. Original checkouts retain their branches and local changes. Deployed branch builds and host manifest-capability support only to Workspace Native. Screenshot `.checks/native/shared-mod-headers.png` confirms all seven visible panels have one title row, including the full Toolbox label. Native status reports no rendering errors. Context has 25 passing tests, Toolbox 6; Rigs passes all 18 eager states; host unit tests 459 passed/2 ignored and shared workspace tests 42 passed. Mod builds and released-host compatibility checks pass. No rig services were started or stopped; broader release acceptance above remains outstanding.

## Default terminal styling and panel palettes — 2026-11-13

The workspace terminal center now derives its tab bar, pane frame, padding, gap and rounding from the shipped default Herdr layout. The preview layout was updated with a backup under `.checks/native/default-terminal-backup-*`; personal layouts are not silently migrated. The standard tab bar only displays legacy Files/Changes toggles when the matching layout panel exists.

Cmd+Shift+P discovers installed openable panels and declared overlay mods through cached manifests, plus registered workspace panels. Panel entries call `workspace.open {name}`: reveal an existing placement or add/reopen it as one undoable transaction without replacing panel identity, props, binding, storage or custom title. New panels use their declared dock edge or the right dock. Helper/header mods are excluded. Cmd+P lists placed panels by display title alongside the existing tab/space navigation, and `workspace.reveal {panel}` never opens a closed panel. Existing key bindings are unchanged.

Verification: 464 host tests passed, two ignored; 45 shared workspace tests passed; desktop build and diff checks passed. The virtual native interaction test selects an Open entry through the palette's real input/Enter flow, verifies close/reopen retains the same live copy, and checks picker props. Native description tests cover custom mod names and filtering. Live screenshot `.checks/native/panel-command-palette.png` shows all seven installed panel entries, with no app rendering errors. The isolated app was updated; the workspace document was preserved. Full release work listed above remains outstanding.

## Remember closed panel placement — 2026-11-13

Closing now stores a panel's last dock/floating placement, group/view identity and order, section identity/order and weights in a backward-compatible `closed_panels` map. The saved snapshots contain empty containers rather than other panels' contents. Reopening uses `restore_panel` before any default placement; surviving views/groups are reused and deleted empty containers are reconstructed. Explicit show placement clears the old record, repeated close retains it, and restore consumes it. Registry identity, props, binding, title and storage remain unchanged. Existing documents without saved placements continue using their default destination.

Verification: 48 shared engine/layout tests pass, including all six dock destinations after serialization/restart, section/tab order, resized weights, repeated close, explicit relocation, and undo/redo. All 464 host tests pass (two ignored); the native palette test now moves the panel into the center bottom dock before closing and confirms reopening keeps that dock and the same live copy. Desktop build and diff checks pass. Installed only into the isolated Workspace Native app, retaining the current workspace composition; backup under `.checks/native/closed-panel-backup-*`.

Preview restart note: macOS requested Documents-folder access after the rebuilt app’s code signature changed. OS TCC logs confirm a pending Documents access prompt; live status verification awaits the user allowing that prompt. The fix, build and automated tests are complete.

The Documents access prompt was resolved during verification. Workspace Native is running again on `panel-workspace-native`; live status reports no rendering errors.

## Scoped local macOS release — 2026-11-13

The user reduced the release scope to the existing docked workspace, native
floating mod windows with resize/redocking, and practical keyboard shortcuts.
This supersedes the earlier requirement to complete every item in the original
plan before producing a local build. Terminal transfers, pinned context, broad
legacy migration and direct dragging between separate OS windows remain future
work. No upstream release, tag, notarization or public distribution is claimed.

Implemented real secondary GPUI windows that render the existing live panel
entities. A panel can detach individually or a group can float as a whole; saved
dock metadata restores the original section/view/order and weights when possible.
Closing a floating native window redocks its contents. Failed saves roll back
placement and close staged windows; mod commands and popups route to the panel's
native window. The floating window survives app quit/restart with its saved
position and content size. Quit does not redock windows. Content size is stored
without adding the native title-bar height on each restart.

Panel headers now expose visible float/redock, rename, expand and close controls.
Native SVGs explicitly set their color. Floating windows have no added toolbar
or Floating panel/Return to dock text. All workspace cards have 8px gutters and
outer padding, minimum group sizes, the terminal pane background, and the same
surrounding canvas. Native floating expand uses the OS window's zoom control.

Mac shortcuts: Cmd+Option+F floats the last clicked panel; adding Shift redocks.
Cmd+Option+Z undoes workspace edits; adding Shift redoes. Cmd+W in a floating
window redocks. Other platforms use Ctrl+Alt for the new workspace shortcuts.

`npm run install:release` now creates an optimized Cargo release build, bundles
licenses and refreshed THIRD-PARTY-NOTICES, signs it locally, creates
`dist/Handlr-macos-arm64.zip`, and installs `~/Applications/Handlr.app`. It retains
the existing isolated workspace home/session under `.checks/native/`; the local
workspace directory must remain available. Existing app installations are backed
up on replacement. The local fork does not enable upstream self-updating.

Verification: the full locked Cargo workspace suite passes, including 469 host
tests (two ignored), 51 composition/native-layout tests, command/guide, notices,
skill and real GPU pixel checks. All 91 Bun mod checks, four docs tests, seven
prototype checks, generated documentation checks and git diff checks pass.
The native floating regression verifies live-copy identity, an unsaved draft,
float/redock, undo/redo, keyboard bindings, close actions and failed-save rollback.
An isolated optimized app was launched on a separate Core session; float/redock
and quit/restart checks passed without host rendering errors. Captured frames
were visually inspected for gutters, backgrounds and visible header icons.
Evidence is in `.checks/floating-*.log`, `.checks/floating-*-smoke.json` and
`.checks/floating-final.png`. The installed app passes strict code-signature
verification. The production Herdr installation was not replaced.

## Core session setting — 2026-11-13

Installed Handlr includes Settings → Machines → Core session, with a switch to
reuse Herdr's existing session or use Handlr's separate session. The setting is
stored as `core_session` (`shared` / `own`) and is frozen at app startup so the
main connection and mod commands cannot target different sessions after a
settings reload. Switching takes effect after quitting and reopening Handlr;
it never stops either Core. Sharing removes the launcher HC_SESSION, HC_SOCKET
and XDG state/config/runtime overrides from subprocesses while preserving
HERDR_APP_HOME and the panel layout. Existing configs keep their launch profile.
The visible helper explains that the separate session can be added as a machine
in Herdr to access both. The release installer preserves the existing private
session paths, including when returning from shared mode.

Validation: three Core profile tests, ten JavaScript checks including both
switch directions, native Settings/Machines materialization check, optimized
release build, and installed bundle signature verification passed.


## Consistent hover headers — 2026-11-13

Removed the dedicated panel rename button; double-click titles and the rename
command remain available. Float/redock, expand/restore and close stay on the
right and appear on header hover. Spaces, Agents, Toolbox and Rigs actions sit
beside their titles on the left and appear on header hover; Files back follows
the same hover behavior. Shared headers reserve an 82px control gutter.

The optimized signed bundle was rebuilt in dist/Handlr.app. Context, Toolbox
and Rigs native builds/checks passed; Toolbox's six tests and the ten prototype
tests passed. The native panel interaction regression passed with
HERDR_TEST_TMPDIR=/tmp. An unrelated shot_pixels integration target could not
initialize macOS services in the sandbox. Personal mod JavaScript was copied
into the isolated runtime, with previous files in .checks/hover-header-backup.
The running app was not restarted; reopen the rebuilt bundle for host changes.
