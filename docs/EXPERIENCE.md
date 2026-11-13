# Proposed Ticket experience

This is a product proposal, not implemented behavior. Example identifiers and statuses below are fictional.

## Everyday flow

1. **Pick work.** Paste a Jira URL, paste a PR URL, or search assigned work through a connected provider. URL-only items work immediately, even if setup is incomplete.
2. **Connect the checkout.** Attach the item to the focused worktree or choose another registered checkout. The UI names the target before saving. A second task can attach to that same checkout.
3. **Work normally.** Ticket follows the checkout resolved from the focused terminal. It suggests PRs matching the repository and branch; you confirm ambiguous relationships. Explicit links survive branch changes.
4. **See what changed.** CI failures, requested changes, unresolved review threads, approvals, and merged PRs appear beside the relevant work. Switching away does not stop watching linked PRs.
5. **Share.** Copy a task URL, PR URL, all selected links, or a concise Markdown status. Copying never sends a message.
6. **Finish.** Merge is a PR event. Task completion remains the provider's own state. Archive local work when finished; keep its links and history available.

## Native panel concept

Use one Ticket button adjacent to the existing Context/Toolbox controls. Proposed default placement is the existing right-side panel, with host styling. Exact placement needs a native prototype alongside the user's current layout.

```text
Ticket                                  +    …
[ This checkout ]  [ Watching ]
app · auth-refresh

Tasks                                  Link…
APP-421  Refresh login       In progress  ↗ ⧉
APP-438  Handle expiry       In progress  ↗ ⧉

Pull requests                          Link…
app #259 · Refresh authentication        ↗ ⧉
  CI       1 failed · 7 passed
  Review   Changes requested · 2 unresolved
  Updated  35 seconds ago

Needs attention
  × Integration tests failed             Open
  ↳ Review thread in session.ts          Open

[ Copy links ]                  [ Copy status ]
```

Rows open their source; a separate copy control copies the canonical URL without navigation. Hover may reveal details, but status words remain visible without relying on color. Expand a PR for individual checks and review threads. Keep identifiers and useful titles visible; put full paths in secondary detail.

**This checkout** is a focused work view. **Watching** is a persistent personal list across repositories, showing actionable changes first. It includes linked work by default and lets the user watch or unwatch unrelated items. Unwatching does not unlink a task or delete its history.

Avoid adding a mandatory Ticket-specific project or work bundle. Existing tasks, checkouts, and PRs are enough for the first version. If grouping becomes useful later, add it without making users duplicate their Jira structure.

## Important cases

| Situation | Proposed behavior |
| --- | --- |
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

**Copy links** defaults to the current checkout's explicitly associated task and PR URLs, deduplicated and grouped. Let the user select a subset. Do not include worktree paths, local service URLs, notes, or credentials by default.

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

## Later ideas

- Start work from a task: create/select a worktree, attach the task, optionally open its Space.
- Link suggestions from task keys in branches, PR descriptions, and provider relationships, with visible evidence.
- A small attention indicator on the Ticket button while the panel is closed.
- Read-only agent context command returning the current tasks, PRs, links, and freshness.
- Explicit Jira transitions, PR review requests, CI retries, and backlink publishing after the read experience works well.
- Optional release/deployment evidence from a provider that actually exposes it.

## Decisions to revisit after a prototype

- Is right-panel placement comfortable beside Context, or is an above-terminal tray better?
- Does Watching need desktop notifications, or is an in-app attention count sufficient?
- Should the next phase prioritize creating worktrees or richer inline review detail?
