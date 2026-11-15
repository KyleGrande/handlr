# herdr-app: drive the person's window

Herdr shows spaces, tabs and panes. herdr-core (`hc`) runs their terminals
and keeps them alive when the window closes. Use `herdr-app` only to change
what the person sees. For starting, reading, messaging, waiting on or cleaning
up agents and programs, read `hc --skill` and use hc.
Your terminal address is `$HC_TERMINAL_ID`; it is not a pane ID.

## Inspect before acting

The opt-in panel-workspace development feature uses `workspace.activate`,
`workspace.inspect`, `workspace.apply`, `workspace.undo`, `workspace.redo`,
`workspace.export` and `workspace.import`. Read the installed AGENTS.md's local
workspace section for schemas and current limitations. It is not the complete
docking release. Do not test it by switching the person's production window;
use an isolated app home and Core session.

`workspace.float {panel?, group?}` moves a mod panel into a resizable native
window while keeping its existing live copy. `workspace.dock {panel?, group?,
edge?}` returns it to its dock. Closing that window also redocks it. On macOS,
Cmd+Option+F floats the last clicked panel; adding Shift returns it to its dock.
Cmd+Option+Z and Cmd+Option+Shift+Z undo and redo workspace changes. Their
`expected_revision` argument is optional for interactive use.

```sh
herdr-app ls          # spaces > tabs > terminals, including pane IDs
herdr-app status      # current layout, focus, overlays, zoom and file/mod errors
herdr-app commands    # available commands, arguments and descriptions
```

`ls` and `status` talk to the running window, not a new app. `commands`
prints the built-in command list even without an open window. Do not launch bare
`herdr-app` to inspect it: that opens or raises the window. Do not stop,
signal or restart the person's app or core. A window closing does not kill
its terminals.

`app.check_updates` checks for newer releases. Settings reports "Up to date"
only after a successful check; on failure, check the connection and retry.
Package-managed cores are checked but updated through their package manager.
Dismiss a core update error with its × or `overlay.close {id:"core-update-error"}`;
it stays dismissed until the error changes or the update recovers.

Handlr's Settings > Machines includes `core_session` in settings.json:
`"own"` for its separate session, `"shared"` for Herdr's default session.
Changes apply on the next app launch; do not stop or restart either Core.
Handlr's app home and panel layout remain separate. A custom machine transport
can expose the separate session in Herdr for access to both.

## Show something when asked

New spaces and tabs are shown immediately: only create them when asked.
To start one the person will look at later without moving them there, pass
`--focus false`:

```sh
herdr-app do space.new --name eng-123 --folder ~/code/app/eng-123 --argv '["claude"]' --task "Implement ENG-123" --focus false
```

Pick an explicit, useful name for every new space and tab; don't rely on
default names. Use IDs from `ls` rather than guessing or acting on the wrong
focused pane.

```sh
herdr-app do space.new --name api --folder /path/to/api
herdr-app do tab.new --name "fix login" --argv '["claude"]' --task "Look at the login bug"
herdr-app do pane.split --direction right --pane p12
herdr-app do agent.focus --terminal t7
```

For a remote space:

```sh
herdr-app do space.new --name "remote api" --machine vps --folder /srv/api
```

The folder is on that machine; tabs and splits in the space stay there.
New-space keys and clicks follow the focused space's machine. Script commands
without `--machine` still use this computer; `--machine ''` explicitly chooses it.
The agent menu checks and starts agents in the remote Unix user's
login/interactive shell (sh, bash, zsh, dash, ksh or fish), including its
configured PATH. Other shells keep the sh launcher.
`terminal.open --folder /path --place down` starts the split in that folder,
including when `--argv` supplies a program. Without `--folder`, it follows the
focused terminal's folder. If an inherited local folder was deleted, new spaces,
tabs and splits retry in that machine's home. An explicit invalid folder
still fails.
`hc machine ls` lists machines. Use `hc run --on vps ...`, `hc exec --on vps ...`
and `hc file ... --on vps ...` for remote work, not your local file tools.

`do` accepts `--key value` arguments (JSON for arrays/objects) or one JSON
object. Unknown argument names fail and list valid names. Target IDs (`id`,
`pane`, `space`, `target`, `terminal`) must be strings; other non-null types fail before
the current-target default can apply. Null keeps its omitted-argument meaning.
Use `commands` to confirm the command's exact shape:

