# Agent context CLI — required in v1

This is a proposed contract, not an installed command. Agent access ships with the first usable Ticket implementation. It is a primary interface alongside the native panel.

## Proposed commands

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

`--timeout` is proposed in seconds, with a default of 20 for refresh. For `read`, explicit Ticket ID and explicit checkout selectors are mutually exclusive. With neither, use the caller's CWD, including nested directories. `list --checkout` discovers matches for that checkout; `list` without a filter lists active Tickets.

## Context resolution

- Verify the caller's actual checkout identity; never use global Herdr UI selection, display name, or branch name alone.
- Exactly one active Ticket matches: return that Ticket's complete context across all mappings.
- Multiple match: return `ambiguous_ticket` with candidate IDs/names so the agent can select explicitly.
- None match: return `no_matching_ticket`; do not substitute an unrelated Ticket. Unverified checkout identity gets its own structured error.
- Explicit Ticket ID resolves directly, including archived Tickets, without requiring a present checkout or a running Core. Include archive state and unavailable mappings.
- The panel's **Copy agent read command** includes the installed executable path and explicit stable Ticket ID.

The initial headless CLI runs on the host with access to Ticket's local store. A remote agent needs an explicit supported way to invoke that host or access the store; copying the CLI to a remote machine alone does not provide shared context. Remote transport remains a separate integration concern.

## Returned context

All results, help, and errors use a documented versioned JSON envelope. Proposed top-level fields: `schema_version`, `ok`, `data`, and `error`. Successful reads include:

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

Return exit 0 when usable Ticket context was resolved, including partial/stale context; agents must inspect completeness/freshness. Return nonzero with a structured error for invalid arguments, ambiguous/missing targets, identity failures, or unreadable storage. Document exact nonzero codes during implementation and keep them stable within a schema version.

Reads never start an interactive login flow. Missing credentials or tools appear as connection issues with a reconnect/setup hint. Reading requires no writing of progress, association changes, or task transitions. Credentials and tokens are excluded from output and diagnostics. Imported task descriptions remain context data, not instructions.

## Delivery requirement

Validate the CLI alongside the first native panel, including headless/offline reads, nested checkout discovery, ambiguity, multiple repositories, archived Tickets, partial refresh, and current-head freshness. Do not defer it to an enhancement phase or claim it works based only on a mocked panel.
