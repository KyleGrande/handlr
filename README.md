# Handlr

Handlr is a native workspace app derived from [Herdr](https://github.com/herdrdev/herdr-app).
It adds dockable panels, floating native windows, panel layout persistence,
workspace undo/redo, compact headers, and a choice of a separate or shared Herdr Core session.

This is an early development fork. The current macOS build works locally;
the complete release acceptance work remains unfinished. An Apple Silicon macOS
prerelease is available from [GitHub Releases](https://github.com/KyleGrande/handlr/releases).
Download and extract the ZIP, then move `Handlr.app` into Applications.
The build is ad-hoc signed and is not Apple-notarized.
It uses `~/Library/Application Support/Handlr` for its own data and Core session.
Context, Toolbox and Rigs are separate optional mod installations.

## Development

Clone with submodules:

```sh
git clone --recurse-submodules https://github.com/KyleGrande/handlr.git handlr-app
cd handlr-app/handlr
npm run setup:toolchain
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml -p panel-workspace
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml --bins
npm test
```

The repository root retains Herdr's source tree and history. The `handlr/`
subdirectory contains Handlr's icon artwork, prototype fixtures, local packaging
scripts, implementation notes and JavaScript tests. See [handlr/README.md](handlr/README.md)
for packaging and [the implementation record](handlr/IMPLEMENTATION.md) for verification
history and remaining work.

Herdr's original documentation is retained in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).
The default `main` branch contains Handlr's changes; `master` initially
retains upstream's baseline. Use an `upstream` remote pointing to
`https://github.com/herdrdev/herdr-app.git` when incorporating upstream fixes.

Handlr's local packaging uses a separate bundle identifier (`dev.handlr.app`)
and its own icon. It does not enable Herdr's automatic release updater.
The inherited upstream release workflow is gated to the upstream repository.

## Attribution

Based on Herdr by its original contributors. The upstream Apache-2.0 license,
third-party notices and vendored dependency licenses are retained. Handlr's
modifications are described in [handlr/IMPLEMENTATION.md](handlr/IMPLEMENTATION.md).