```sh
herdr-app do pane.split '{"direction":"right","pane":"p12"}'
```

`pane.swap {pane?, direction | target}` trades the places of `pane` (default:
the focused one) and its neighbor in a direction, or `target`, another pane of
the same tab. Give `direction` or `target`, not both. Focus stays with the same pane:

```sh
herdr-app do pane.swap '{"pane":"p12","target":"p14"}'
```

`terminal.select_all {terminal?}` selects a terminal's whole screen and scrollback,
ready for `terminal.copy`. Without a target it follows keyboard focus. In vim and
other alternate-screen apps, it selects only that screen. Cmd+A runs it on macOS;
Linux and Windows have no default, so Ctrl+A stays with the shell.

`terminal.select {terminal?, at?: {row, col} | "cursor", mode?: "cell" | "word" | "line"}`
replaces the selection, at the program cursor by default. Cells are zero-based; rows
count from the oldest retained history through the active screen. Word and line
match double/triple click. `terminal.adjust_selection {terminal?, direction}` moves
the inclusive moving end and follows it in the view: left, right, up, down, page_up,
page_down, home, end, line_start, line_end. It fails without a selection.
`terminal.clear_selection {terminal?}` clears it; `terminal.copy` copies the focused terminal's selection.
These add no default keys or built-in copy mode. Mods read the inclusive selection
endpoints from `focused().selection` or `terminals()`; null means none (or no
attached view). Use `selection.end` as a copy-mode cursor. Selection facts update
when the selection changes, without refreshing readers on ordinary terminal output.

`terminal.search` opens a find bar in the focused terminal. It searches that
terminal's screen and scrollback; Enter and Shift-Enter move between matches,
Escape closes the bar while its find field has focus, and each terminal keeps its own query (reopening selects it, so typing replaces it).
Clicking the terminal while the bar is open puts typing, including Escape, back in the program; the bar and its matches stay.

It prints the created IDs (for example `{ "pane": "...", "terminal": "..." }`)
or `{ "error": "..." }` and exits 1. Read the result, then inspect `ls` or
`status` to confirm. Commands invoked by an agent never open a missing-argument
dialog: supply all required arguments. A successful launch reply means the
terminal was created, not that its program started correctly. If it exits
with a nonzero code within two seconds, the window shows an error toast with
the exit code and last output lines.

A terminal started with hc opts into the window with `herdr.space=<id>`.
`herdr.tab=<id>` chooses its tab; without it, Herdr creates a tab in that space.
Unlabeled workers stay hidden. Do not add labels just to run a background
worker. Use app commands when the
user wants to see a new tab or split, hc for orchestration that need not change
the screen.

## Move local workspace panels

Native dock visibility is saved with the workspace. `layout.hide`,
`layout.show` and `layout.toggle` accept `@workspace/zone/<edge>`; opening a
panel through `workspace.open` reveals its dock without resetting other docks.
Dropping a panel back into the same position leaves the layout unchanged.

Handlr development checkouts provide `handlr/scripts/dev-build-status.mjs` and
`cd handlr && npm run dev:tools` to configure build status and explicit Rebuild & reopen / Reopen buttons in
Rigs. The status distinguishes changed build inputs from a current installation
that needs reopening. Builds and relaunches run only on explicit action.

In an opt-in panel workspace, drag the centered six-dot grip in a section header to move that
section. Drag a view tab to move the view, or the centered six-dot grip in the tab
row to move the whole group. A translucent area highlight shows the panel's resulting
position and size, including its share of an occupied dock. Window
edges accept new groups, including hidden top/bottom zones. Horizontal drops
show separate **full width** and **center** targets: the outer target spans the
window, while the inner target only spans the terminal column and preserves the
side panes' full height. Engine edge values are `top`/`bottom` for full width and
`top_center`/`bottom_center` for center-only docks. Dropping a section
on a view tab inserts it there; dropping a group on a view tab merges its views.
To make a Tab Group from standalone or stacked panels, drag a section's grip
onto the **+ Tab Group** target beside another panel's title. Those two panels
become separate tabs; other stacked panels stay in their existing views.
Cmd+Shift+P → **Create Tab Group…** offers the same operation: choose the first
panel, then the second. Escape cancels. Grouping is one undoable workspace
transaction and persists across restart.
Hover a panel header for float/redock, expand/restore and close buttons on the right.
Mod actions sit beside the title on the left and appear on hover.
Double-click its title or a view tab to rename; Enter saves, Escape cancels.
Files and Changes share their original title row with these controls. Single-view
groups omit redundant labels, selected tabs have no filled background, and there
are no collapse controls. Closing a panel retains its instance and data.
Expand enlarges the current view; restore returns to the dock arrangement.
Escape cancels dragging. These moves preserve registered panel instances and persist via
the workspace transaction engine. Terminal panes remain in their Core tabs;
terminal-to-dock and floating transfers are not connected yet.

