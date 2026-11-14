# Ticket plan

## Status

Local core, required agent CLI, native panel, installer, and GitHub observation adapter are implemented. Build/tests and native/live GitHub verification pass. Phase 0 and Phase 1 are **partially delivered**, not complete: Jira/TWG is unverified, native cross-repo PR attention still needs broader live acceptance, and automatic link discovery remains planned. See [STATUS.md](docs/STATUS.md) for evidence and the remaining checklist. Phases 2 and 3 remain planned.

## Product direction

- Independent native Herdr mod named Ticket, consistent with Context/Rigs/Toolbox.
- Named Tickets contain multiple named repo/checkout mappings, similar to Rigs. Multiple checkouts of one repo are supported too.
- Focused filters Tickets by the current checkout; opening a Ticket shows all its mapped work. All and Watching cross checkouts.
- Many-to-many task/worktree/PR relationships, with direct task–PR links.
- Paste/open/copy source URLs as first-class actions.
- Initial connections through `gh` and Atlassian `twg`, configured once and reused.
- Provider-neutral core with URL-only fallback and future Linear support.
- CI and code review are the initial monitoring focus; task and PR states stay separate.
- Read-only agent context CLI is required in the first usable version, alongside the native panel. It returns complete Ticket context and explicit freshness without requiring Herdr to be open.

## Phase 0 — validate the experience and CLI contract

- Prototype the compact panel using fictional data and review its placement with existing mods.
- Confirm installed `gh` and `twg` versions/help, authentication checks, structured output, pagination, latency, and error behavior. TWG is not currently found on PATH; installation/authentication is future setup work.
- Test a selected Jira site's work-item reads and GitHub PR checks/reviews with existing authorized credentials.
- Verify focused checkout identity and deletion/recreation behavior using Git/Core evidence.
- Define exact adapter fixtures from sanitized observations; retain no tokens or private payloads in the repo.
- Validate the [agent CLI contract](docs/AGENT_CLI.md): checkout resolution, ambiguous matches, complete cross-repo context, cached reads, bounded refresh, and structured errors.

Exit: a reviewed interaction prototype and demonstrated provider reads with documented schemas and unresolved constraints. Do not claim Jira/TWG compatibility from reading documentation alone.

## Phase 1 — useful daily workflow

- Durable named Tickets, repo/checkout mappings, associations, watches, URL normalization, and generic link fallback.
- Connections reports existing gh CLI authentication without a Ticket login or setup step. Tracker site/project selection remains planned.
- Paste a task/PR URL to create or extend a Ticket; add multiple existing checkouts through named mappings.
- Native Focused / All / Watching views and expandable Ticket detail with Open, Copy links, and Copy status.
- `gh` PR observations and `twg` Jira work-item observations through capability-based adapters.
- Bounded background refresh, visible stale/offline/auth states, and actionable CI/review detail.
- Required read-only agent CLI for complete Ticket context: tasks, PRs, links, mappings, CI/review state, and per-source freshness. Support checkout discovery, explicit Ticket IDs, and bounded refresh with the panel/app closed. Local association commands can share its underlying service without making reads depend on writes.

Acceptance scenarios:

1. One named Ticket groups two Jira tasks, one worktree, and one PR; links and name survive restart.
2. One Ticket spans frontend/backend repositories and checkouts, with separate PR/CI/review states. Focusing either checkout reveals the complete Ticket.
3. Two tasks share a checkout with different PRs; no false task–PR links are inferred.
4. Switching focus filters the Ticket list; All and Watching retain work elsewhere. Multiple Tickets sharing a checkout remain selectable.
5. A failing check and requested review changes expose exact source links.
6. A PR gets a new head commit; stale checks are not presented as current success.
7. Missing/expired `twg` leaves GitHub and saved URLs usable, with clear freshness.
8. Removing/recreating a worktree does not lose task–PR history or silently reattach old work.
9. Two Spaces on one verified checkout share its links; different machines remain distinct.
10. Copy output contains only the selected source URLs/status and does not send anything.
11. Panel closure/reopen and app restart retain associations and resume observations.
12. A Ticket maps two different checkouts of the same repo without collapsing them. Renaming the Ticket preserves its stable ID and links.
13. Removing a mapping preserves task/PR history; archiving a Ticket does not delete checkouts or alter a Rig.
14. An agent in either mapped checkout reads the whole Ticket through versioned JSON with the panel/app closed; nested directories resolve the same checkout.
15. Several Tickets match the agent's checkout: return an explicit ambiguity result and candidate IDs; an explicit Ticket ID resolves it without using global UI selection.
16. A bounded CLI refresh succeeds for one provider and fails for another: return usable context, per-source timestamps/errors, and partial freshness without presenting cached values as newly observed. Cached reads work offline and never initiate provider calls.
17. Agent reads require no local association writes, tracker mutations, progress reports, or interactive authentication; missing login returns a structured connection issue.

Automated checks cover association integrity, URL deduplication, stale revisions, identity reuse, provider error parsing, head-SHA freshness, pagination, bounded refresh, read-only offline behavior, and copy selection. Captured edit targets are implemented in the panel; focus-change-during-edit still needs live acceptance. Native checks and live click-through verify the initial workflow; the remaining acceptance gaps are tracked in STATUS.md.

## Phase 2 — reduce manual linking

- Assigned-work search and provider-scoped filters.
- Suggested links from branch/task keys and remote relationships, with visible evidence.
- Start work from a task by selecting/creating a worktree and opening its Space.
- Native attention badge, event history, and optional notifications.
- Linear adapter based on its own verified capabilities.
- Optional references to Context/Rigs/Toolbox without taking over their state.

## Phase 3 — explicit actions

Consider task transitions, publishing backlinks, PR actions, and CI retries once monitoring is reliable. Specify exact targets, supported permissions, and failure/retry semantics before implementation. Automatic status synchronization is a separate product decision.

## Original planning milestone (completed before implementation)

The repository started as planning only. Implementation now adds an independent mod and CLI without changing other repositories, shipped mods, or layout files. The GitHub spike uses existing gh credentials and performs reads only. No tracker login, worktree creation outside disposable tests, provider writes, or development-service launches were performed.
