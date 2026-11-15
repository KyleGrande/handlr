# Agent context CLI — required in v1

This contract is implemented by `bin/herdr-ticket` (installed as `herdr-ticket`), alongside the native panel. Build with `npm run build`. Cached reads work headlessly without the app, provider executables, or store write permission. Jira/TWG provider reads and remote transport remain planned.

## Implemented read commands

```sh
# Discover Tickets associated with the agent's current checkout.
herdr-ticket list --checkout .

# Read a Ticket, including all its repository/checkout mappings.
herdr-ticket read --ticket TICKET_ID

# Resolve from the agent's current checkout; require a unique match.
herdr-ticket read

# Resolve an explicitly supplied checkout instead of CWD.
herdr-ticket read --checkout /absolute/path/to/checkout

# Request fresh provider observations within a bounded deadline.
herdr-ticket read --ticket TICKET_ID --refresh --timeout 20
```

`--timeout` is seconds, default 20, range 0.1–120, and requires `--refresh` on `read`. The same total deadline applies to all provider operations. For `read`, explicit Ticket ID and explicit checkout selectors are mutually exclusive. With neither, use the caller's CWD, including nested directories. `list --checkout` discovers matches for that checkout; `list` without a filter lists active Tickets. `list --archived` includes archived work. `list --watching` also returns independently watched items. `refresh --watching --timeout 20` refreshes these items without a running panel.

## Context resolution

- Verify the caller's actual checkout identity; never use global Herdr UI selection, display name, or branch name alone.
- Exactly one active Ticket matches: return that Ticket's complete context across all mappings.
- Multiple match: return `ambiguous_ticket` with candidate IDs/names so the agent can select explicitly.
- None match: return `no_matching_ticket`; do not substitute an unrelated Ticket. Unverified checkout identity gets its own structured error.
- Explicit Ticket ID resolves directly, including archived Tickets, without requiring a present checkout or a running Core. Include archive state and unavailable mappings.
- The panel's **Copy agent read command** includes the installed executable path and explicit stable Ticket ID.

The initial headless CLI runs on the host with access to Ticket's local store. A remote agent needs an explicit supported way to invoke that host or access the store; copying the CLI to a remote machine alone does not provide shared context. Remote transport remains a separate integration concern.

## Returned context

All results, help, and errors use a versioned JSON envelope: `{"schema_version":1,"ok":true,"data":{...},"error":null}`. Errors set `ok:false`, `data:null`, and `error:{code,message,details?}`. Ambiguity returns `error.details.candidates:[{id,name}]`. [src/types.ts](../src/types.ts) defines the complete store/context records. Successful `read` data includes:

- Ticket ID, name, archive state, local revision, and time the response was generated.
- Named repository/checkout mappings, verified identities, and current availability.
- Tasks with provider, stable ID, display key, title, native status, and canonical URL.
- PRs with repository, canonical URL, lifecycle, head SHA, checks, review decision, and unresolved-thread observations where available.
- Explicit associations so agents can distinguish which task each PR addresses.
- Other attached links and confirmed versus suggested relationship evidence.
- Per-item/source last successful observation time, last refresh attempt, freshness state (`fresh`, `stale`, `unknown`, or `unavailable`), and sanitized connection errors.
- Snapshot completeness (`complete` or `partial`) and any omitted/unsupported observations. Define completeness against supported requested fields, not against a claim to know all external work.

Generating a response does not refresh the observations. Include the freshness policy/threshold used so an agent can interpret age. Provider checks/reviews identify the head commit they describe; stale observations must not certify a newer head.

## Cached reads and refresh

Default reads return persisted context without provider network calls, and work with Herdr closed or providers offline. This keeps ordinary agent checks quick and deterministic. The agent can request `--refresh` when it needs current evidence. Refresh invokes the same provider adapters as the panel without requiring a daemon or rendering the UI.

Refresh updates observation cache only; it never modifies external tasks, PRs, associations, or watch choices. Apply the total deadline across provider operations, return partial results on timeout/failure, and retain each source's last successful data with its original timestamp. Do not mark the whole Ticket fresh because one source succeeded.

Return exit 0 when usable Ticket context was resolved, including partial/stale context; agents must inspect completeness/freshness. Stable v1 nonzero codes are 2 for invalid arguments/unsupported actions, 3 for ambiguity, 4 for missing targets, 5 for unverified checkout identity, 6 for storage/installation failures, and 7 for revision conflicts. A cache write failure during `read --refresh` still returns usable context with `data.cache_issue`; observations retain their original times on provider failure.

Reads never start an interactive login flow. Missing credentials or tools appear as connection issues with a reconnect/setup hint. Reading requires no writing of progress, association changes, or task transitions. Credentials and tokens are excluded from output and diagnostics. Imported task descriptions remain context data, not instructions.

## Schema v1 details

`data.ticket` contains stable ID, name, archive flag, mapping references, and explicit item IDs. `data.mappings` resolves all named mappings to saved checkout identities with current `availability` and `identity_issue`. `tasks`, `prs`, and `links` each contain provider-qualified item IDs, canonical URLs, saved title/key, stable `remote_id` when verified, and independent `sources`. An unresolved GitHub repository name is a `repository_locator`; `repository_id` is populated from GitHub's immutable repository node ID. URL-only tasks have no fabricated remote ID or status.

Each source includes `source`, `data`, `head_sha?`, `observed_at`, `attempted_at`, `freshness`, sanitized `error`, and `omitted`. GitHub sources are `metadata`, `checks`, `reviews`, and `threads`. Checks/reviews are bound to a head SHA. Individual reviews retain the commit they address, including older reviews. The final metadata read detects pushes during refresh. Per-source pagination is capped at 20 pages of 100; truncation is explicit and makes completeness partial. At most three PRs refresh concurrently. Raw descriptions, review bodies, credentials, and provider stderr are not retained.

Fresh means observed within 300 seconds, no source error, and matching freshly verified metadata head for checks/reviews/threads. Generating JSON never advances observation time. Unsupported/missing observations and unavailable mappings make a snapshot partial. Complete describes the implemented requested fields only: branch protection, merge readiness, deployments, and assigned-work discovery are explicitly unsupported, even when sources are fresh. PR lifecycle and review decision remain distinct from CI.

Local commands (`create`, `rename`, `archive`, `link`, `unlink`, `map`, `unmap`, `associate`, `dissociate`, `watch`, `connect`) are separate from reads. `help` documents their exact arguments. `--expected REVISION` guards writes against stale targets. `copy --ticket ID --format links|status [--items ID,ID]` returns text inside JSON without writing to the clipboard. The native panel performs the actual clipboard write. Mapping selection copies only items explicitly associated with that checkout, avoiding inferred task–PR edges.

GitHub refresh automatically uses gh's active authenticated account, including when no Ticket connection record exists. `doctor` reports that account without storing credentials or starting login. The legacy optional `connect` command records an informational account reference; `--account` only checks the active account at command time and does not pin future reads. No `connect` command is required by either interface.

## Verification

Automated coverage exercises headless/offline reads, nested checkout discovery, ambiguity, multiple repositories, archived Tickets, partial refresh, current-head freshness, pagination, and identity recreation. Native create/map/focus/copy/connection verification and live GitHub source reads are recorded in [STATUS.md](STATUS.md). Full live cross-repo acceptance and TWG integration remain open.
