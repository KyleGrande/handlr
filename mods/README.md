# Handlr mods

All mod source now lives here. Bundled JavaScript panels and internal app UI
are edited directly; the four optional tool packages keep their own dependencies,
lockfiles, build scripts, tests and runtime storage contracts.

## Bundled mods and internal UI

- `machines/`, `layouts/`, `spaces/`, `agents/`, `files/`, `changes/`, `tabs/`,
  `pane/` and the other bundled mod directories hold the runtime JavaScript
  and assets. `bundled.txt` is the explicit app-bundle inventory.
- `frame/settings/` owns Settings, Glass and Seamless; `frame/palette/`,
  `frame/mod-updates/`, `frame/welcome/`, `frame/feedback/` and `frame/whatsnew/`
  are the other internal UI mods.
- `workspace-prototype/` is the earlier fixed-layout demo, not the native
  workspace engine and not an app-provided package.

`build.rs` embeds only the listed bundled mods and `frame/`; it does not scan
all of this directory into the app. Installed identities and paths remain
`mods/<name>/` and `frame/<name>/`, so layouts, personal edits and update journals
need no migration. `defaults/` retains layouts, keys, icons, and the guide/API.

From `handlr/`, use `npm run mods:build -- machines layouts frame/settings`
for JavaScript syntax checks, `npm run mods:test -- machines` for the shared
Handlr mod suite, or `npm run mods:check -- machines layouts frame/settings`
for native host checks. These source packages need no npm dependency install.
Edits to installed mod copies can reload without recompiling the native app;
shipping updated embedded defaults still requires rebuilding the app bundle.
The Dev build checker fingerprints these listed sources and internal UI,
while edits to optional tool packages do not invalidate the native app build.

## Optional tool packages

| Package | Responsibility | Source / CLI |
| --- | --- | --- |
| [Toolbox](toolbox/README.md) | Explicit command shortcuts | `toolbox/mods/` |
| [Context](context/README.md) | Space and agent notes/tags | `context/native/`, `context/src/cli.ts` |
| [Rigs](rigs/README.md) | Development stacks and process ownership | `rigs/mods/rigs/`, `rigs/bin/rig` |
| [Ticket](ticket/README.md) | Tasks, PRs and checkout relationships | `ticket/native/`, `ticket/bin/herdr-ticket` |

## Development

Use Node 22+ and npm. Native builds require declarations from an installed
Herdr/Handlr app. `HERDR_APP_HOME` selects that app home; the existing package
default is `~/.config/herdr-app`. Native checks also require `herdr-app` on PATH.
To use Handlr Dev’s declarations on macOS:

```sh
cd handlr
export HERDR_APP_HOME="$HOME/.config/handlr-dev"
npm run mods:install
npm run mods:build
npm run mods:test
npm run mods:check
```

Run these npm commands from `handlr/`, not repository root. Append package
names to select a subset, for example `npm run mods:test -- context ticket`.
Tests and native checks rebuild the selected packages first, including Rigs’
separate native build. `mods:install` runs `npm ci` in each source package;
it installs dependencies only. Tests can create disposable local fixtures;
the aggregate commands do not install panels, edit personal layouts, or
restart the app. Core lifecycle/crash acceptance remains available through
Rigs’ separate `test:live` and `test:crash` scripts.

You can also enter any package directory and run its own documented commands.
Build output, generated host declarations, installation plans and node_modules
stay ignored. Rigs retains its historically tracked generated native JS and
guides; regenerate them with `npm run build:mod` when its sources change.

## Installation and existing data

The four tool packages above are optional; importing their sources does not
bundle them in the portable Handlr release or install them in an app home. Each package README
documents its guarded installer and native checks. Choose the intended
`HERDR_APP_HOME` before installation and preserve personal panel edits.

Existing installations continue using their configured paths. Context installs
a separate runtime copy; Rigs and Ticket can embed absolute source CLI paths.
Their original sibling checkouts are retained so those installations keep
working. Moving to these packages requires an explicit installation migration:
Rigs’ sync ownership guard refuses an installation owned by another checkout,
and Ticket refuses a CLI symlink pointing at a different checkout. Preserve
and back up existing files before replacing those references. Simply importing
sources does not bypass those guards or rewrite paths in the running app.

Storage locations, schemas, mod names and CLI names retain their Herdr
identities. Notes, registries, tickets, credentials, machine paths and personal
layouts stay outside these source packages. The four optional tool mods remain
independent of one another at runtime.

## Import provenance

Imported on 2026-11-14 using unsquashed Git subtree merges. Original commits
remain ancestors of Handlr; inspect an original tree with `git show <commit>`.

| Package | Original repository | Branch | Imported HEAD |
| --- | --- | --- | --- |
| Toolbox | `KyleGrande/herdr-toolbox` | `fix/workspace-shared-headers` | `98f63d2` |
| Context | `KyleGrande/herdr-context` | `fix/workspace-shared-headers` | `fceb569` |
| Rigs | `KyleGrande/herdr-rigs` | `fix/workspace-shared-headers` | `e1ea053` |
| Ticket | `KyleGrande/herdr-ticket` | `handlr-ui` | `8a0b786` |

The integration also includes the original checkouts’ uncommitted Context
surface-color change and Rigs build-status/development-tool changes, including
their tests and verification notes. The original checkouts were left untouched.
Develop new changes here; no synchronization with the old repositories is
automatic. Archiving or deleting those repositories is a separate action.

Import verification on macOS: clean `npm ci` installs, all four package builds,
83 mod tests (Toolbox 6, Context 25, Rigs 34, Ticket 18), and 44 Handlr tooling
tests passed. Native checks against Handlr Dev passed for Toolbox, Toolbox Tabs,
Context, Rigs and Ticket, plus all 21 Rigs deferred-state checker fixtures.
Toolbox’s terminal-data type boundary was adapted to Handlr’s newer selection
metadata declaration without changing terminal behavior. No app was installed
or restarted; live UI and Core lifecycle acceptance were not rerun.

To retain the imported commit ancestry when integrating this branch, use a
merge commit. Squashing the import discards the original histories from the
destination branch.
