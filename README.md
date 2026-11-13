# Herdr Ticket

Bring the task, the checkout, and the pull request together wherever you are working.

**Status: planning only.** This repository contains the proposed experience and implementation plan. There is no running mod, CLI, installation, or authenticated tracker integration yet.

Ticket is an independent native Herdr mod alongside Context, Rigs, and Toolbox. It answers four questions:

- What am I working on in this checkout?
- Which tasks and PRs belong to this work?
- What needs my attention in CI or code review?
- Which links can I copy and send?

## Proposed experience

Open **Ticket** beside Context and Toolbox. The panel follows the focused checkout and shows linked Jira/Linear/GitHub tasks, pull requests, CI, review state, and one-click Open/Copy actions. **Watching** keeps work visible across checkouts after you switch focus or remove a worktree.

Paste a task or PR URL, or select an assigned task. Attach it to an existing checkout. Creating a new worktree can be added later. Attach another task without creating another checkout. Link PRs when they exist, with suggestions based on repository and branch evidence.

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
