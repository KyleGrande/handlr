# Herdr Toolbox

Native Herdr command shortcuts for Workspace, Agent, and Worktree. A top-left button toggles a compact tray above the terminal. Existing Context and Rigs integration stays intact.

Add a label, icon/text glyph, and shell command such as `pnpm build`, `yarn test`, `npm run build`, or `./scripts/deploy.sh`. Run opens a separate named terminal tab in the captured Space folder, on its machine. Output and exit status remain visible until Enter closes the tab. Commands use `sh -lc`; shell-specific aliases/functions are not supported.

Use `pnpm build --mode {{mode}}` for parameters at launch. Values become single shell-quoted arguments; place placeholders outside shell quotes. Commands themselves are trusted shell code. Variant copies a shortcut for another saved configuration.

Workspace identity uses Core machine identity and Space ID. Worktree uses Core identity and Git checkout root (recreating the same path reuses its toolbox). Agent uses highlighted agent address, terminal creation time, foreground PID and process start time. A restarted agent gets a separate toolbox. Records persist in Herdr shared state under `toolbox.v1`. Saves reject stale revisions and capture the edited owner. Commands never run on scope changes.

Run `npm test`, `npm run check:native`, and `npm run prepare-install`. Preparation reads the personal `rigs-workspace` layout and produces an independent layout in `prepared/layouts/toolbox-workspace.json` plus `prepared/mods/toolbox`. Pass another source with `node scripts/prepare-install.mjs my-layout`. The button sits below the sidebar header; only the active terminal is wrapped with the tray above it.

After review, copy the prepared mod and layout into your Herdr app home's `mods` and `layouts` directories, then select `toolbox-workspace`. The default app home is `~/.config/herdr-app`. Preparation does not install or switch layouts.

Parameter quoting and scope/revision tests pass. Native checking and running-app verification are pending: this execution environment cannot reach macOS GUI services or the Herdr socket. Initial implementation, not verified installed functionality. Remote launches, async identities and appearance need smoke testing. Package-script discovery, shortcut deletion, environment editing, and Windows execution are not implemented yet.
