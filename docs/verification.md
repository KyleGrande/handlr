# Current verification — 2026-11-10

## Remove manual refresh controls

- Removed the sidebar refresh icon and the preview Refresh button. Sidebar polling and refresh after actions remain automatic. Reopening a preview loads its current plan. Updated popup recovery text accordingly. Generated and synced without tests/native checks at the user’s request.

## Static status and scoped hover controls — latest update

- Replaced animated running status with theme-green static dots. Added hover-only Start/Stop/Restart controls to rig and service rows and removed the separate stop-services line. Clicking names still opens preview/output independently of the controls. Rig names use prominent text with a gray single-worktree/branch label or a compact checkout count.
- Added CLI service targeting (`up|down|restart --service`) and restart support. Service start includes the declared prerequisite closure; service stop leaves other processes running. Restart holds the rig lease across stop/start and retains reservations until replacement or explicit down. Partial launches retain conservative whole-profile reservations. The existing labels/address ownership checks, durable launch intents and rollback filtering remain in use.
- Explicit sidebar Start/Restart clicks approve the saved configuration and launch without opening Preview. Missing decisions remain errors; no values are fabricated.
- The user requested speed and skipping checks. This update was generated and installed without running tests, type checks, native checks, or service launch/stop verification. The earlier evidence below does not validate these new lifecycle paths.

## Rig preview popup and status-icon update

- Rig-name clicks now open a centered native preview popup. Removed the separate Preview action and inline sidebar plan. Save and preview opens the same popup. The popup keeps review decisions, refresh/error handling, a scrollable plan, an explicit launch footer, and independent Close/Escape dismissal. Opening/closing has no service lifecycle action.
- Status indicators reuse the Agents spinner asset, 900ms native animation, idle ring, done dot and compact warning styling with matching theme colors. Rig/service tooltips state the specific lifecycle or health condition. No shipped Herdr files were edited. Custom mod installation names are propagated when opening preview overlays.
- An intermediate implementation passed 20 unit tests and seven native render states before the final immediate-open and status-icon edits. The user then explicitly requested skipping checks. Final files were generated and synced without tests, type checks, native checks or interactive verification. The final popup/icon behavior remains unverified; earlier results below do not validate these latest edits.
- This repository had no commits. The user explicitly requested a commit; local machine-specific rig proposal JSON is excluded through .gitignore.

## Service-row output update

- Clicking the service header (icon, name or state) now opens its existing terminal with `terminal.peek`. Removed the separate **Live output** button. Headers without a terminal remain inactive with a no-output tooltip; endpoint links stay separate sibling controls, so they do not bubble into the peek action.
- Updated the agent guide, README and desktop acceptance instructions. Added native checker fixtures for service rows with and without terminal output.
- Fresh native checks passed for all six fixture states, the source mod and the installed mod; both TypeScript builds passed. Synced the update into the existing `rigs` installation. Herdr reports `rigs-workspace` with no errors. No rig launch/stop or layout mutation was needed. Native rendering is checked; an actual click opening the peek remains unverified. The earlier unit/live results below were not rerun for this UI-only change.

## Setup and agent-guide update — latest run

