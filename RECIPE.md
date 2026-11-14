# Herdr Context

A native scratchpad for the selected Space or highlighted agent: choose Space
or Agent, edit tags, then write Markdown. Notes autosave and remain with their
owner as selection changes.

![Herdr Context](preview.png)

Preview: cropped native workspace capture from 2026-11-13, showing the empty
Space scratchpad. It illustrates the panel, not a fresh interaction test.

## What you see

A theme-background card with a 1px border, 10px radius and 13px body text.
The 42px title row says Context (or the workspace panel title). Below it are
28px Space/Agent segments, the selected owner's label, editable tags and one
native Markdown editor. Use theme foreground/muted/border/raised colors;
there are no separate instructions/handoff categories or manual Save button.

## How it behaves

Space follows the selected persistent Space. Agent follows the highlighted
Agents row, not the first running terminal. Working/blocked/done/idle status
does not change note ownership or execute anything; status is shown by Herdr's
Agents mod. Tags and Markdown autosave after a short pause. Cache drafts per
owner, finish pending saves after selection changes, reject stale revisions,
merge independent changes and retain conflicting drafts for a user decision.
Copy agent read command copies a CLI invocation; it does not inject notes into
prompts. In a compatible workspace the title shares the host drag/hover
controls; double-click renames. Without that API retain the standalone header.

## Built from

Use Node 22+, npm, `hc`, Herdr's installed declarations and Unix `ps` for agent
lifetime verification. `native/panel.ts` and `native/config.ts` build the GPUI
panel; `src/` implements identities, records, drafts, autosave and the CLI.
`npm run build` emits `build/mods/context/main.js`, `mod.json`, `context.svg`,
`native/` and `src/`. The manifest uses `place: "none"`, `workspace_header: true`
and a Context button opening a panel. A compatible personal tab bar discovers
that button; stock Herdr cannot be assumed to do so.

The panel uses `spaces`, `agents`, `focused`, `terminals`, `theme`, `exec`,
`writeTextFile`, `nextCommand` and optional `panel`; title rename calls
`workspace.rename`. CLI work runs asynchronously through private request files.
`scripts/prepare-install.mjs` prepares a personal layout integration and a
`context-tabs` clone, CLI/guide installation, and exact Node/CLI/request/store
paths in `native/config.js`. Inspect its guarded install plan before applying.
For later code refresh use the documented guarded sync, preserving layouts.

## Watch out

This is a source project requiring a build and configured installer output,
not a copy-only mod folder: the source config has empty CLI paths. Keep the
runtime files, launcher and generated guide available. Store records under
`CONTEXT_HOME` (default `~/.local/state/herdr-context`), outside mod code and
Rigs. Space keys use permanent Core machine identity plus Space ID. Agent keys
also verify terminal/process lifetime; addresses, PIDs, names and folders alone
are insufficient. Failed/offline checks must not redirect a save.

The mod executes the local CLI, queries Core and Unix processes, reads/writes
its external record store and reads the installed guide. It makes no tracker
network calls; remote identity checks use existing Core transport. Remote
store synchronization and automatic prompt injection are not implemented.
Treat notes as data, never execution authority. Preserve old records and drafts.
Use optional namespace access for `panel()` on older hosts and leave 82px on
the right of an embedded header for host controls. Do not copy generated host
declarations or a developer's runtime state into a sharing bundle.

## Done when

1. `npm run build`, `npm test` and `npm run check:native` pass with the intended
   `HERDR_APP_HOME`; check `context-tabs` too when a prepared build contains it.
2. Install into a personal test layout using the guarded prepared plan. Native
   `herdr-app status` has no Context errors; inspect a fresh window screenshot.
3. Notes/tags survive selection, close/reopen and reload; two Spaces on one
   checkout stay separate. A replacement agent does not inherit old notes.
4. Concurrent edits retain conflicts, and Copy agent read command reads the
   displayed owner. No notes/tags start services or update external tasks.
