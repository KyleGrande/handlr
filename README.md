# Herdr Context

Persistent tags and notes for Herdr spaces and coding agents.

This repository is a project scaffold. The native mod, persistence layer and CLI are not implemented or installed yet.

## Intended experience

- Right-click a space or agent to view/edit its tags and notes in a small native popup. No permanent sidebar section is required.
- Space context describes shared work: purpose, task links, decisions and remaining work.
- Agent context describes that agent's assignment, constraints, progress and handoff.
- Show an agent's own context alongside its space context; keep their stored records separate.
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
| `src/types.ts` | Initial context data model; no runtime implementation |
| `mods/context/README.md` | Planned native UI boundary |
| `package.json`, `tsconfig.json` | TypeScript project setup |

The initial implementation should cover durable target identity, local storage, versioned CLI responses, popup editing and conflict detection before adding tracker integrations. Verify the installed Herdr APIs before choosing how host space/agent identities bind to persistent context records.

`npm install` installs development dependencies and `npm run build` compiles TypeScript. There is currently no executable CLI or install script.
