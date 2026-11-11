# Herdr Toolbox

Native Herdr command shortcuts belonging to the selected Space. The Toolbox button sits beside Context in the tab bar and opens a tray above terminals. The pane matches Context's theme background, rounded border, header, typography, and content spacing.

Add a label, icon/text glyph, and shell command such as `pnpm build`, `yarn test`, `npm run build`, or `./scripts/deploy.sh`. Run opens a separate named terminal tab in the captured Space folder, on its machine. Output and exit status remain visible until Enter closes the tab. Commands use `sh -lc`; shell-specific aliases/functions are not supported.

Use `pnpm build --mode {{mode}}` for parameter prompts. Values become single shell-quoted arguments; place placeholders outside shell quotes. Commands themselves are trusted shell code. Variant copies a shortcut for another saved configuration.

Space identity uses permanent Core machine identity and Space ID. Records persist in Herdr shared state under `toolbox.v1`. Saves reject stale revisions and capture the edited owner. Commands never run on selection changes. Agent and Worktree scopes are not offered.

Run `npm test` and `npm run check:native`. Run `npm run install:local` to prepare, check, back up existing Toolbox files, install, and select the Toolbox layout. Preparation uses the personal `rigs-workspace` layout and creates a separate `toolbox-tabs` mod based on Context's tab bar. Context's own mod files remain unchanged. The original personal layout remains available. `npm run prepare-install` only writes reviewable artifacts under `prepared/`.

The native mod and tab bar checks pass. Installed layout and appearance are verified in Herdr. Parameter quoting and revision/Space isolation tests pass. Remote command launches still require smoke testing. Package-script discovery, shortcut deletion, environment editing, and Windows execution are not implemented yet.
