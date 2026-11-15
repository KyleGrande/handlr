# Handlr development tools

Layout/mod packaging rules and our file inventory are in
[MODS-AND-LAYOUTS.md](MODS-AND-LAYOUTS.md). The native workspace reconstruction
brief is [prototype/RECIPE.md](prototype/RECIPE.md). Toolbox, Context, Rigs and
Ticket now live in the repository’s root [`mods/`](../mods/README.md) directory,
including their recipes, screenshots, CLIs and tests. Their Git histories and
local Context/Rigs changes were imported from the original sibling checkouts.
Those checkouts remain available; existing installed panels continue using their
configured CLI paths until explicitly reinstalled or migrated.

Run commands here, inside the repository's `handlr/` subdirectory. The native
host is one directory above, so Cargo commands use `--manifest-path ../Cargo.toml`.

```sh
npm run setup:toolchain
npm test
npm run build
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml -p panel-workspace
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml --bins
```

`npm run release` builds an optimized **Handlr Dev** macOS app, applies
`assets/icons/Handlr.icns`, ad-hoc signs it and writes `dist/Handlr Dev.app` and
`dist/Handlr-Dev-macos-arm64.zip`. `npm run install:release` also installs it to
`~/Applications/Handlr Dev.app`, keeping a backup of an existing installation.
The development bundle uses `dev.handlr.app.dev`; the public app uses
`dev.handlr.app` and displays **Handlr**. The original artwork is
`assets/icons/handlr-source.png`.

Development settings, layouts and mods live in
`~/.config/handlr-dev/`. The local packager migrates the
previous app home there and leaves a compatibility link at the old location
so an already-running development window can keep saving its state. Core
session paths remain unchanged to preserve running terminals. Personal Files
and Changes live in `mods/handlr-files/` and `mods/handlr-changes/`; edit their
`main.js` files directly without rebuilding.
The macOS icon's enlarged artwork and editable clip are in the repository's
`assets/icons/handlr-macos.*`; its image edit prompts are in
`assets/icons/macos-edit-prompt.md` here.

`npm run dev:tools` configures the **handlr-dev** Rigs row. Build sync appears
there with Rigs’ usual hover-only **▶ Rebuild & reopen** and **↻ Reopen** icons; no separate status mod
or bottom bar is installed. The row's dot is green only when running and in
sync, red for rebuild/reopen requirements or unavailable status, and gray
when stopped. Rigs runs a bounded read-only checker while polling and uses
`$HERDR_APP_HOME/data/handlr-dev-build-status.json` as its atomic report.
The checker refreshes at most once per ten seconds. Click the app row after
starting an action to see its Core-owned terminal. Duplicate actions are
rejected. A failed build leaves the existing app running. A successful build
installs first, saves/quits the Dev app and reopens it; Core and existing
terminals remain alive. Reopen skips compilation. Only explicit button clicks
run these actions; installing the integration does not build or restart an app.
`HERDR_APP_HOME` selects the Dev configuration directory. The setup requires
`mods/rigs` built (`npm run mods:build -- rigs` from this directory).

The Dev packager records a content snapshot of native sources, bundled mods,
assets, local dependencies and build configuration, including uncommitted and
new files, in `Contents/Resources/dev-build-info.json` before signing. Generated
build outputs and runtime declarations are excluded. Source changes during
compilation prevent packaging an incorrectly attributed build. **Rebuild required**
means inputs changed or the old bundle has no record; **Reopen Handlr Dev**
means the installed build matches but a running process predates it; **Handlr
Dev in sync** means both match. Missing access or inconsistent records show
**Build status unavailable**, never a guessed success. The check observes only
the configured Dev executable; it does not manage app/Core lifecycle. It does
not compare personal mod edits, runtime settings, external toolchain versions,
or build environment overrides. The initial untracked bundle needs one build
and install to establish its baseline. `npm run dev:status` runs the same check
in a terminal (nonzero unless in sync); `-- --json` provides structured status.

After building `../target/release/herdr-app`, run `npm run package:macos` to
produce the portable GitHub prerelease under `dist/public/`, with a SHA-256
checksum. This packager uses a fresh plist and seeds only bundled panels,
without copying any development data or machine-specific paths. Its launcher
keeps user data in `~/.config/handlr` (or `$XDG_CONFIG_HOME/handlr`), seeds missing initial
configuration files, and preserves existing files on subsequent launches.
An explicit `HERDR_APP_HOME` takes precedence. On first launch, the public app
moves an existing `~/Library/Application Support/Handlr` home into the new
location if it does not already exist, leaving a compatibility link for running
processes. Development builds similarly migrate their configured former home.
Existing homes are never merged or overwritten by migration.

