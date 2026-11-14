# Herdr Context

[RECIPE.md](RECIPE.md) describes how to reconstruct this mod and its dependencies;
[preview.png](preview.png) is the dated native panel reference.

A native Markdown scratchpad and tags for Herdr Spaces and agents, independent of Rigs.

One **Context** button sits beside Files and Changes and opens the existing right
panel. Its border, rounded corners and header match those panels. A compact
**Space / Agent** segmented control selects the owner, followed by editable tags
and a single scratchpad. Edit uses Herdr's native Markdown editor; edits save automatically after a short pause. There are no separate instructions or handoff boxes.

**Space** belongs to the selected Herdr Space, identified by its persistent Space
ID and permanent Core machine ID. Changing folders, branches, terminals or the
Space's name keeps the same notes. Two Spaces using the same checkout have
separate notes. **Agent** follows the highlighted row in Herdr's Agents list;
switching agents selects that agent's own scratchpad and tags. The panel shows
only the selected owner's content. Shared Space context is still available to
agents through the CLI.

Edits autosave after a short pause, including when switching to another Space
or agent. Drafts stay with their owner across panel closure and mod reloads;
failed writes retry while keeping the draft. Independent concurrent changes
merge safely. Overlapping Markdown edits keep the local draft and show a choice
only when a real conflict occurs. There are no Refresh, Save, Review, Preview,
revision or machine labels in the panel. Notes and tags never launch agents, run
services/worktrees or update external tasks. Keep secrets out.

Like Files/Changes, Context responds directly to live host selection instead of
waiting for a polling tick. Opening uses one background request; revisiting a
context displays its cached draft immediately while verifying fresh data.

## Reading context from agents

Notes are **not automatically sent or injected into agent prompts**. Use the
panel's **Copy agent read command**, or give the agent this command with the
Space ID from the panel:

```sh
~/.local/bin/herdr-context read --space SPACE_ID
```

The copied command includes `--agent ASSIGNMENT_UUID` in Agent scope, returning
`data.record` for that agent and `data.inherited` for the Space. Responses are
JSON with `schema_version: 1` and `ok`; `record.notes` contains Markdown and
`record.tags` is an array. A missing record succeeds with an empty revision 0.
Agents may also use `read` with no arguments inside a live Herdr terminal carrying
a verified `herdr.space` label. If that association is missing/stale, the CLI
requires an explicit Space instead of guessing from CWD or the app's selection.

The installed guide is `~/.local/share/herdr-context/AGENT_GUIDE.md`, generated
from [the agent guide](docs/AGENT_GUIDE.md) with exact local paths. Reading does
not require writing progress. Updates are optional and use `write --input FILE`
(or `--input -`) with `target`, `expected_revision`, and a patch of `notes`/`tags`.
Exit 2 means conflict; exit 3 means locked storage; other errors exit 1. Errors
and help are versioned JSON too.

## Identity and persistence

Space keys combine the Core's permanent ID with the bare persistent `sp…` ID
from its Herdr document. Names, folders, branch names, list positions and PIDs
are not Space owners. Failed/offline identity checks retain drafts and do not
redirect saves. No Git query is needed.

The highlighted host agent selects the agent process; a persistent random UUID
binding owns its record. The binding verifies the Core, terminal creation,
foreground PID and process start time on the owning machine, checking again for
replacement during resolution. PID/terminal address alone never reuse a record.
A changed process lifetime gets a separate binding and the old notes remain.
Agent selection uses the same focused flag as the shipped Agents row, with the
host's explicitly shown agent as fallback. It never picks the first agent in a
Space or uses the former global assignment selection.

Records and bindings live under `CONTEXT_HOME` (default
`~/.local/state/herdr-context`), outside mod code and Rigs. Panel and CLI share
validation, a process lock, revision checks and atomic, fsynced writes. Record
files are private (0600). Binding publication also handles concurrent callers.
A crashed writer can leave `write.lock`: stop all writers before removing that
lock directory; it is never stolen automatically.

Existing checkout/folder records and earlier assignment UUIDs remain readable
with `read --target target.json` or an explicit `--agent UUID`. They are not
silently reassigned to Spaces or highlighted agents. Legacy categorized text is
included in the single editor; editing and autosaving consolidates it into
Markdown. Original records and old panel draft stores are preserved by upgrade.

Remote Space resolution uses the existing Core connection and permanent machine
ID (`--on MACHINE`). Agent bindings additionally require `ps` on the owning Unix
machine. Records remain in this computer's store; remote agents need an
explicitly shared store or the returned JSON. Automatic remote storage sync is
not implemented.

## Build and installation

Requires Node 22+, npm, `hc`, Herdr, and Unix `ps` for highlighted-agent lifetime
verification. `HERDR_APP_HOME` defaults to `~/.config/herdr-app`. Build copies
host declarations to ignored `.host/`; it never changes generated host files.

```sh
npm install
npm run build
npm test
npm run prepare-install -- --layout PERSONAL_LAYOUT
npm run check:native
herdr-app check build/mods/context-tabs
```

Preparation writes review files only inside this repository. Inspect
`.artifacts/layout-before.json`, `.artifacts/layout-after.json`, and
`.artifacts/install-plan.json`. Then apply the guarded plan:

```sh
npm run install:local
```

A fresh install adds `context` and a personal `context-tabs` copy of the existing
header; it changes only that personal layout's tab-bar reference and Context
panel block. Upgrading the earlier two-button version combines its panel blocks,
buttons, panel choices and drafts. It preserves old draft stores and backups,
Rigs, pane styling, Files/Changes, the active layout and `layouts/.state`.
Installation refuses shipped layouts, name collisions and files changed since
preparation. CLI/guide files live in `~/.local/share/herdr-context`, the launcher
in `~/.local/bin`, and backups in `~/.local/share/herdr-context/backups`.

Later combined-panel source updates use:

```sh
npm run build
npm test
npm run check:native
npm run sync:local
```

Sync refuses changes to managed installed files and preserves layout, records,
bindings and drafts. The panel uses host `exec` off the render path for Core,
process lifetime checks and the local CLI. Request content travels in private
files, not shell text. No tracker/network calls are made by the panel; remote
operations use the existing Core connection.

Automated regressions cover persistence, conflicts, competing CLI processes,
Space/machine separation, inherited records, highlighted-agent selection,
process replacement, atomic bindings, late loads, draft migration, autosave races/retries/conflicts, Markdown
consolidation and minimal layout upgrades. See [PLAN.md](PLAN.md) for actual
native/live acceptance results. Tracker adapters, remote storage sync and
right-click shortcuts remain planned.

## Shared workspace header

The mod declares `"workspace_header": true` in mod.json. In a compatible panel
workspace, its original 42px title row carries the host's centered drag grip and
hover-only float/redock, expand/restore and close controls. The row reserves 82px on the right for those
controls; existing mod actions remain available. Double-click its title to
rename the panel without changing its identity, props or stored data.

The workspace API is optional and read through the `herdr` module namespace.
Released Herdr versions without `panel()` retain the original standalone header.
Dialogs and popups retain their own titles. This integration does not change
installation layout choices or any service, command, context or data ownership.

Verified in the isolated Workspace Native app on 2026-11-13: all seven restored panels show one title row. Context, Toolbox and Rigs retain their original header actions; the app status reports no rendering errors. Screenshot: workspace `.checks/native/shared-mod-headers.png`. This verifies header presentation only.
