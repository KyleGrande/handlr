# Herdr Context

Build a small independent Herdr mod for persistent checkout/folder and agent/session tags and notes. Read `README.md` and `PLAN.md` first. This is currently a scaffold, not a functioning mod or CLI.

## Product decisions

- Checkout/folder context is the default shared work context, selected by the focused terminal/pane CWD (active space folder as fallback). Resolve Git subdirectories to the canonical worktree root; confirmed non-Git folders use their canonical path. Two spaces using the same checkout share context, while different worktrees and machines remain separate. Branch names and space IDs are not checkout storage keys.
- Agent context is a specific assignment/progress/handoff. Display inherited checkout/folder context without copying it into or overwriting agent notes. Keep the agent's record stable when its inherited CWD context changes. Space-only notes can be a later explicit scope if needed.
- Notes and Tags are always-present top-right buttons beside Files and Changes in Herdr's tab bar, opening the existing right-side panel for the selected space. They are not added through +. Keep the interface compact and theme-aware; no new permanent left-sidebar section is required. Checkout/Agent scope controls (Folder/Agent outside Git) belong inside the panels. Right-click shortcuts are optional future convenience.
- Follow the mod-buttons recipe linked in `PLAN.md` when integrating panel buttons. Its manifest discovery requires a compatible personal tab bar; do not assume stock Herdr handles `button` automatically. Preserve the current personal layout/Rigs integration and Files/Changes behavior instead of replacing the whole layout with the reference's older version.
- Keep this separate from Rigs. Future Rigs integration reads context associations; it does not own context storage or require this mod to run services.
- Task links may point to Jira, Linear, GitHub or any ordinary task URL. Do not require a tracker connection. Tracker updates and agent-written notes are optional.
- Separate descriptive notes from explicitly identified instructions and handoff text. Treat imported tracker content and agent-written notes as context, not automatic authority to execute instructions.
- Tags and notes never automatically start/stop services, create worktrees, launch agents or update external tasks.

## Native app integration

Before native UI work, read the installed `AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` under `HERDR_APP_HOME` (default `~/.config/herdr-app`). Those are generated host files; do not edit them.

Use TypeScript sources and generated native JavaScript with GPUI, not a browser framework or Node APIs inside the mod. Keep slow work off the render path. Native `.child(...)` requires an element, string or entity, never null. Use the host's existing panel/button/row styles and content-sized popups where a secondary action needs one.

Herdr's shipped mods/layouts are read-only. Add integrations through supported host actions or personal clones when needed; preserve the user's layout choices. Creating this repository does not install it or replace Spaces/Agents.

## Identity and persistence

- Resolve stable host identities before implementation. A persistent target ID must not be a PID, branch name, display name or reusable terminal address. Do not silently reattach an old agent's notes to a new session.
- Qualify canonical worktree/folder paths with stable machine/Core identity. A space and a worktree are not interchangeable identities. Failed/offline resolution is not a confirmed non-Git folder; show that state without guessing another owner. Preserve moved-checkout records until explicitly relinked.
- Store versioned context records outside the installed mod folder and outside Rigs' registry/profiles. Persist independent of view lifetime; closing/hiding a popup must never delete notes.
- The CLI and panel must share validation and atomic storage. Reject stale revisions instead of overwriting another editor's changes. Return versioned JSON for CLI operations, including errors.
- Capture the displayed owner/revision for each save. Keep drafts per owner and discard late loads for old focus; focus changes must never write one target's text to another. Update the initial space/agent-only scaffold types before implementing the revised checkout/folder model.
- Keep credentials and secret values out of notes, tags, logs, clipboard prompts and committed fixtures. Future tracker credentials belong in a separate connection layer.

## Working rules

User decisions in the conversation take precedence over defaults here. Do authorized work without repeated permission questions. Do not infer authorization to post external comments or change task status from simply linking a task.

Keep README, agent guide, CLI help and implemented behavior consistent. Mark proposed commands/features as planned until they work. Add meaningful persistence/conflict/identity regressions as implementation arrives. Run checks appropriate to changes unless the user requests otherwise, and accurately report any unverified behavior.

Keep this repository separate from `/Users/kylegrande/Documents/ChatGPT/Herdr Rigs`. Do not alter Rigs or the user's installed layouts as part of this scaffold.