## Customize layouts, keys, or mods

First read `~/.config/herdr-app/AGENTS.md` (or `$HERDR_APP_HOME/AGENTS.md` if
set). It is the installed guide to settings, layouts, commands and mods.
Read the generated `.d.ts` files beside it for full API details; do not edit
those files or the generated guide. The app rewrites them on start.

- `terminal_line_height` (default 1, 0.8..2) adjusts terminal rows;
  `terminal_cell_width` (default 1, 0.8..2) adjusts terminal columns;
  `terminal_scroll_speed` (default 1, 0.1..5) adjusts wheel and trackpad
  scrolling, including mouse reports. Set them in settings.json or the
  layout's look; the layout wins.
- Home defaults to `~/.config/herdr-app`; `HERDR_APP_HOME` selects another.
- `worktrees.directory` in settings.json sets the shipped New worktree destination,
  e.g. `{"worktrees":{"directory":"~/Developer/worktrees"}}`. Default:
  `~/.herdr/worktrees`; checkouts use `<directory>/<repo>/<branch>` (slashes in
  branches become dashes). Use an absolute path or `~` / `~/...`, resolved on the
  space's machine. Read on dialog open; existing checkouts stay put. No clones
  needed, and the app does not read the TUI's config.toml.
- Mods live in `mods/<name>/` with `main.js` and optional `mod.json`.
  They are trusted JavaScript with command and network access.
  `"focusable": true` in `mod.json` lets `pane.go` move onto a copy; it receives
  `"focus"` from `nextCommand()` and focuses its own keyboard handle.
- A mod's `watchFolder(dir)` promise has `cancel()`; cancel it when the folder
  is no longer shown. It resolves with `[]` and releases only that call.
- Editing a bundled mod makes its active copy user-owned; startup keeps it
  in place. Use `mod.clone` only for an additional independent variant.
  Shipped layouts still use `layout.clone` for a personal copy.
  Discover required arguments with `herdr-app commands`.
- Save to reload. A broken save keeps the old version running and reports
  an error in `status`; a still-working screen is not proof the edit worked.
- Make only the requested change. Don't touch unrelated mods or settings.
- Use theme colors. Do not retain a mod's `cx` across callbacks; each
  callback receives its own. Native animations, not redraw timers, keep
  the window cheap to run. Root `on_size_change((size, cx) => …)` reports
  logical pixels after layout, including resizes without pointer movement.
  Optional `View.close(cx)` gets one bounded final call; start cleanup there,
  not in an earlier task. The installed guide explains its 250 ms quit budget
  and which cleanup commands go out before shutdown.

After every mod change:

```sh
herdr-app check ~/.config/herdr-app/mods/<name>
herdr-app status
herdr-app shot /tmp/mod.png   # then look at the picture
```

`check` loads the mod and renders it once. It exits nonzero with the exact
error. Its shared state starts empty and stays in memory; it leaves shared.json
untouched. Never call a mod done without a passing check. Then confirm it is
shown correctly in the running window with `shot`; don't claim a visual
check you haven't made.

`herdr-app shot [file.png]` saves the window's last frame and prints its
absolute path (default: `herdr-shot.png` in your current folder). It is the
app's own rendering at full pixel size: terminals, images, overlays and
floats included, even when the window is covered or minimized. No screen
capture or permissions. It needs a running window that has drawn a frame;
`HERDR_APP_HOME` selects the window, as for `status`.

## Problems and safety

If Herdr misbehaves, `herdr-app feedback "<what happened>"` drafts a report.
The person reviews and sends it; it does not silently send feedback.

