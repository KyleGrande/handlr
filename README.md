# Herdr Toolbox

Native Herdr command shortcuts for Workspace, Agent, and Worktree. A top-left button toggles a compact tray above the terminal. Existing Context and Rigs integration stays intact.

Add a label, icon/text glyph, and shell command such as `pnpm build`, `yarn test`, `npm run build`, or `./scripts/deploy.sh`. Run opens a separate named terminal tab in the captured Space folder, on its machine. Output and exit status remain visible until Enter closes the tab. Commands use `sh -lc`; shell-specific aliases/functions are not supported.

Use `pnpm build --mode {{mode}}` for parameters at launch. Values become single shell-quoted arguments; place placeholders outside shell quotes. Commands themselves are trusted shell code. Variant copies a shortcut for another saved configuration.

Workspace identity uses Core machine identity and Space ID. Worktree uses Core identity and Git checkout root (recreating the same path reuses its toolbox). Agent uses highlighted agent address, terminal creation time, foreground PID and process start time. A restarted agent gets a separate toolbox. Records persist in Herdr shared state under `toolbox.v1`. Saves reject stale revisions and capture the edited owner. Commands never run on scope changes.

Run `npm test`, `npm run check:native`, and `npm run prepare-install`. Preparation reads the personal `rigs-workspace` layout and produces an independent layout in `prepared/layouts/toolbox-workspace.json` plus `prepared/mods/toolbox`. Pass another source with `node scripts/prepare-install.mjs my-layout`. The button sits below the sidebar header; only the active terminal is wrapped with the tray above it.

Run `npm run install:local` from a normal terminal to prepare the layout, run the native check, back up existing Toolbox files, install, and select `toolbox-workspace`. Pass another source layout with `npm run install:local -- my-layout`. Existing Context and Rigs files are never overwritten. The default app home is `~/.config/herdr-app`. Preparation alone does not install or switch layouts.

Parameter quoting and scope/revision tests pass. Direct `herdr-app check mods/toolbox` passes. Wrapped checker invocations in the restricted environment time out, so use the direct command here. Installation and running-app verification remain pending: this session cannot write the Herdr configuration directory or access its socket. The installer is intended for a normal terminal with those permissions. Remote launches, async identities and appearance need smoke testing. Package-script discovery, shortcut deletion, environment editing, and Windows execution are not implemented yet.
