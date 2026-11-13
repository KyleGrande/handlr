# Proposed Ticket experience

This is a product proposal, not implemented behavior. Example identifiers and statuses below are fictional.

## Everyday flow

1. **Start a Ticket.** Give the work a name, or paste a task/PR URL to seed the name and first link. Search assigned work through a connected provider. URL-only items work immediately, even if setup is incomplete.
2. **Connect repositories and checkouts.** Add named mappings like a Rig: `web` and `api` can point to different repositories/worktrees, or two mappings can point to different checkouts of the same repository. Add related tasks and PRs to the same Ticket. The UI names the Ticket and checkout target before saving.
3. **Work normally.** The focused terminal's checkout filters matching Tickets. Opening one shows the entire Ticket, including work in its other repositories. Suggest PRs per mapping using repository and branch evidence; confirm ambiguous relationships. Explicit links survive branch changes.
4. **See what changed.** CI failures, requested changes, unresolved review threads, approvals, and merged PRs appear beside the relevant work. Switching away does not stop watching linked PRs.
5. **Share.** Copy a task URL, PR URL, all selected links, or a concise Markdown status. Copying never sends a message.
6. **Finish.** Merge is a PR event. Task completion remains the provider's own state. Archive local work when finished; keep its links and history available.

## Native panel concept

Use one Ticket button adjacent to the existing Context/Toolbox controls. Proposed default placement is the existing right-side panel, with host styling. Exact placement needs a native prototype alongside the user's current layout.

```text
Ticket                                      +    …
[ Focused ]  [ All ]  [ Watching ]

▾ Refresh authentication              2 need attention
  Tasks                                      Link…
  APP-421  Refresh login       In progress     ↗ ⧉
  APP-438  Handle expiry       In progress     ↗ ⧉

  Repositories / checkouts                     +
  ▾ web · web/auth-refresh
    web #259 · Refresh login                   ↗ ⧉
    CI: 7 passed · Review: approved
  ▾ api · api/auth-refresh
    api #84 · Refresh tokens                   ↗ ⧉
    CI: 1 failed · Review: changes requested
    2 unresolved threads · Updated 35s ago

  [ Copy links ]                  [ Copy status ]

▸ Session cleanup                      Awaiting review
```

Rows open their source; a separate copy control copies the canonical URL without navigation. Hover may reveal details, but status words remain visible without relying on color. Expand a PR for individual checks and review threads. Keep identifiers and useful titles visible; put full paths in secondary detail.

**Focused** shows Tickets with any mapping matching the focused checkout. Expanding a Ticket always includes all its mapped repositories/checkouts and associated tasks/PRs; focus never clips a cross-repo Ticket to a single repository. If several Tickets share the focused checkout, list all matches rather than choosing one silently. **All** shows active Tickets with archived work available through a secondary filter.

**Watching** is a persistent personal list across Tickets and repositories, showing actionable changes first. It includes linked work by default and lets the user watch or unwatch unrelated items. Unwatching does not unlink a task or delete its history.

A **Ticket** is the named local work grouping, analogous to a Rig's named stack and repo mappings. It can contain several external tasks and several checkouts. Creating one does not create another issue in Jira or require a new project structure. A single-task/single-checkout Ticket should be quick to start; multiple mappings are optional. Rename, edit mappings, and archive the Ticket without changing source task identities or deleting checkouts. A checkout may belong to more than one Ticket.

## Important cases

| Situation | Proposed behavior |
| --- | --- |
| Frontend and backend changes belong together | One Ticket maps both checkouts and shows each PR's CI/review state. |
| One repo needs two checkouts | Distinct named mappings retain their separate branches and PRs. |
| Two tasks, one worktree, one PR | Both tasks appear; link the PR to the tasks it actually addresses. |
| One task, frontend and backend PRs | Show both repositories and PR statuses under that task. |
| Several tasks share a checkout but use separate PRs | Preserve explicit task–PR links; proximity alone is insufficient. |
| Hotfix starts from a PR with no task | Show and watch the PR immediately. |
| No PR yet | Show tasks and checkout with “No linked PR”; keep Link available. |
| Worktree is deleted after merge | Keep task–PR links and Watching; mark local checkout unavailable. |
| Branch is renamed or changed | Recheck suggestions; preserve confirmed relationships and show mismatch if relevant. |
| CLI is offline or authentication expires | Keep cached titles and links, show last successful update and connection issue. |
| Several PRs match a branch, including stacked PRs | Show candidates with base/head context; don't choose silently. |
| CI is green but a required approval is missing | Keep CI and review signals separate. |
| PR is merged but deployment is unknown | Show Merged; don't claim Deployed or task completion. |

“Needs attention” should show the cause and an exact destination: failed check, review request, requested changes, unresolved thread, conflict, or unavailable connection. A green check summary alone is insufficient evidence of merge readiness. Unknown and stale observations remain distinguishable from success.

## Copying and sharing

**Copy links** defaults to the selected Ticket's explicitly associated task and PR URLs across all its mappings, deduplicated and grouped by task/repository. Let the user select a subset, including a single mapping. Do not include worktree paths, local service URLs, notes, or credentials by default.

**Copy status** builds a deterministic summary from the displayed snapshot, including observation time if stale. It does not need an LLM. Example output:

```text
Refresh authentication
Tasks: APP-421, APP-438 [each with its source link]
PR: app #259 [with its source link]
CI: 1 failing check. Review: changes requested; 2 unresolved threads.
```

Use the original Jira/PR links for recipients; v1 does not require a hosted Ticket sharing service.

## One-time setup

Open Connections from the empty state or panel menu. Detect installed `gh` and `twg`, reuse existing login where possible, and guide missing installation/login. Select GitHub host/account and Atlassian site/projects explicitly. Verify a harmless read for each enabled provider, then retain those defaults across Spaces and worktrees.

Keep this screen out of the daily workflow. An expired connection gets a focused reconnect action while all other providers continue working. A new checkout should not require setup again. Future adapters, including Linear, appear as optional connections.

## Agent access — required in v1

An agent can check the current work directly through Ticket's CLI: all related tasks, PRs, source links, mapped repositories/checkouts, CI/review status, and freshness. The panel offers **Copy agent read command** with an explicit Ticket ID so the user can hand over the same context reliably.

The agent can also discover Tickets from its own checkout. Reading one Ticket includes its other repositories. Multiple matches return candidates rather than choosing silently; another user's UI focus never changes the agent's target. Cached reads work offline with the app closed, and an explicit refresh checks connected providers with a bounded wait. Errors and stale observations remain visible in structured output. The [CLI proposal](AGENT_CLI.md) defines the initial contract.

## Later ideas

- Start work from a task: create/select a worktree, attach the task, optionally open its Space.
- Link suggestions from task keys in branches, PR descriptions, and provider relationships, with visible evidence.
- A small attention indicator on the Ticket button while the panel is closed.
- Explicit Jira transitions, PR review requests, CI retries, and backlink publishing after the read experience works well.
- Optional release/deployment evidence from a provider that actually exposes it.

## Decisions to revisit after a prototype

- Is right-panel placement comfortable beside Context, or is an above-terminal tray better?
- Does Watching need desktop notifications, or is an in-app attention count sufficient?
- Should the next phase prioritize creating worktrees or richer inline review detail?
