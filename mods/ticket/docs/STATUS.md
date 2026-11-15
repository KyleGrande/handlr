# Implementation status

Core verified on 2026-11-12 America/Chicago (2026-11-13 UTC); cloned-layout installation verified on 2026-11-13 America/Chicago. This is a working local implementation, with Phase 0/1 acceptance still incomplete. Phases 2/3 are planned.

## Delivered

- TypeScript local core and CLI; no runtime npm dependencies. Versioned JSON for results/help/errors with documented exit codes.
- Durable named Tickets, named mappings, multiple checkouts per repository, shared checkouts across Tickets, URL normalization, explicit relationships, independent watches, rename/archive, and local association removal.
- Atomic persistent store outside mod code with validation, restrictive file permissions, exclusive writer lock, revision conflict detection, and cache merge that preserves concurrent edits.
- Machine-qualified local checkout verification from permanent Core identity plus Git/filesystem lifetime evidence. Nested CWD resolution, fail-closed identity errors, candidate IDs on ambiguity, and archived reads by explicit ID.
- Headless cached reads without provider calls or local writes. Explicit deadline-bounded refresh with independent timestamps/errors, retained cached payloads, current-head checks/reviews, and partial results.
- Verified GitHub PR adapter automatically using gh's existing active authentication, without a Ticket login or saved connection requirement. Immutable PR/repository node identities, lifecycle, head SHA, checks, review decision, individual reviews, paginated review threads, and source links. Provider text is data; no provider write commands exist.
- Independent native GPUI window: Focused / All / Watching, captured edit targets, create/rename/archive, add/remove mappings and source URLs, explicit relationship selection, check/review/thread details, source Open/Copy, subset links/status copy, and explicit agent read command.
- Connections capability display and automatic gh account detection; no login/account input. Optional 60-second watched refresh while the mod copy is alive (including hidden layout-owned copies); cached panel polling every 5 seconds. No daemon is installed.
- Installer adds only its own mod and CLI symlink, refuses unmanaged collisions or local code edits, and leaves shipped files and layout choices intact.
- Optional layout installer clones the running compatible workspace and its toolbar through Herdr's clone commands. Installed `ticket-workspace` based on `toolbox-workspace`, with its own `ticket-workspace-tabs`, Ticket toolbar button, and docked right panel. Source layout and toolbar bytes were verified unchanged; host-managed click settings were copied by the clone API.

## Evidence

`npm run build` and `npm test` pass. The automated suite uses disposable Git repositories/worktrees and a temporary Core identity file; provider fixtures are synthetic contract tests and are not claimed as live Jira/GitHub integration evidence. It exercises cross-repo/many-to-many relationships, explicit task–PR edges, nested lookup, ambiguity, repeated checkouts, deletion/recreation, machine changes, atomic revisions/corrupt storage, URL/copy selection, provider failures, pagination, deadlines, head changes, offline CLI reads with provider tools absent, and concurrent local edits.

The 2026-11-13 fixes also cover gh reuse with no saved Ticket connection, active-account changes despite a legacy reference, read-only automatic authentication detection, and native Ticket collapse while a read is pending. Clicking an expanded Ticket now closes it, and older asynchronous responses cannot reopen or replace a later selection. The suite has 18 passing checks.

The updated installed mod passed the native checker and rendered in the existing `ticket-workspace` layout without host errors. The live GitHub spike succeeded with an empty connection list, and `doctor` detected the existing gh account. Automated view-controller coverage verifies open/close and pending-response races. Native pointer verification of this update was unavailable because the computer-use tool returned `noWindowsAvailable` on click; no successful pointer test is claimed for this fix.

`herdr-app check build/ticket` passes against the installed declarations and native runtime. The first sandboxed attempt could not access macOS graphics services; the approved native checker passed. The installed Ticket mod is separate from Context, Rigs, and Toolbox. `herdr-app status` showed the existing `toolbox-workspace` layout, Ticket overlay, and no errors.

Live native click-through created a **Herdr Ticket** grouping with this repository's real GitHub source URL, saved a `ticket` checkout mapping, showed its verified identity and Focused match, copied the source URL and verified it by pasting into the URL input, and verified the existing GitHub account from Connections. The grouping remains available locally. No fictional issue or PR was attached to it. The Connections UI correctly reported `gh: installed · TWG: missing`.

