# Herdr Ticket

Maintained in Handlr at `mods/ticket`. Run this package’s commands from
that directory. See [the mod development guide](../README.md) for commands
covering all four mods and notes on existing installations.

[RECIPE.md](RECIPE.md) describes reconstruction and runtime dependencies;
[preview.png](preview.png) is a dated native panel reference.

Bring related tasks, repositories, checkouts, and pull requests together in one named Ticket.

**Status: working local implementation with GitHub reads.** Ticket has an independent native panel, durable local relationships, and the required headless agent CLI. The build, automated checks, native check, native create/map/focus/copy/connection flow, and live GitHub reads have been verified. **Jira/TWG observations, remote checkout discovery, and later-phase actions remain planned.** See [implementation status and verification](docs/STATUS.md) for the exact limits.

Ticket is an independent native Herdr mod alongside Context, Rigs, and Toolbox. It answers four questions:

- What work does this Ticket cover across my repositories and checkouts?
- Which tasks and PRs belong to this work?
- What needs my attention in CI or code review?
- Which links can I copy and send?

## Experience

Create a named **Ticket**, similar to a named Rig. Each Ticket can map several repository roles to concrete checkouts—for example `web → /work/web/auth-refresh` and `api → /work/api/auth-refresh`—and collect the related Jira/Linear/GitHub tasks and PRs. One repository can also contribute multiple checkouts when needed. A simple Ticket can start from a single task or PR, with no checkout yet.

Open **Ticket** beside Context and Toolbox. **Focused** filters the list to Tickets containing the focused checkout; opening one shows its complete work across all mapped checkouts. **All** shows active Tickets across repositories. **Watching** keeps tracked items visible after you switch focus or remove a worktree. Each Ticket provides tasks, PRs, CI, review state, and one-click Open/Copy actions.

Paste a task or PR URL to start or add to a Ticket. Add existing checkouts through named mappings, as with Rigs. Creating new worktrees and link suggestions remain planned. Link PRs explicitly when they exist. Ticket is a local grouping; it does not require creating a new Jira or GitHub issue.

The underlying links are many-to-many: several tasks can share a checkout and PR; one task can span several repositories, checkouts, and PRs. A PR can exist without a task, and a task can exist before any code does. A shared checkout does not imply every PR implements every task.

GitHub reads automatically reuse **GitHub CLI (`gh`)** and its active authenticated account. No Ticket login or connection setup is required; Connections only reports CLI availability and authentication. Credentials stay in gh. **Atlassian Teamwork Graph CLI (`twg`)** was absent during implementation; its adapter is planned until installed commands and tenant reads can be verified. Jira, Linear, GitHub issues, and ordinary URLs work as saved links without a connection.

**Agent access is implemented.** The read-only Ticket CLI returns the selected Ticket's tasks, PRs, canonical links, checkout mappings, CI/review observations, and freshness across all its repositories. It works without the panel or Herdr app being open. Agents resolve context from their own verified checkout or an explicit Ticket ID, and can request a bounded refresh through the shared GitHub adapter. See the [agent CLI](docs/AGENT_CLI.md).

## Build and run

Requires Node 22+, Git, and the installed Herdr host declarations for the native build. No runtime npm dependencies are used.

```sh
npm ci
npm run build
npm test
herdr-app check build/ticket
node bin/herdr-ticket help
npm run install:mod
herdr-app do mod.open --name ticket
```

The installer adds only `mods/ticket` and a `~/.local/bin/herdr-ticket` symlink. It refuses unrelated files or modified installed Ticket code. It preserves existing mods and layouts; Ticket opens as a separate native window. `HERDR_APP_HOME` selects a different host. The installed mod references this checkout's built CLI; rebuild after source changes and reinstall after moving the repo or rebuilding native code.

To dock Ticket in a **new layout based on the current workspace**, run `npm run install:layout`. This uses Herdr's clone commands to preserve the current layout and its click settings, creates `ticket-workspace` and its own toolbar clone, and switches to it with Ticket in the right panel. A Ticket button appears beside Context and Toolbox. The original layout and toolbar stay intact. Existing destinations are refused; use `npm run install:layout -- another-name` for another clone. The installer verifies the expected workspace toolbar/side-panel structure before changing anything.

```sh
herdr-ticket create --name "Refresh authentication" --url https://example.atlassian.net/browse/APP-421
herdr-ticket map --ticket TICKET_ID --name web --checkout /path/to/web
herdr-ticket link --ticket TICKET_ID --url https://github.com/OWNER/REPO/pull/123
herdr-ticket read --ticket TICKET_ID --refresh --timeout 20
herdr-ticket read
```

Replace example IDs and paths. Every response, including help and errors, is JSON. Data defaults to `~/.local/share/herdr-ticket/store.json`, outside mod code; `HERDR_TICKET_STORE` overrides it. Cached reads require no store write permission or provider tools. Checkout discovery reads the permanent identity from the local Core identity file and verifies Git/filesystem lifetime evidence; an explicit Ticket ID still works when Core identity or Git is unavailable. No command starts interactive login or writes to a provider.

## Design and implementation documents

- [Experience and wireframe](docs/EXPERIENCE.md)
- [Implementation phases and acceptance criteria](PLAN.md)
- [Connections, identities, and adapter boundaries](docs/ARCHITECTURE.md)
- [Required v1 agent CLI](docs/AGENT_CLI.md)
- [Verified behavior and remaining work](docs/STATUS.md)

## Herdr responsibilities

| Tool | Responsibility |
| --- | --- |
| Ticket | Tasks, PRs, links, relationships, and attention signals |
| Context | Space/agent notes and tags |
| Rigs | Development stacks, processes, endpoints, and runtime ownership |
| Toolbox | Explicit command shortcuts |

Ticket can reference these tools later, but linking a task does not start a rig, run a tool, or edit notes. It remains useful when the other mods are absent.
