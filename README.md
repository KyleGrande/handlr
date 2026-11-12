# Herdr Toolbox

Native Herdr command shortcuts belonging to the selected Space. The Toolbox button sits beside Context in the tab bar and opens a tray above terminals. The pane matches Context's theme background, rounded border, header, typography, and content spacing.

The header **+** opens a native popup matching Rigs: **Copy agent prompt** and **Add a tool (manual)**. The copied prompt points an agent to the installed setup guide and current repo. The agent inspects package scripts and scripts/ and writes `.herdr/toolbox.json`; Toolbox loads these tools automatically within five seconds, without running them. Manual tools persist per Space.

Shortcuts show icons with optional faint labels underneath; use Aa in the header to show or hide labels. Hover always reveals the label. Right-click an icon for Edit or Variant. Add a label, a distinct icon/glyph, and shell command such as `pnpm build`, `yarn test`, `npm run build`, or `./scripts/deploy.sh`. Run starts a separate background terminal in the captured Space folder, on its machine, without switching focus. A blue activity ring means running, green means exit 0, red means failure, and a blue dot means the result is unavailable. Click the icon again to peek at its live output; right-click for Run again. Output and exit status remain visible until Enter closes the tab. Commands use `sh -lc` after loading the user’s interactive login environment; shell-specific aliases/functions are not supported.

Use `pnpm build --mode {{mode}}` for parameter prompts. Values become single shell-quoted arguments; place placeholders outside shell quotes. Commands themselves are trusted shell code. Variant copies a shortcut for another saved configuration.

Space identity uses permanent Core machine identity and Space ID. Records persist in Herdr shared state under `toolbox.v1`. Saves reject stale revisions and capture the edited owner. Commands never run on selection changes. Agent and Worktree scopes are not offered.

Sources, tests, and install scripts use strict TypeScript. Run `npm install` first. `npm run build` reads the installed Herdr runtime declarations from `HERDR_APP_HOME` (default `~/.config/herdr-app`) and emits native JavaScript plus assets into `dist/`. Generated declarations and build output are ignored. Run `npm run typecheck` for a check without emitting files.

Run `npm test` and `npm run check:native`. Run `npm run install:local` to prepare, check, back up existing Toolbox files, install, and select the Toolbox layout. Preparation uses the personal `rigs-workspace` layout and creates a separate `toolbox-tabs` mod based on Context's tab bar. Context's own mod files remain unchanged. The original personal layout remains available. `npm run prepare-install` only writes reviewable artifacts under `prepared/`.

The native mod and tab bar checks pass. Installed layout and appearance are verified in Herdr. Parameter quoting and revision/Space isolation tests pass. Remote command launches still require smoke testing. Shortcut deletion, environment editing, and Windows execution are not implemented yet.
