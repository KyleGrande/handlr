# Herdr Toolbox

A native tray of reusable command shortcuts for the selected Space. Give each
tool an icon and command, then run it in a background terminal and peek at its
output without leaving the current work.

![Herdr Toolbox](preview.png)

Preview: cropped native workspace capture from 2026-11-13, showing an empty tray.
This is a visual reference, not evidence that command execution was retested.

## What you see

A Context-style theme-background card: 1px border, 10px radius, 13px text and a
42px title row. The header contains Toolbox, Aa (labels) and +. Tools appear as
icons with optional faint labels, with labels always available on hover.
The original personal layout places the tray above terminals; native workspaces
can dock it elsewhere. An embedded header reserves 82px on the right for host
controls and keeps the center grip clear.

## How it behaves

+ opens Copy agent prompt / Add a tool (manual). Copying the prompt does not
execute it. Aa toggles labels. A tool click runs its captured command; a later
click peeks at output. Right-click offers Edit, Variant and Run again as
applicable. Parameter placeholders such as `{{mode}}` prompt for values that
become individual shell-quoted arguments. Put placeholders outside shell quotes.
A blue ring means running, green success, red failure and a blue dot unavailable
result. Output remains until Enter closes its tab. These are command result
states; agent working/blocked/done/idle states do not trigger tool execution.
Space changes reload tools and never run them. Workspace title double-click
renames; host hover controls handle moving/floating/closing the panel.

## Built from

Strict TypeScript in `mods/toolbox/main.ts`, `model.ts`, `runs.ts`, the
`toolbox-tabs` personal tab bar and `mods/layout.ts`. `npm run build` reads the
installed declarations, emits JavaScript to `dist/mods/` and copies manifests,
SVGs and `AGENT_SETUP.md`. The primary manifest uses `place: "none"` and
`workspace_header: true`; the companion tab bar supplies legacy integration.

Use GPUI builders and `InputState`, not DOM/Node APIs. Host APIs include
`spaces`, `panes`, `terminals`, `shared`, `setShared`, `exec`, `readTextFile`,
`openOverlay`, `closeOverlay`, `layout`, `props`, `appHome`, `run` and optional
`panel`. `toolbar` props render a legacy tray toggle. `view` roles include
`menu`, `tool-menu`, `manual`, `parameters` and `run`; pass the captured entry
and context into dialogs. Terminal actions use Core via `exec` and
`terminal.peek`; workspace title rename uses `workspace.rename`.

The panel reads `<repo>/.herdr/toolbox.json` every five seconds. Manual tools
and result metadata use versioned shared state `toolbox.v1`, keyed by permanent
Core machine identity plus Space ID. Saves reject stale revisions. Run uses
`hc run --bg --no-parent` on the captured machine/folder, with a login environment
and `sh -lc`. Ship the setup guide and artwork with the generated JavaScript.

## Watch out

The panel reads repository files, queries Core, writes shared state and runs
user-selected shell programs. Those commands can access files/network according
to their own behavior. Commands are trusted code; quote parameter values as
data and never run on render or selection. Capture the owner before opening
dialogs so an intervening Space change cannot redirect a save/launch.
Shell aliases/functions, deletion UI, environment editing and Windows execution
are not implemented. Remote launch behavior still needs smoke testing.

`npm run prepare-install` creates review artifacts. The original installer
expects a personal `rigs-workspace` with Context integration and selects a new
Toolbox layout when installed. Do not run it merely to refresh a native
workspace or replace Context/Rigs files. Build output is not a standalone
fresh-install layout. Preserve existing layout choices and shared storage.
Use optional namespace access for `panel()` on older hosts.

## Done when

1. `npm test`, `npm run typecheck` and `npm run check:native` pass, including
   both Toolbox and its companion tab bar, with the intended host declarations.
2. In a personal test layout, inspect native status and a screenshot. Confirm
   +, Aa, tool editing, variants and parameter dialogs work.
3. Explicitly run a harmless disposable command, peek at output, verify its
   result color and repeat it. Selection changes do not run it or redirect edits.
4. Two Spaces on one checkout retain separate manual tools; stale saves fail.
   Repository tools appear within five seconds without executing automatically.
