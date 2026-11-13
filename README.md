# Herdr Ticket

Bring related tasks, repositories, checkouts, and pull requests together in one named Ticket.

**Status: planning only.** This repository contains the proposed experience and implementation plan. There is no running mod, CLI, installation, or authenticated tracker integration yet.

Ticket is an independent native Herdr mod alongside Context, Rigs, and Toolbox. It answers four questions:

- What work does this Ticket cover across my repositories and checkouts?
- Which tasks and PRs belong to this work?
- What needs my attention in CI or code review?
- Which links can I copy and send?

## Proposed experience

Create a named **Ticket**, similar to a named Rig. Each Ticket can map several repository roles to concrete checkouts—for example `web → /work/web/auth-refresh` and `api → /work/api/auth-refresh`—and collect the related Jira/Linear/GitHub tasks and PRs. One repository can also contribute multiple checkouts when needed. A simple Ticket can start from a single task or PR, with no checkout yet.

Open **Ticket** beside Context and Toolbox. **Focused** filters the list to Tickets containing the focused checkout; opening one shows its complete work across all mapped checkouts. **All** shows active Tickets across repositories. **Watching** keeps tracked items visible after you switch focus or remove a worktree. Each Ticket provides tasks, PRs, CI, review state, and one-click Open/Copy actions.

Paste a task or PR URL to start or add to a Ticket. Add existing checkouts through named mappings, as with Rigs. Creating new worktrees can be added later. Link PRs when they exist, with suggestions based on repository and branch evidence. Ticket is a local grouping; it does not require creating a new Jira or GitHub issue.

The underlying links are many-to-many: several tasks can share a checkout and PR; one task can span several repositories, checkouts, and PRs. A PR can exist without a task, and a task can exist before any code does. A shared checkout does not imply every PR implements every task.

One-time connection setup uses **GitHub CLI (`gh`)** and **Atlassian Teamwork Graph CLI (`twg`)**. Proposed background adapters reuse those CLI connections for ongoing reads. Ticket stores connection references rather than copied credentials. Ordinary URLs work without a provider connection; Linear can gain its own adapter without changing the core experience.

## Planning documents

- [Experience and wireframe](docs/EXPERIENCE.md)
- [Implementation phases and acceptance criteria](PLAN.md)
- [Connections, identities, and adapter boundaries](docs/ARCHITECTURE.md)

## Herdr responsibilities

| Tool | Responsibility |
| --- | --- |
| Ticket | Tasks, PRs, links, relationships, and attention signals |
| Context | Space/agent notes and tags |
| Rigs | Development stacks, processes, endpoints, and runtime ownership |
| Toolbox | Explicit command shortcuts |

Ticket can reference these tools later, but linking a task does not start a rig, run a tool, or edit notes. It remains useful when the other mods are absent.