Installed `gh 2.97.0` help and real sanitized output were verified. `scripts/live-spike.mjs` read an existing authorized PR using the implemented adapter: all four sources were fresh, with 12 checks, 6 reviews, and 5 threads. A separate real query demonstrated review-thread pagination. Only schema/health/counts were printed; private response payloads and credentials were not committed. This proves GitHub source reads, not Jira compatibility or every native PR-detail path.

## Still planned / not claimed

- TWG installation/authentication, site/project selection, verified Jira work-item commands/output, tracker observations, and tenant access. Jira/Linear/GitHub issue URLs currently retain local links with unknown/unavailable provider state.
- Remote checkout identity/transport. Core must have a readable permanent identity file; an explicit Ticket ID needs neither running Core nor available Git. Filesystems without reliable birth time fail closed. Checkout moves require explicit remapping.
- Assigned-work search, branch/task suggestions, creation of worktrees, notifications, attention history, and optional links to other mods (Phase 2).
- Provider transitions/comments/merges/CI retries (Phase 3). None are authorized by a local link/watch or implemented as automatic actions.
- Other layout topologies beyond the verified workspace tab bar and side-panel stack. Docking is delivered through an independent clone, leaving the source layout untouched.
- Advanced provider backoff, cross-process in-flight request deduplication, verified URL-alias consolidation, and a background daemon. Normalized URL linking deduplicates identical source routes. Verified aliases can share a remote identity while retaining their local IDs; refresh never rewrites memberships, relationships, or watch choices. Each bounded refresh deduplicates auth checks within that invocation; multiple independent CLI invocations can refresh the same PR.
- Full live acceptance for cross-repo PRs, focus changes during editing, hidden-panel polling, PR source Open actions, restart of the entire app, and review/CI changes over time. Automated core coverage does not replace those UI checks.

## Operating notes

Run `herdr-ticket help` for exact commands. All reads return JSON, even errors. Use `herdr-ticket read` from this checkout, or select a stable ID explicitly. Reopen Ticket with `herdr-app do mod.open --name ticket` (toggles the window). Background watching runs only while a mod copy lives; CLI refresh works independently after the app exits.

`HERDR_TICKET_STORE` selects an isolated store; `HERDR_TICKET_CORE_ID_FILE` selects a non-default local Core identity file. Native builds read declarations from `HERDR_APP_HOME`. No generated declarations, stores, tokens, or provider payloads belong in Git. The pre-existing untracked `layout-backups/` directory was left untouched.

## Native styling update — 2026-11-13

Ticket now follows the installed Context/Toolbox panel styling: theme-backed
background and border, 10px outer corners, a 42px header, 13px base typography,
compact settings/add icons with tooltips, and the same segmented RadioGroup
scope control. Ticket rows use the compact selected-row treatment from Rigs.
Inputs have explicit theme-backed backgrounds and borders, labels, and matching
30px sizing. Secondary actions wrap, long source URLs truncate with tooltips,
and forms share the scrollable content area so they remain reachable in short
or narrow panels.

`npm run build`, all 14 existing tests, and native checks for both the build and
installed Ticket mod passed. The managed Ticket installation was updated without
changing the layout or the other mods. Live screenshots verified the docked
Ticket with a real saved mapping/source and the Connections form; this is visual
verification of styling, not additional provider integration evidence.


## Handlr UI branch — 2026-11-13

On `handlr-ui`, Ticket detects its own Handlr workspace panel through the optional
host `panel()` API. Docked and floating workspace copies use the host's frame and
title instead of drawing a duplicate border/header. Content padding is 8px, and
New Ticket/Connections share the scope toolbar, outside the native drag grip and
float/dock controls. They remain reachable with No Headers. Outside a workspace,
or on older Herdr hosts without `panel()`, the existing standalone frame remains.
The manifest declares a panel button so Handlr can offer Ticket in its panel
picker and command palette.

Validation: build with the installed Herdr declarations and all 18 existing tests
passed; `herdr-app check build/ticket` passed. The native build also passed with
Handlr's declarations, and the installed Handlr binary passed `check build/ticket`.
These native checks render the standalone view; live docked/floating appearance,
narrow widths, and No Headers have not been visually verified for this branch.
No mod was installed and no running layout or Ticket data was changed.
