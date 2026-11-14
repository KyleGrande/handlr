# Handlr development tools

Layout/mod packaging rules and our file inventory are in
[MODS-AND-LAYOUTS.md](MODS-AND-LAYOUTS.md). The native workspace reconstruction
brief is [prototype/RECIPE.md](prototype/RECIPE.md); external panel recipes live
in their separate local mod repositories.

The original sibling `Herdr Context`, `Herdr Toolbox` and `Herdr Rigs` checkouts
now use the pushed `fix/workspace-shared-headers` branches for Handlr. The
temporary `handlr/mod-worktrees/` checkouts were removed; Handlr Dev's installed
Rigs mod points to the original `Herdr Rigs` checkout. Ticket remains in its
original sibling repository on `handlr-ui`.

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
`~/Library/Application Support/Handlr-Dev/`. The local packager migrates the
previous app home there and leaves a compatibility link at the old location
so an already-running development window can keep saving its state. Core
session paths remain unchanged to preserve running terminals. Personal Files
and Changes live in `mods/handlr-files/` and `mods/handlr-changes/`; edit their
`main.js` files directly without rebuilding.
The macOS icon's enlarged artwork and editable clip are in the repository's
`assets/icons/handlr-macos.*`; its image edit prompts are in
`assets/icons/macos-edit-prompt.md` here.

After building `../target/release/herdr-app`, run `npm run package:macos` to
produce the portable GitHub prerelease under `dist/public/`, with a SHA-256
checksum. This packager uses a fresh plist and seeds only bundled panels,
without copying any development data or machine-specific paths. Its launcher
keeps user data in `~/Library/Application Support/Handlr`, seeds missing initial
configuration files, and preserves existing files on subsequent launches.

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
clone instructions. The external Context, Toolbox and Rigs mod branches are
separate repositories, as noted in `IMPLEMENTATION.md`.

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