Never experiment with pointer/key automation on the person's real display.
When developing the app on Linux, its `scripts/sandbox` provides an isolated
home, core and display: `up`, `do`, `status`, `shot`, then `down` when done.
Never stop a server or session you didn't start.

In a panel workspace, use `do workspace.open '{"name":"files"}'` to add or reveal a panel. Cmd+Shift+P lists Open entries for installed panels and declared overlays; Cmd+P is the go-to picker. Reopening preserves the panel identity and saved state.

`workspace.reveal {panel}` goes to an already placed panel; Cmd+P includes those panels by title and does not reopen closed ones.

Closed workspace panels remember their last dock, group/view, order and size across restart. `workspace.open` restores that placement before falling back to the mod default.

Settings → Look → Seamless removes panel outlines and blends panel layers into the
app background, preserving the app canvas and terminal background colors.
Panel shells and title rows use the `surface` color so seamless mode clears
their own fills as well as the surrounding frame.
The Settings mod manages this color preset and restores previous colors when disabled.
Settings → Look → Glass adds an opt-in frosted finish on macOS layouts using the
bundled tabs panel, including Handlr. Bundled layouts open as personal copies.
Glass follows the selected theme, keeps terminals opaque, and restores only its
own overrides when disabled. It is mutually exclusive with Seamless in Settings.
The Settings/tabs mods own per-layout preference and restoration in `glass.json`;
do not edit that journal while enabled. Reduced transparency or a failed native
accessibility query selects opaque fills (checked at most every fifteen seconds).
In macOS fullscreen, content uses the height normally reserved for window buttons.

In macOS panel workspaces, left/top/bottom/right controls sit on the window-button
row, moving into the terminal tab bar only in fullscreen. They hide and restore
docked panels without closing them or changing sizes or placement. Top/bottom
include the center-only docks. **Terminal only** hides all docked panels;
**Restore panels** restores the previous visibility. The Tabs mod remembers
this per layout across restart. Detached floating windows stay independent.
Settings → Look → **Hide panel buttons** hides the dock and terminal-only controls
in both locations, preserving panel visibility and the restore snapshot.

For panel workspaces, `no_headers: true` in settings.json (Settings → Look → No Headers)
hides title rows and their controls in docked and floating panels. Group tabs remain;
turn the setting off to restore headers and drag handles. This changes presentation
only and preserves saved panel collapse state.

Dragging an active panel-group tab temporarily reveals a neighboring tab.
Drop on **Stack Panels** beside its panel title to show both panels together,
or **New Pane** to detach the dragged tab into its own pane. Dropping on a
tab label still keeps/reorders tabs. Escape cancels and restores the original
visible tab; stacking and detaching are saved as undoable workspace changes.

Dragging the only panel in the active tab also temporarily reveals a neighboring
tab. Drop the panel into that visible stack or elsewhere; Escape restores the
original tab. Dragging one panel out of a multi-panel stack keeps that tab shown.

The command palette hides unused automatic `<shipped-mod>-edited[-N]` backups.
Backups already registered in the workspace remain openable. When multiple
mods share a display title, Open entries distinguish Built-in and Personal
versions (and identify individual copies when needed); the underlying mod IDs
and workspace bindings remain unchanged.

## Bundled panel updates

`mod.update` opens Review Panel Updates. Customized bundled panels remain active
under the same mod/panel IDs. The latest app-provided files are separate under
`app-provided/mods/`. A later bundled content change offers Keep Mine, manual
side-by-side review/merge, or Use Update. Keep Mine dismisses that update only;
a later content change is offered again. Use Update replaces the user version
and returns the mod to app ownership. Its arguments are `name`, `action`
(`review`, `keep`, `use`), `version` and `user_version`; use the UI's current
fingerprints for destructive replacement, which rejects stale reviews or new
external edits. No automatic `-edited` mod clones are made.

Drag a panel from a stack onto an existing panel-group tab label to add it as
its own tab. Drop near the outside edges of a pane to insert a separate pane:
left/right in top and bottom docks, above/below in side docks. The outer top
and bottom window bands insert at the pointer's horizontal position, so a
right-hand pane can be moved before the left-hand pane. These moves support undo.

While dragging, the outer dock drop bands span 40px on all four sides,
center-only top/bottom bands span 96px, and neighboring pane insertion bands
span up to 48px. Dock guides appear only during the drag.
