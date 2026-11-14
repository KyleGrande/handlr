# Handlr development tools

Run commands here, inside the repository's `handlr/` subdirectory. The native
host is one directory above, so Cargo commands use `--manifest-path ../Cargo.toml`.

```sh
npm run setup:toolchain
npm test
npm run build
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml -p panel-workspace
node scripts/toolchain.mjs cargo test --locked --manifest-path ../Cargo.toml --bins
```

`npm run release` builds an optimized macOS app, applies `assets/icons/Handlr.icns`,
ad-hoc signs it and writes `dist/Handlr.app` and a ZIP. `npm run install:release`
also installs it to `~/Applications/Handlr.app`, keeping a backup of an existing
installation. The original artwork is `assets/icons/handlr-source.png`.
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
