# Handlr

The current local macOS release includes the docked workspace, native floating
panel windows with resize/redocking, and keyboard shortcuts. The broader
original feature plan is retained as future work.

Build and install the optimized app:

```sh
npm run install:release
open "$HOME/Applications/Handlr.app"
```

Quit any older Handlr window before opening the installed build. The local app
keeps the existing isolated home and Core session under `.checks/native/`.
The signed local bundle and ZIP are also generated in `dist/`.
The app icon is packaged from `assets/icons/Handlr.icns`; the original supplied
artwork is preserved as `assets/icons/handlr-source.png`.

Use the outward arrow in a panel header to float it; the inward arrow returns
it to its dock. Closing the native floating window also redocks its contents.
The main macOS window uses a compact 22px title bar that matches the workspace
canvas background. Drag the space beside the native window buttons to move it.
Enable **Settings → Look → No Headers** to hide panel title rows and reclaim
their height. Group tabs remain available. Turn it off to restore header actions
and drag handles; the preference is saved and applies to floating panels too.
Panels keep their live instances and unsaved state. All panes have outer
spacing and gaps; panel controls appear on header hover, aligned on the right. Mod actions sit
beside the title on the left and also appear on hover. Floating
windows contain the panel directly, with no extra toolbar.

Click a panel, then use **Cmd+Option+F** to float it or
**Cmd+Option+Shift+F** to redock it. **Cmd+Option+Z** undoes a workspace change;
add Shift to redo. **Cmd+W** in a floating window returns its panel to the dock.

In **Settings → Machines → Core session**, turn on **Use Herdr’s existing
session** to share Herdr’s spaces, terminals, and agents. Turn it off to use
Handlr’s separate session. Quit and reopen Handlr after changing this setting;
running work stays alive in both sessions, and Handlr keeps its panel layout.
To access both sessions from Herdr, Handlr’s separate session can also be added
as a machine using its Core socket and storage paths.

Open **Machines** from the panel picker or command palette (**Open Machines**).
The dockable panel lists this computer and saved remote machines, connection
status, space and terminal counts, and shortcuts to select or create spaces.
Use **Add machine** to connect another computer or the gear to manage machines
and Core sessions. The list refreshes every five seconds; temporary machines
are omitted.

## Earlier implementation history

Implementation is in progress on the native host's `panel-workspace` branch.
**The full plan is not complete or ready to install.** Rust 1.100.0 and Zig 0.16.0
are installed locally. The shared engine, native layout projection and persistence
adapter compile and pass 41 Rust tests. Seven prototype JavaScript checks also pass.

The complete desktop host now builds, including the GPUI window integration.
The host unit tests pass (459 passed, two skipped), as do all 41 workspace tests.
The isolated native app is running and its initial layout has been visually
verified. Pointer checks cover dragging, expand/restore and quick rename.
Read [IMPLEMENTATION.md](IMPLEMENTATION.md) for exact status and remaining work.


Open the built native app:

```sh
open "/Users/kylegrande/Documents/ChatGPT/Handlr/.checks/Handlr.app"
```

This app uses its own home and Core session under `.checks/native/`. Drag the **centered six-dot grip** in a section header to move it; drag a view
tab to move a view, or the centered grip in a tab row to move a whole group.
Hover a panel header for **float/redock**, **expand/restore** and **close**.
Double-click a title or view tab to rename it. Files and Changes use their
original header; single-view groups omit redundant labels. There are no collapse
controls; closing a panel keeps its data. Translucent area highlights
show drop destinations, like terminal dragging. While dragging, choose
**Top/Bottom · full width** at the outer window edge or **Top/Bottom · center**
inside the terminal column. Center-only docks leave the side panes at full height. Escape cancels. Press
**Cmd+N** to create a space in that isolated session. Your regular Herdr data
is unchanged. The complete docking release still has unfinished features.

The prototype places Code/Context and Spaces/Agents in independent left groups,
Toolbox and Rigs in separate right groups, and the existing active terminal tab
in the center. Code shows Changes above Files. Section headers collapse and
restore their preferred sizes. View selection uses the host's native stack tabs.

Files:

- [PLAN.md](PLAN.md): complete release scope and acceptance checks.
- [audit/HOST-AUDIT.md](audit/HOST-AUDIT.md): actual source integration points,
  storage migration findings, transfer constraints, approval scope and test limits.
- [prototype/layouts/panel-workspace-prototype.json](prototype/layouts/panel-workspace-prototype.json): separate layout, ready for isolated testing.
- [prototype/mods/workspace-prototype](prototype/mods/workspace-prototype/main.js): personal controls; shipped mods are referenced without edits.
- `host/`: shallow clone of `herdrdev/herdr-app` at
  `ce0fd1b245a7fdaa4e6c9e3c7ddac23ddbb1e799`, with local implementation changes.
- `host/crates/panel-workspace/`: shared model, operations, persistence and tests.
- `host/src/workspace.rs`: native layout projection and persistent session.
- `host/src/window/workspace.rs`: built GPUI integration, now running in the isolated native app.
- `prototype/workspaces/panel-workspace-native.json`: generated document for the modified host.

Run `npm run build` to regenerate the layout and `npm test` for the prototype's
automated checks. Run `npm run prepare:checks` to prepare the tab-bar native
checker fixture. Native checks use:

```sh
herdr-app check '/absolute/path/to/this/workspace/prototype/mods/workspace-prototype'
herdr-app check '/absolute/path/to/this/workspace/.checks/tabs'
```

Both prototype initial native renders and all seven prototype checks passed.
The full desktop build and initial live smoke checks now pass. The complete
release acceptance suite remains incomplete.

The toolchain is installed under `.toolchain/`, including Zig's standard library.
`host/vendor/ghostty` contains the pinned source. No shell profile or system tool
installation was changed. Reproducible local commands:

```sh
npm run setup:toolchain
node scripts/toolchain.mjs rustc --version
node scripts/toolchain.mjs zig env
npm run prepare:rust
npm run test:rust
```

The offline harness compiles the actual engine, command table, native layout
parser and pure adapter against pinned upstream sources. Temporary dependency
manifests enable only the engine's required features; they do not compile the
GPU window integration. Network access now works; full host commands are:

```sh
node scripts/toolchain.mjs cargo build --locked --manifest-path host/Cargo.toml
node scripts/toolchain.mjs cargo test --locked --manifest-path host/Cargo.toml
```

An isolated preview has now been prepared and launched as **Herdr Workspace
Preview**, at `.checks/HerdrWorkspacePreview.app`. It uses a copy of the installed
Herdr 0.1.15 renderer and selects `panel-workspace-prototype`; it is **not** the
new, unbuilt host integration. Its home, Core socket, session, state and config
are isolated under `.checks/preview/`, with fresh mod data. Copies of Context,
Toolbox and Rigs are installed there. The application inventory confirmed it
running. Its rendered frame has since been inspected, showing the prototype
behind its welcome dialog. Use **Handlr** above for the newly
built engine.

To reopen the prepared preview from Terminal:

```sh
open "/Users/kylegrande/Documents/ChatGPT/Handlr/.checks/HerdrWorkspacePreview.app"
```

The active `toolbox-workspace` layout and installed mods were left intact.
See the audit for all missing release functionality; this prototype is not the
complete docking engine.