- Added the editable root `AGENTS.md` covering setup, profile rules, CLI commands, approval, ownership/recovery, demos, development and verification. `build:mod` packages it as `mods/rigs/AGENTS.md`; installation/sync adds exact local CLI and source-reference paths. The copied prompt is one sentence pointing to the installed guide with the selected checkout (or explicit demo context); workflow rules and exact CLI paths live in that guide.
- Setup now proposes defaults and saves an unapproved draft before launch approval, asking only about material uncertainty. Discovery distinguishes application commands, an optional compiler watcher and a successful `no_services` result; ordinary discovery excludes recognized demo/fixture scripts. Evidence remains heuristic and needs agent review, especially infrastructure references in documentation.
- Git validation supports unborn branches without changing history. The regression covers discovery, create, preview, approval, lookup, fake-Core launch/stop and unchanged Git HEAD/status.
- `approve --review` stores approval and reviewed notes in the registry. The fingerprint covers profile configuration, rig identity and checkout/branch metadata. Stale commands, branches and mappings reject launch before claims/processes. `setup.approved` alone no longer authorizes a discovered draft. Existing manual profiles without `setup` remain compatible until a recorded approval requires review to stay current.
- Drafts stay visible in the panel. Previews show editable review notes and **Approve and start**. Executable configuration changes still belong in the profile, followed by a fresh preview. The first-run control is now a compact **Agent Setup Prompt** row with a copy icon; checkout selection, demos and import live behind its **Setup options** gear.
- Added guarded `sync:mod` and separate CLI/native watchers. Sync updates only this checkout's installed mod and guide, preserving layouts. A temp-install regression verifies exact paths/guide packaging, layout preservation and refusal to overwrite an unrelated personal mod.
- Fresh `npm test`: **20 passing tests**. Fresh `npm run test:live`: passed the single fixture and concurrent mono/split stacks, ownership, labels, API bindings, duplicate-up behavior, checkout overlap/lookup, stable ports and stop isolation. Fixture launches were cleaned up.
- Fresh native mod build/type check and checker runs passed for the source and installed mod. The eager state harness checks onboarding, setup options/import, draft review with a blank decision, and approved portless/unborn previews. These render checks do not click approval or prove every async state.
- Ran `npm run sync:mod` into `~/.config/herdr-app/mods/rigs`. The new installed `AGENTS.md` and prompt helper are present. `herdr-app status` reports the existing `rigs-workspace` layout and **no errors**. A native screenshot confirms the Rigs sidebar remains present beneath Spaces and Agents. Layout files were not rewritten by sync.
- Native app observation is available now, but attempts to open the setup control through computer-use coordinates timed out; the compact setup row has checker evidence, not a completed native click-through. Full launch/peek/endpoint/polling and app quit/reopen acceptance below remains pending. No app quit/reopen was performed for this update. The crash harness was not rerun; its prior result below is historical.

The older evidence and acceptance audit below describe the preceding implementation and remain historical where superseded by this update.

The original PLAN.md scope remains active. The user additionally required TypeScript, a stacked left sidebar matching Spaces and Agents, Git initialization, and a first-run prompt for the user's existing agent rather than requiring a prewritten profile.

## Direct evidence collected

- `npm test`: 15 passing resolver/lifecycle/setup tests. These cover deterministic previews, canonical checkout lookup, detached HEAD, invalid references/cycles/directories, secret redaction, duplicate starts, checkout overlap, distinct concurrent rigs, stop isolation, accepted launch with lost response, unavailable Core, changed ownership labels, readiness rollback, configured external probes, external listener/data preservation, missing checkout repair, TCP origin/path derivation, cleanup with unavailable history, dependency degradation, setup for a non-Node project without a profile, and rejection of IDs that would disappear from JSON ownership maps.
- `npm run test:live`: passed on installed hc 0.1.19. A single HTTP fixture, then concurrent monorepo/multi-repo fixtures started through separate CLI processes. Verified parentless Core terminals, rig/service/launch labels, overlapping-checkout refusal, actual web-to-API binding, multiple named endpoints including port-only metrics, output, duplicate-up reuse, registry reopening, contributing-checkout lookup, stable restart ports, endpoint release and independent stop. All fixture launches stopped in `finally`.
- `npm run test:crash`: passed. A transport shim held a real Core launch response after acceptance. The test verified durable intent with no terminal address, sent SIGKILL to the actual CLI, recovered its stale lock, and retried. Exactly the same launch ID and terminal address were reused, with exactly one live worker; cleanup stopped it.
- `npm run build:mod` and `herdr-app check mods/rigs`: passed. Additional native checks eagerly rendered the first-run setup prompt, advanced profile-import, populated preview/service rows, persistent action-error display and draft-preview branches.
- `npm run install:mod -- --update`: installed the current generated TypeScript panel, helper module and personal `rigs-workspace` layout. Shipped files remain intact. The last `herdr-app status` observation reported this layout and no errors.
- A live screenshot confirmed stacked Spaces, Agents and Rigs sections with matching chrome background, small dim headers, compact actions and spacing. This proves the installed sidebar appearance, not the full service workflow.
- `git init`: reinitialized the existing repository. No commits or staging were requested; project files remain untracked.

## Requirement audit