This is the existing local packaging harness. It requires a previously prepared
isolated app configuration at `.checks/Handlr.app/Contents/Info.plist`. That
configuration is intentionally untracked because it contains machine-specific
home, Core socket and environment paths. It can be copied from an existing
local Handlr app; inspect its paths before installing from a different checkout.
A fresh clone can build and test the sources without this configuration, but
cannot yet produce a configured release using this harness alone.

The history documents describe the earlier outer workspace arrangement with
native sources under `host/`; the fork keeps those native sources at repository
root. Historical commands and absolute paths in those records are not fresh
clone instructions. The original external mod repository arrangement described
in `IMPLEMENTATION.md` is historical; current mod development happens under
root `mods/`.

The complete release acceptance plan is still unfinished. This fork does not
publish through Herdr's release infrastructure.

## Local workspace storage

The existing local workspace has been consolidated into this directory. Source,
assets, scripts, and tests are tracked here. `.checks/` (including the development
legacy app-home link and existing Core sessions), `.tools/`, `.toolchain/`, `dist/`, `mod-worktrees/`, and the
machine-specific `rig.handlr.json` are local and ignored. Toolchain versions and
installation scripts remain tracked; use `npm run setup:toolchain` in a fresh clone.

The former outer workspace aliases and forwarding npm manifest have been
removed. The installed local app's launch environment, installed Rigs mod paths,
Rig profile reference, and Git worktree registrations now use the canonical paths
inside this checkout. The former `host/` contents have been promoted into the
`Handlr/` directory itself, including `.git`; `host/` no longer exists. Work in
`Handlr/` or this `handlr/` subdirectory so Ticket can verify the checkout. Run
npm commands here in `handlr/`; Rust sources and Cargo.toml are one level above.

The previous outer scripts and fixtures are preserved locally in
`.checks/workspace-consolidation-backup/`. Their differing Rust/release paths were
already adapted in the tracked copies; the Machines panel test has now been
brought into the repository with its import path updated. The previous outer
README is retained as `LOCAL-WORKSPACE-HISTORY.md` for historical context.

Consolidation verification (2026-11-14): 13 JavaScript checks, 52 offline Rust
checks, and prototype generation passed. The moved Rust and Zig toolchains
execute, local artifacts are ignored, and Ticket can
verify the Git checkout. Installed Rigs and Ticket pass Handlr's native checker.
Handlr was reopened with its updated launch environment; all 14 existing Core
terminals remained present and the app reported no mod errors. No compatibility
symlinks remain in the outer workspace. Historical logs and backup files retain
their original paths as records, not active configuration.

The subsequent repository-root move promoted `host/` into `Handlr/`, preserving
Git history, the current branch, and local edits. Installed app bundle launch
paths, installed Rigs CLI paths, Rig checkout/profile mappings, and external mod
worktree registrations were migrated to the new paths. No `host/` alias remains.

## Tab Groups

Drag a panel's six-dot grip onto **+ Tab Group** beside another panel title to
put the two panels in separate tabs. Alternatively, use Cmd+Shift+P →
**Create Tab Group…**, then choose two open docked panels. Other stacked panels
stay in their current views. The group is saved across restarts; Cmd+Option+Z
undoes the change. Escape cancels a pending drag or palette selection.

When dragging a tab, a neighboring tab is temporarily revealed. Choose
**Stack Panels** to show the panels together, or **New Pane** to detach it.
Drop on a tab label to keep it as a tab; Escape cancels the preview.

Dragging the only panel in the active tab also temporarily reveals a neighboring
tab. Drop the panel into that visible stack or elsewhere; Escape restores the
original tab. Dragging one panel out of a multi-panel stack keeps that tab shown.

## App-provided and user-owned panels

Editing a bundled panel makes the copy in `mods/<name>/` user-owned. It stays
active under the same identity across restarts. `app-provided/mods/` holds the
latest bundled version outside the palette's installed panels. Future changes
to that bundled version appear in **Review Panel Updates** (Cmd+Shift+P): keep
your version, review and merge text side by side, or use the complete update.
Unmodified panels update automatically. No `-edited` mod copies are generated;
existing personal variants and legacy copies remain intact.

Drag a panel from a stack onto an existing panel-group tab label to add it as
its own tab. Drop near the outside edges of a pane to insert a separate pane:
left/right in top and bottom docks, above/below in side docks. The outer top
and bottom window bands insert at the pointer's horizontal position, so a
right-hand pane can be moved before the left-hand pane. These moves support undo.

While dragging, the outer dock drop bands span 40px on all four sides,
center-only top/bottom bands span 96px, and neighboring pane insertion bands
span up to 48px. Dock guides appear only during the drag.
