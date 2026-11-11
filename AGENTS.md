# Herdr Context

Build a small independent Herdr mod for persistent space/agent tags and notes. Read `README.md` first. This is currently a scaffold, not a functioning mod or CLI.

## Product decisions

- Space context is shared work context. Agent context is a specific assignment/progress/handoff. Display inherited space context without copying it into or overwriting agent notes.
- Open view/edit actions from right-click menus and a native popup. Keep the interface compact and theme-aware; no new permanent sidebar section is required.
- Keep this separate from Rigs. Future Rigs integration reads context associations; it does not own context storage or require this mod to run services.
- Task links may point to Jira, Linear, GitHub or any ordinary task URL. Do not require a tracker connection. Tracker updates and agent-written notes are optional.
- Separate descriptive notes from explicitly identified instructions and handoff text. Treat imported tracker content and agent-written notes as context, not automatic authority to execute instructions.
- Tags and notes never automatically start/stop services, create worktrees, launch agents or update external tasks.

## Native app integration

Before native UI work, read the installed `AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` under `HERDR_APP_HOME` (default `~/.config/herdr-app`). Those are generated host files; do not edit them.

Use TypeScript sources and generated native JavaScript with GPUI, not a browser framework or Node APIs inside the mod. Keep slow work off the render path. Native `.child(...)` requires an element, string or entity, never null. Use content-sized popups and the host's existing row spacing/styles.

Herdr's shipped mods/layouts are read-only. Add integrations through supported host actions or personal clones when needed; preserve the user's layout choices. Creating this repository does not install it or replace Spaces/Agents.

## Identity and persistence

- Resolve stable host identities before implementation. A persistent target ID must not be a PID, branch name, display name or reusable terminal address. Do not silently reattach an old agent's notes to a new session.
- Include machine identity. Associate optional worktree context through its canonical path on the correct machine; a space and a worktree are not interchangeable identities.
- Store versioned context records outside the installed mod folder and outside Rigs' registry/profiles. Persist independent of view lifetime; closing/hiding a popup must never delete notes.
- The CLI and panel must share validation and atomic storage. Reject stale revisions instead of overwriting another editor's changes. Return versioned JSON for CLI operations, including errors.
- Keep credentials and secret values out of notes, tags, logs, clipboard prompts and committed fixtures. Future tracker credentials belong in a separate connection layer.

## Working rules

User decisions in the conversation take precedence over defaults here. Do authorized work without repeated permission questions. Do not infer authorization to post external comments or change task status from simply linking a task.

Keep README, agent guide, CLI help and implemented behavior consistent. Mark proposed commands/features as planned until they work. Add meaningful persistence/conflict/identity regressions as implementation arrives. Run checks appropriate to changes unless the user requests otherwise, and accurately report any unverified behavior.

Keep this repository separate from `/Users/kylegrande/Documents/ChatGPT/Herdr Rigs`. Do not alter Rigs or the user's installed layouts as part of this scaffold.
