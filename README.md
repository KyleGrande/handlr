# Herdr Context

Persistent tags and notes for Herdr project checkouts and coding agents.

This repository is a project scaffold. The native mod, persistence layer and CLI are not implemented or installed yet.

Read [PLAN.md](PLAN.md) for the saved implementation plan and the [Herdr Ranch mod-buttons reference](https://github.com/jslowack/herdr-ranch/blob/main/mod-buttons/RECIPE.md).

## Intended experience

- Notes and Tags are always-present top-right panel buttons beside Files and Changes for the selected space. Each opens in the existing right-side panel; they are not added through +.
- The focused terminal's CWD selects the canonical Git checkout/worktree. Moving into `src/` keeps the same notes/tags; two spaces on the same checkout share them, while separate worktrees remain distinct. Outside Git, use canonical folder context on the correct machine.
- Both panels offer Checkout/Agent context selection (Folder/Agent outside Git). Right-click shortcuts may be added later; they are not the primary entry point. Space-only context is a possible later addition.
- Checkout/folder context describes shared work: purpose, task links, decisions and remaining work. Space identity controls panel presentation, not default record ownership.
- Agent context describes that agent's assignment, constraints, progress and handoff.
- Show an agent's own context alongside inherited checkout/folder context; keep their stored records separate.
- Store notes persistently outside the mod installation. Closing Herdr or restarting a terminal must not discard or reassign context.
- Give agents a small CLI using the same storage and validation as the panel. Agent updates are optional and must never block development.

Tags are descriptive. General notes, explicit instructions and handoff text should be distinguishable. A task URL is a clickable link initially; no Jira/Linear account is required. Notes and tags never trigger process lifecycle actions or external tracker updates.

## Relationship to Rigs

Context is independent of [Herdr Rigs](https://github.com/KyleGrande/herdr-rigs). Rigs may later display the context associated with a worktree/session, but neither project requires the other. Keep task IDs and personal notes out of reusable rig profiles.

Jira/Linear adapters can be added later behind the same context model. Tracker writes must remain opt-in and failures must not block local work.

## Starter structure

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Project decisions and instructions for implementation agents |
| `PLAN.md` | Agreed placement, scope, architecture, implementation sequence and acceptance |
| `src/types.ts` | Initial context data model; no runtime implementation |
| `mods/context/README.md` | Planned native UI boundary |
| `package.json`, `tsconfig.json` | TypeScript project setup |

The initial implementation should cover durable target identity, local storage, versioned CLI responses, panel editing and conflict detection before adding tracker integrations. Verify the installed Herdr APIs before binding machine/checkout and agent/session identities to persistent context records. The starter types still describe the original space/agent draft and must be updated before storage is implemented, as listed in the plan.

`npm install` installs development dependencies and `npm run build` compiles TypeScript. There is currently no executable CLI or install script.
