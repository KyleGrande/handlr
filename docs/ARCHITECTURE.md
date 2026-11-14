# Proposed architecture

The core, headless CLI, GitHub adapter, and native panel are implemented in TypeScript. This document retains the target architecture; [STATUS.md](STATUS.md) distinguishes delivered behavior from planned integrations. Installed gh 2.97.0 help and live output were verified on 2026-11-12 (local date). TWG remains absent and unverified.

## CLI connections

Use `gh` for GitHub and `twg` for Atlassian both during connection setup and as the initial background transport. This is the proposed interpretation of “one-time setup”: sign in and select defaults once, then reuse the connections during normal operation. Ticket does not copy tokens into its registry.

Atlassian documents browser-based `twg login` with locally reused credentials. See [authentication](https://developer.atlassian.com/platform/teamwork-graph/twg-cli/getting-started/how-authentication-works/) and [installation](https://developer.atlassian.com/platform/teamwork-graph/twg-cli/getting-started/installation/). Ticket should inspect installed help/version and test access before declaring a connection ready. Organizational policy can restrict available operations; see [permissions](https://developer.atlassian.com/platform/teamwork-graph/twg-cli/getting-started/configure-permissions/).

The [TWG catalog](https://developer.atlassian.com/platform/teamwork-graph/twg-cli/commands/commands-catalog/) documents Jira work-item get/query commands. Evaluate those for normal task reads. Graph traversal is an optional discovery layer; it must not be required for maintaining Ticket's local relationships. Measure permissions, availability, and costs before choosing discovery commands. No unverified TWG JSON flags or task-key argument syntax are specified here.

GitHub's [auth status](https://cli.github.com/manual/gh_auth_status), [PR view](https://cli.github.com/manual/gh_pr_view), and [PR checks](https://cli.github.com/manual/gh_pr_checks) provide starting points. Use structured output and, where necessary, `gh api` for review threads and more detailed observations. Treat CLI exit codes according to the command: failed/pending CI observations must not become generic connection errors.

Current local discovery: `gh` is present and authenticated; `twg` was not found on this shell's PATH. No tracker login, installation, or account change was attempted. The implemented GitHub adapter uses `gh pr view --json` for metadata and paginated `gh api graphql` for head-bound checks, reviews, and threads. It rechecks the head after refresh and uses gh's active authenticated account directly, without requiring a saved Ticket connection. Legacy saved account references do not select credentials or block account changes in gh. GitHub issues currently use URL-only fallback.

## Provider adapters

Separate the product model from the transport. Proposed capabilities:

- Resolve a pasted URL to a typed item or preserve it as a generic link.
- Read task title, native status, assignee, and canonical source URL.
- Discover assigned work or search within selected projects, if supported.
- Read PR state, head commit, checks, reviews, and thread summaries, if supported.
- Return connection health, pagination, permission limits, and observation timestamps.

Adapters report supported capabilities. Missing search support does not prevent linking a URL. Linear initially works as a plain link and later gets a dedicated adapter; no assumption that TWG supplies it. CLI adapters can later be replaced with direct API adapters without changing stored relationships or UI behavior.

Use GitHub observations as the primary source for GitHub PR status. A graph-discovered duplicate should contribute relationship evidence, not become a second PR or override fresher GitHub status.

## Durable relationships

Use ordinary versioned records and an edge table; a graph database is unnecessary for the initial implementation.

| Record | Identity and purpose |
| --- | --- |
| Ticket | Stable local UUID, mutable name, active/archived state, and related work; analogous to a named Rig instance. |
| Checkout mapping | Stable mapping ID within a Ticket, named role, repository reference, and concrete checkout reference. Several mappings can use different checkouts of the same repository. |
| Task | Internal UUID plus provider, host/tenant, and stable remote ID; display key and URL are mutable attributes. |
| PR | Provider host, repository identity, and PR identity; preserve canonical URL and head SHA. |
| Checkout | Internal UUID plus Core machine identity, repository identity, and verified Git worktree metadata/path. |
| Association | Typed endpoints, relation, manual/discovered origin, evidence, confirmation state, and timestamps. |
| Watch | User's independent decision to keep an item in Watching. |
| Snapshot | Provider observation, freshness, connection health, and last successful payload. |
| Connection | Provider, selected account/tenant, executable reference, and defaults; no token copy. |

Ticket membership groups tasks, checkout mappings, and PRs. Within that grouping, relations include task ↔ checkout, PR ↔ checkout, and task ↔ PR. A generic link can attach to any item. Group membership does not imply every task applies to every mapping or PR. Association removal is local and does not mutate the provider. Confirmed links and candidate suggestions are distinct.

Repository and checkout records are reusable references. The same checkout can participate in several Tickets; unlike Rigs' running-stack reservations, Ticket grouping grants no exclusive claim or process ownership. Removing a mapping preserves remote items, direct task–PR history, and independent watches. Archiving a Ticket does not stop a Rig or delete any checkout.

Task ↔ PR is explicit: two tasks sharing a checkout do not prove that every PR addresses both. Stable external IDs prevent task-key reuse or repository naming collisions. Preserve URL-only items until resolution succeeds. The current implementation normalizes/deduplicates source routes at link time and records verified remote identities during refresh. Consolidating distinct aliases is planned as an explicit local edit; refresh must not rewrite associations or watches.

Checkout paths and branch names are locators, not sufficient lifetime identities. A deleted/recreated worktree at the same path must not silently inherit previous work. The spike must establish what Git/Core evidence can verify and require explicit repair when ambiguous. Store machine qualification so identical paths on different machines remain separate.

The active Herdr Space selects context, but does not own Tickets or task–PR relationships. Resolve the focused checkout from terminal CWD, including subdirectories; use the Space folder only when no terminal CWD is available. Focused returns all Tickets with a matching mapping, and each Ticket detail loads its complete set of mappings and linked work. Two Spaces using the same verified checkout see the same matching Tickets. If identity cannot be verified, show an unresolved state instead of switching to an assumed checkout. Keep explicit Ticket selection by stable ID; asynchronous focus changes must not redirect edits to another Ticket.

## Refresh and attention

Run provider reads outside native rendering through a shared CLI/service layer. Deduplicate requests per connection and remote item. Cache immediately and refresh in the background. Start with bounded polling; tune intervals after measuring actual CLI latency and provider limits. Avoid one indefinite watch subprocess per PR.

Continue polling watched work while the panel is hidden when the host permits it. Phase 1 need not run a daemon after Herdr exits: refresh watched items on reopen. Back off on rate limits and connection failures; one broken provider must not block the others.

Keep native task status, PR lifecycle, CI, review decision, unresolved threads, and deployment evidence separate. Use current-head evidence; checks or approvals associated with an older commit must not silently certify a new one. Where provider rules or access leave merge readiness uncertain, say so.

Attention events are deduplicated by remote item and meaningful state transition. Do not emit a new event on every poll. Freshness is per source; stale success must not look current. Removed/private resources retain local links with an unavailable state until the user removes them.

## Local/native boundary

Follow the existing repos' TypeScript plus native GPUI pattern. Read installed host instructions/declarations before writing native code. Share validation, storage, and provider behavior between the panel and the required v1 agent CLI. Build the headless context reader and provider refresh path as part of the core, then expose the same data in the native panel. The CLI must not depend on panel selection, native rendering, or a running Herdr app. See [the agent CLI contract](AGENT_CLI.md). Persist associations outside mod code using atomic writes, revision checks, and captured edit targets.

Use explicit executable/argument arrays and parse structured outputs. Never interpolate pasted URLs or task content into shell commands. Validate navigable URL schemes. Imported titles/descriptions are display data, not instructions. Bound retained payloads and diagnostics; avoid collecting credentials or unnecessary private descriptions.

### Implemented local identity and persistence

The CLI reads the permanent `core.id` from `~/.local/state/herdr-core/default/core.json` (or `$XDG_STATE_HOME` / `HERDR_TICKET_CORE_ID_FILE`) without contacting or starting Core. Git supplies the canonical checkout, admin directory, and common directory. SHA-256 fingerprints include Core ID, canonical paths, filesystem device/inode, and nanosecond birth time of the checkout and Git directories. Missing lifetime evidence fails closed. Branch is display metadata. Moving or rebuilding a checkout requires explicit mapping repair; no remote-machine support is claimed.

The store uses schema version 1, atomic rename, fsynced temporary files, a single exclusive writer lock, integrity validation, and optional expected-revision checks. Reads do not acquire locks or create files. Cache results merge into the latest state after provider latency, preserving concurrent local edits. A crash-held lock is never silently stolen; inspect its PID and remove it only after verifying its writer is gone. Native edits capture Ticket ID and revision at form open. Paths and local identities are excluded from copied link/status output.

Credentials remain on the connection host. For remote checkouts, resolve Git metadata on their owning Core while provider reads can run on the locally authenticated host. Connection placement and remote identity support need verification before claiming remote support.

Ticket does not own service lifecycle, notes, or tool execution. Future worktree creation should use a clearly defined Git/Herdr integration rather than borrowing Rigs' process ownership. Future external writes require an explicit user action and a visible target; observing a merge does not authorize transitioning Jira or posting a comment.
