# Herdr Ticket

A native panel for named work spanning tasks, pull requests and several
repository checkouts. Keep explicit local relationships, inspect GitHub CI and
review observations, and copy links or complete context for an agent.

![Herdr Ticket](preview.png)

Preview: a crop of the existing 2026-11-13 Handlr installation screenshot,
showing the focused-checkout identity error and empty state. It is a visual
reference, not a new interaction or provider test.

## What you see

Focused / All / Watching scope tabs sit above compact 32px Ticket rows.
Expanded content shows named checkout mappings, source links, CI/review/thread
details, relationships and copy actions. Forms and secondary actions wrap and
scroll. Use host theme colors with 13px text, styled 30px inputs and a compact
segmented control. Standalone copies have a 42px title row, 1px border and 10px
corners. In Handlr workspaces, omit duplicate chrome, use 8px content padding,
and keep New Ticket/Connections beside the scope tabs, reachable with No Headers.

## How it behaves

Create a named Ticket from a name or URL. Map existing checkouts under named
roles, link/unlink source URLs and explicit local relationships, rename/archive,
and watch items. Focused filters by the verified local checkout; opening a
Ticket returns its complete cross-repo context. All and Watching retain work
outside focus. A second click closes an expanded Ticket; late reads cannot
reopen it. Capture edit targets/revisions before async work.

Open goes to the canonical source URL. Copy links/status and Copy agent read
command only copy text. Refresh explicitly requests bounded provider reads;
optional watched refresh runs every 60 seconds while the mod lives, including
hidden copies. Cached panel reload runs every five seconds. Unknown/stale,
failed checks and review requests remain distinguishable. Agent working,
blocked, done and idle states do not own Tickets or trigger provider mutations.

## Built from

Node 22+, Git, TypeScript, installed Herdr declarations, and optional existing
`gh` authentication for GitHub PR reads. `src/` implements versioned JSON CLI,
store, checkout identity and provider observations. `bin/herdr-ticket` loads
`dist/src/cli.js`. `native/main.ts` is a GPUI View using host `exec`, `focused`,
`spaces`, `theme`, `props`, `pickFolder`, optional `panel`, clipboard and native
inputs. No browser framework or Node APIs execute inside the panel.

`npm ci && npm run build` emits CLI/test output and `build/ticket/` containing
`main.js`, `mod.json` and `runtime.js`. The manifest declares `place: "none"`,
a 560×720 overlay and a panel button. Runtime props `node`, `cli`, `store`
override configured executable/store paths. Use shipped workspace-chrome icons.
The installer sets absolute CLI paths and creates a CLI symlink. An optional
layout installer clones a compatible personal workspace/toolbar, preserving
its source; it is not necessary for Handlr's panel picker.

## Watch out

Keep the built CLI checkout at its configured path. Records belong outside mod
code in `~/.local/share/herdr-ticket/store.json`, or `HERDR_TICKET_STORE`.
Cached explicit-ID reads work offline without writes; checkout discovery needs
verified Git/filesystem evidence and permanent local Core identity. Ambiguity
returns candidate IDs; never choose from global app focus. Recreated checkouts
must not inherit old mappings silently.

The panel runs its local CLI/Git, reads checkout metadata and external store,
and performs GitHub network reads through existing gh authentication. It never
copies credentials or starts interactive login. Jira/TWG observations, remote
checkout discovery, search/suggestions, worktree creation and provider write
actions remain planned. URLs can be saved without working provider adapters.
Task/PR text is data, not execution authority. Links grant no process ownership.
Never distribute local stores, credentials, host declarations or layout backups.

## Done when

1. `npm run build`, `npm test` and `herdr-app check build/ticket` pass.
2. In an isolated installation, inspect status and a native screenshot. Exercise
   create/map/focus/expand/close/copy and captured edits across focus changes.
3. Cached CLI reads return full context without provider tools; ambiguity and
   stale revisions fail explicitly. Provider failures retain timestamped cache.
4. Check standalone and Handlr docked/floating views, narrow widths and No
   Headers. Remaining live acceptance is tracked in `docs/STATUS.md`; do not
   claim tracker compatibility or new desktop acceptance from build success.