| PLAN.md requirement | Current implementation / evidence | Result |
| --- | --- | --- |
| One shared CLI/resolver for mod, shell and agents; versioned structured JSON | `src/cli.ts`, native panel `call`, unit and separate-process live tests | Verified for tested operations |
| Durable immutable rig, service and launch identities, explicit repo/worktree links | Registry definitions, saved `checkout_bindings`, Core labels and crash test | Verified |
| Commands, directory confinement, endpoints, environment bindings, independent readiness DAG | Resolver and tests, single/mono/split fixtures, CORS/API target checks | Verified |
| Preview does not claim or launch; proposed vs allocated endpoints | Resolver test and registry state; plan/status assignment labels | Verified through CLI; panel click-through pending |
| One active rig per canonical worktree, atomic port/checkout reservations, stable ports | Registry lock, cross-process fixture starts, overlap and port-conflict tests | Verified |
| No ownership of manual/external processes; down preserves checkouts and data | Ownership label tests, external listener/data test, independent real fixture stop | Verified |
| Parentless foreground terminals; startup readiness, rollback only current invocation, retained unknown claims | Real Core, crash test and failure tests; diagnostics no longer prevent cleanup | Verified for tested failure modes |
| Secrets from local sources, no managed secret values in argv/state/previews/status | Resolver launch environment and redaction test; native output is application-controlled | Verified for declared sources; arbitrary user literals are not inferred as secrets |
| Active rigs, stopped definitions, repo/branch labels, service endpoints, actual API target, output | Native implementation, status contract and real CLI fixtures | Implemented; full live panel interaction still unverified |
| Checkout lookup through every contributing checkout, repeated branch names, detached/missing roots | Real mono/split lookup plus detached/stale/repair tests | Verified through CLI; branch-tree/panel action pending |
| Core unavailability retains last-known endpoints and ownership | Unit test and status code | Verified through CLI; unavailable panel state not exercised interactively |
| Refresh on open/actions; bounded polling only while shown | Init/action refresh and five-second timer; installed node ID checks hidden ancestors/inactive stack children | Implemented; live visibility behavior still needs interaction verification |
| App quit/reopen preserves running services and terminal addresses; stop one while another remains | Core-owned terminals and registry reopening tested | Actual app quit/reopen remains unverified |
| Assisted setup using scripts, framework config, environment examples and dev docs; user decides shared data | `src/init.ts` evidence discovery, draft review gate, setup tests; `+` now copies a prompt for the user's existing agent | Implemented and eagerly rendered; actual copy/paste/agent conversation not exercised |
| First compatibility target hc 0.1.19 / herdr-app 0.1.14 and passing native checker | Installed versions inspected, Core live tests and native checks | Verified |
| Local loopback only; remote/shared-rig/reboot recovery excluded | Profile endpoint resolution to 127.0.0.1; external URLs remain externally owned | Implemented |
| User's stacked styling, TypeScript and Git requests | Installed layout/render observation, TS source/build, git init output | Verified |

## Latest implementation corrections

- Action errors now have their own state, so a successful background refresh cannot erase a failed preview/create/start message. The user can dismiss them explicitly.
- Previews present checkout/branch, command arguments, endpoints, environment bindings, readiness order/checks and data scope as labeled fields. Incomplete setup reviews do not offer Start; CLI validation remains authoritative.
- Focused-checkout suggestions reject remote machine contexts for this local-only release. Portless services explicitly report that no readiness check is configured.
- Added `npm run prepare:desktop` and [DESKTOP_ACCEPTANCE.md](DESKTOP_ACCEPTANCE.md) for reproducible native acceptance without creating or starting rigs automatically.

## Remaining acceptance work

1. Exercise actual native `+ → Copy setup prompt`, advanced import, preview, start, endpoint-open, terminal-peek and stop flows with both fixture rigs, including service rows and large plans at sidebar widths.
2. Verify hide/show polling and immediate return behavior in the actual app.
3. Quit and reopen Herdr with both fixtures running, verify identical terminal addresses and outputs, then stop one and prove the other still runs.
4. Complete the requirement-by-requirement audit using those direct UI observations. Source code, an eager checker and CLI registry reopening do not prove these desktop behaviors.

Computer-use discovery found Herdr running, but selecting the app returned **“Computer Use was not approved to use Herdr.”** No native clicks or quit/reopen were attempted through another automation mechanism. The goal cannot be called complete until the remaining desktop gates have evidence.

Herdr computer-use access was rechecked during the continuation and remained denied. The user replied that they will enable access; that response authorizes the work but does not prove the tool permission has changed. Await actual access before native interaction.
