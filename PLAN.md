# Ticket plan

## Status

Planning repository created. Experience, CLI connection direction, relationships, and delivery phases are proposals. No application source, mod installation, provider integration, or live UI acceptance exists yet.

## Product direction

- Independent native Herdr mod named Ticket, consistent with Context/Rigs/Toolbox.
- Daily view follows the focused checkout; Watching crosses checkouts.
- Many-to-many task/worktree/PR relationships, with direct task–PR links.
- Paste/open/copy source URLs as first-class actions.
- Initial connections through `gh` and Atlassian `twg`, configured once and reused.
- Provider-neutral core with URL-only fallback and future Linear support.
- CI and code review are the initial monitoring focus; task and PR states stay separate.

## Phase 0 — validate the experience and CLI contract

- Prototype the compact panel using fictional data and review its placement with existing mods.
- Confirm installed `gh` and `twg` versions/help, authentication checks, structured output, pagination, latency, and error behavior. TWG is not currently found on PATH; installation/authentication is future setup work.
- Test a selected Jira site's work-item reads and GitHub PR checks/reviews with existing authorized credentials.
- Verify focused checkout identity and deletion/recreation behavior using Git/Core evidence.
- Define exact adapter fixtures from sanitized observations; retain no tokens or private payloads in the repo.

Exit: a reviewed interaction prototype and demonstrated provider reads with documented schemas and unresolved constraints. Do not claim Jira/TWG compatibility from reading documentation alone.

## Phase 1 — useful daily workflow

- Durable associations, watches, URL normalization, and generic link fallback.
- One-time Connections flow; retain account/site/project selections.
- Paste a task/PR URL and attach it to an existing checkout.
- Native This checkout / Watching views with Open, Copy links, and Copy status.
- `gh` PR observations and `twg` Jira work-item observations through capability-based adapters.
- Bounded background refresh, visible stale/offline/auth states, and actionable CI/review detail.
- Shared versioned CLI for agents to read linked work and make explicit local associations.

Acceptance scenarios:

1. Two Jira tasks attach to one worktree and one PR; links survive restart.
2. One task spans two repositories/PRs, with separate CI/review states.
3. Two tasks share a checkout with different PRs; no false task–PR links are inferred.
4. Switching focus changes the checkout view; Watching retains the earlier PR.
5. A failing check and requested review changes expose exact source links.
6. A PR gets a new head commit; stale checks are not presented as current success.
7. Missing/expired `twg` leaves GitHub and saved URLs usable, with clear freshness.
8. Removing/recreating a worktree does not lose task–PR history or silently reattach old work.
9. Two Spaces on one verified checkout share its links; different machines remain distinct.
10. Copy output contains only the selected source URLs/status and does not send anything.
11. Panel closure/reopen and app restart retain associations and resume observations.

Meaningful automated checks should cover association integrity, deduplication, stale revisions, captured edit targets, identity reuse, provider error parsing, head-SHA freshness, and copy selection. Native checks and live click-through must verify the panel when implementation exists. No tests are needed for this documentation-only milestone.

## Phase 2 — reduce manual linking

- Assigned-work search and provider-scoped filters.
- Suggested links from branch/task keys and remote relationships, with visible evidence.
- Start work from a task by selecting/creating a worktree and opening its Space.
- Native attention badge, event history, and optional notifications.
- Linear adapter based on its own verified capabilities.
- Optional references to Context/Rigs/Toolbox without taking over their state.

## Phase 3 — explicit actions

Consider task transitions, publishing backlinks, PR actions, and CI retries once monitoring is reliable. Specify exact targets, supported permissions, and failure/retry semantics before implementation. Automatic status synchronization is a separate product decision.

## Scope of the first milestone

This repository starts with planning. No provider authentication, package installation, existing mod/layout modification, worktree creation, tracker writes, or service launches are part of this milestone. Next implementation step: the native experience prototype and read-only provider spike.
