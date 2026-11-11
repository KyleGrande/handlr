<!-- Generated from the source AGENTS.md by npm run build:mod. -->

# Herdr Rigs

Rigs manages named, restartable development stacks. This repository contains the TypeScript CLI and a native Herdr sidebar mod. The CLI owns resolution, approval, reservations and lifecycle; the panel calls that same CLI. Services run in parentless herdr-core terminals and survive closing the panel or app.

This is a tooling project. It has no application server, database, cache or queue. `fixtures/` contains disposable demos, not services needed to develop Rigs. A compiler watcher is optional and has no managed port or browser URL.

## Sidebar creation and connected rigs

The **+** icon opens a native popup like Herdr's terminal menu. It contains **Agent Setup Prompt**, unique saved profiles, and **Import profile…**. The saved list combines profiles referenced by rigs with explicitly imported/previously used profiles retained in the registry; deleting the last rig does not discard its reusable profile. Copying the prompt only copies the guide pointer and current checkout. Selecting a profile opens a New rig dialog with a suggested unused name and editable worktree mappings; saving creates a stopped definition and opens its preview. Reusing a profile creates a distinct rig instance with its own launches and rig-scoped data. Import another profile by its absolute path. Loading a valid imported profile remembers it even if rig creation is cancelled.

Right-click a rig for **Edit rig…**, **Edit profile…** and **Delete rig…**. Preview also has Edit/Delete rig actions and a Profile section with Edit/Delete profile actions. Edit rig includes renaming, selecting another profile and changing concrete worktree mappings. Renaming retains the rig ID, ownership and current services and is allowed while running. Profile/worktree changes require every owned launch to be stopped/reconciled, clear obsolete allocation/approval/finished launch references and save without starting anything. Changing profiles requires an exact mapping for its repo slots. Rig deletion also requires stopped/reconciled ownership; it removes only the definition, retaining its profile in the saved list, checkouts and service data. Never stop a rig implicitly to edit/delete it.

Right-click a profile in the **+** popup to edit or delete it. The native JSON editor lists all referencing rigs, validates changes through the CLI, rejects stale revisions and requires referencing rigs to be stopped/reconciled. Shared repo slots/mappings must remain compatible; assign a rig a different profile first when changing that contract. Material changes invalidate launch approval. Configured fixed ports and ranges take precedence over incompatible saved port preferences. Profile deletion is a separate confirmed action that deletes the actual file and saved-list entry; refuse while any rig references that canonical file, including via symlinks. Deleting a rig does not imply permission to delete its profile file. Missing unreferenced profiles can be removed from the saved list. Keep secret values out of editable profile literals and use secret source references.

Cross-rig links appear as **↔ peer-name** rows on both rigs while expanded. Collapsing a rig hides its links and services. They group matching service connections per peer, expose binding/address/state in a tooltip and open the peer's preview on click. Matching uses a structured `external` binding's URL authority and a unique endpoint reserved by another rig. Unmatched/ambiguous providers receive no invented rig link. A live link means both services are observed running and no configured external probe has failed; it does not prove traffic. Stopped peers without reservations are not guessed from proposed ports. Connections never transfer ownership or grant permission to stop providers. Checkout-filtered results retain connection metadata for peer rigs.

## Start here

- Read `README.md` for the version 1 profile format and lifecycle behavior. In an installed copy, use the absolute source checkout and README link in the installation context above.
- Read this guide when setting up, operating or changing Rigs. For native panel work, also read the running Herdr installation's `AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` under `HERDR_APP_HOME` (default `~/.config/herdr-app`). Those files describe the installed native API; Herdr rewrites them, so do not edit them.
- User instructions and decisions already made in the conversation take precedence over defaults here. Do not ask for the same permission twice.
- Make authorized draft work concrete before requesting launch approval. A valid selected checkout, suggested name or absence of infrastructure does not require a separate confirmation round.

## Set up a project rig

1. Use the selected/current project checkout. Resolve its canonical Git worktree root and show it in the preview. Ask for another path only if the intended project is ambiguous or invalid. A repository with no commits is valid; show its branch with “no commits.” Never create a commit or switch branches to make validation pass.
2. Inspect package scripts, framework configuration, environment-example variable names and development docs. Do not execute configuration, install packages or start services during discovery. `rig init --checkout <path> --output <new-profile.json>` writes an unapproved proposal and evidence list without reserving ports or checkouts. It refuses to overwrite an existing output file.
3. Separate application servers from optional development tools and explicit demo fixtures. Use commands supported by project evidence. If no supported long-running services are found, report that result and any documented optional tools. Do not invent a web/API/worker stack or create an empty rig. A native-app monitoring rig may have no managed services when it declares `observed_apps`.
4. Choose a sensible unused project-based name and propose one concrete existing worktree for each repo slot. Write the profile, keep `setup.approved` false and put proposed choices in `setup.decisions`. `setup.questions` lists the choices requiring review. Remove irrelevant categories. Ask only about material uncertainty that affects commands, connections or data ownership; keep unresolved choices blank and explain them. Continue independent draft work while waiting.
5. Save the draft with `rig create`, then show `rig plan` (or click the rig name to open its preview popup): checkouts/branches, foreground command arguments, working directories, proposed ports, connections, readiness and data/output scope. Saving and previewing do not start processes or reserve resources.
6. Get explicit launch authorization. The sidebar's hover **Start** and **Restart** controls authorize the saved configuration without opening Preview. They obtain the current plan, record approval of its configured decisions and launch it. Missing required decisions cause an error; never invent answers. The preview remains available for inspection/editing, and its **Approve and start** action still works. For agent-driven CLI launches, show the concrete plan and obtain user approval, then run `rig approve <name> --review <fingerprint-from-plan>` and `rig up <name> --review <same-fingerprint>`. Do not approve or launch without an explicit user action or authorization.
7. After launch, show actual URLs from status if there are endpoints. Explain clicking the rig name to open its preview popup, clicking a service row to open its live output, and the hover Start/Stop/Restart controls at rig and service level. Service rows with an existing terminal open a peek; rows without one do not start anything. The status dot is always rightmost. HTTP open-URL arrows sit immediately to its left, outside the hover-only lifecycle controls, and appear only while the service is running with allocated endpoints. They are separate actions; hover for the address, click an allocated running HTTP endpoint to open it. TCP and metrics endpoints have no sidebar icon; their configuration and addresses remain in Preview. The mod enforces this presentation policy without removing endpoints from the profile. Raw endpoint/environment URL lines are not shown beneath service rows; connections remain inspectable in Preview. A portless watcher uses state and output; it needs no fake HTTP readiness check.

A disclosure chevron beside each rig expands/collapses its services and endpoint details. Collapse is remembered per rig across reloads, leaves the aggregate status and rig controls visible, and never changes service lifecycle. Clicking the rig name is separate from folding.

Rig names open a centered native preview popup; there is no separate Preview button or inline sidebar preview. The full service header bar (name, whitespace and status) opens its output peek when a terminal exists. The full rig header bar opens Preview. Disclosure and lifecycle/endpoint controls stop click propagation so their actions do not also open a peek/preview. Each row has hover-only Start/Stop/Restart controls alongside a quiet status indicator. Rig controls act on the whole stack; service controls act only on that service. Service start also starts declared readiness prerequisites, while stopping a service leaves consumers running with degraded dependency status. Restart holds the rig lease across stop/start and retains reservations until replacement or explicit stop/reconciliation. Partial stacks conservatively reserve the full profile's ports/checkouts until their last owned launch stops. These controls never stop external providers.

Use static theme-colored dots: green for running, warm-colored for transitions/attention and gray rings for stopped/draft. No animated status spinner. Status tooltips retain readiness/health distinctions. Stopped/unstarted services are not degraded because dependencies are stopped; dependency degradation applies to running consumers, and external probes are not checked for stopped consumers. Style individual rig rows like Space entries: 30px height, 8px horizontal padding/corners, 9px icon gap, regular inherited 13px foreground names (no semibold or muted name), and a right-aligned 11.5px dim service/checkout summary. Use the selected theme fill for the selected row. This is separate from the 11.5px section heading. Each component row carries its repo/worktree, branch and app-directory context in gray, with full paths in its tooltip. Full slot mappings belong in the preview and tooltip. A rig instance owns its service processes; the profile is reusable configuration, and `app` is only a logical repo slot. Distinct worktrees may use separate rig instances of the same profile.

Review decisions are notes about the displayed configuration, not executable configuration edits. Change commands, bindings, ports and data scope in the profile, then close and reopen the preview. Approval is bound to the profile, rig identity and concrete checkout/branch metadata. Material changes invalidate it. Port ranges are reviewed configuration; exact free-port observations are proposals until allocation. Secret source references are reviewed; secret values are never part of approval or previews.

## Commands

Use the exact executable/module paths in the linked installed guide’s installation context. The copied prompt is a one-sentence pointer to that guide plus the selected checkout or explicit demo request; keep workflow rules here instead of duplicating them in the clipboard text. From this source checkout, run `npm run build` first and use `./bin/rig`.

```sh
./bin/rig init --checkout /absolute/project --output /absolute/new-rig.json
./bin/rig create project-dev --profile /absolute/new-rig.json --repo app=/absolute/project
./bin/rig plan project-dev --json
# Only after the user approves that preview:
./bin/rig approve project-dev --review <fingerprint-from-plan>
./bin/rig up project-dev --review <same-fingerprint>
./bin/rig status project-dev --json
./bin/rig status --checkout /absolute/project/subdirectory --json
./bin/rig logs project-dev compiler --json
./bin/rig down project-dev
# Target one service (start also includes its declared prerequisites):
./bin/rig up project-dev --service compiler
./bin/rig down project-dev --service compiler
./bin/rig restart project-dev --service compiler
# Repair a mapping only after stopping:
./bin/rig configure project-dev --repo app=/absolute/moved-project
# Inspect and edit an instance (renaming alone is safe while running):
./bin/rig show project-dev
./bin/rig configure project-dev --name project-feature
# Delete only a stopped/reconciled definition; preserve its profile/data:
./bin/rig delete project-feature
./bin/rig profile list
./bin/rig profile show --profile /absolute/profile.json
./bin/rig profile import --profile /absolute/profile.json
# Use revision from profile show; the input is edited JSON, not an executable:
./bin/rig profile update --profile /absolute/profile.json --input /absolute/edited.json --revision <revision>
./bin/rig profile delete --profile /absolute/profile.json --revision <revision>
```

All operational responses are versioned JSON (`schema_version: 1`), including errors. Check the exit code and `outcome`. An `init` outcome of `no_services` is a successful discovery result; its empty proposal needs a documented service before `create`. `RIG_HOME` selects the registry, defaulting to `~/.local/state/herdr-rigs`. Use a separate temp registry for automated tests; never erase the real registry to recover from an error.

Profiles without `setup` remain usable through explicit `up` for existing manual integrations. The panel approves the current configuration when the user explicitly clicks Start/Restart or Approve and start. Once a rig has a recorded approval, later starts require that approval to remain current.

## Profile rules

Match the Spaces section header: 31px height, 16px left/10px right padding, regular 11.5px dim text, and right-aligned 26px icon controls. Native `.child(...)` requires an actual element, string or entity; never pass null for missing endpoints. Use conditional `.when(...)` children for portless services.

Profiles declare service commands, endpoints, ports and bindings; the mod enforces all row layout, icons, controls and click behavior. Do not add presentation fields or ask setup agents to format URLs as UI elements. Declaring endpoints is sufficient for the mod to render their icons.

- Commands are foreground argument arrays (`argv`), never shell command strings. Do not add shell wrappers, backgrounding or daemonization to work around lifecycle handling.
- A service declares its repo slot and a relative `directory`; its real working directory must stay inside that selected worktree, including through symlinks.
- Managed endpoints resolve to loopback. The actual command must honor the assigned host/port and fail strictly instead of silently choosing another port. Do not claim readiness or exposure guarantees that the service command does not enforce.
- Services may have multiple endpoints or none. HTTP/TCP probes have deadlines. `depends_on` is an acyclic readiness graph; its prerequisites need probes. Environment bindings do not imply startup order.
- Use endpoint bindings for owned connections and explicit external URLs for providers Rigs does not own. An external probe never grants permission to stop the provider.
- Put credentials in `secret_env`/`secret_file` references. Never copy secret values into profile literals, argv, labels, review text, logs or registry records. Preview/status redact declared values. Native terminal peeks show raw application output; the application controls what it prints.
- Record actual data/output scope. Ask about sharing versus isolation only for infrastructure the project uses or where evidence leaves a real ambiguity. No infrastructure detected is a finding, not a reason to invent database questions. Distinct worktrees can still share external databases or namespaces.

### Observed native apps

Profiles may declare `observed_apps: {id: {repo, process_name, executable?, platform?, machine?}}`. These are read-only external process observations, separate from managed `services`. Only ask about executable names/paths or Windows machines when the user requests native-app/emulator monitoring or the project supplies relevant evidence; ordinary web/API setup needs none of those questions. Do not guess the app name from a generic React Native dependency or invent a Windows machine.

`process_name` is an exact executable name. Optional `executable` distinguishes builds/worktrees; local relative paths resolve against that repo checkout, while remote paths must be absolute Windows paths. Without a path, all matching instances are shown. The platform defaults to the local OS (Windows/macOS/Linux). Remote observation requires `platform: "win32"` and an existing connected Herdr `machine`; Windows PowerShell/CIM is queried through Core's `machine.exec`. This is observation only; managed service launching remains local.

Status returns running/stopped/unknown and all matching PID/start-time/executable identities. Missing access/tools, unreachable machines or unverified required paths are unknown, never guessed stopped. Process presence does not establish UI readiness, a Metro connection or a booted emulator. Observers collect no command lines or environment, never adopt a process, and never reserve ports or checkouts. No Start/Stop/Restart controls or terminal peeks appear for observed apps; clicking an app opens its rig Preview with live observation details. Rig controls affect managed services only. Monitor-only profiles use `services: {}` and begin observing when saved, without launch approval. Observation rows remain visible when services stop and fold with the rig.

Use `rig observe --process-name MyApp.exe [--executable <path>] [--platform win32 --machine <connected-name>]` for a read-only snapshot without saving or launching anything. Use profile `observed_apps` for persistent monitoring. Do not add process-kill commands or treat name/path matching as lifecycle ownership. A profile may combine native app observations with managed Metro/API services. `rig init` does not automatically discover native apps or emulator devices.

## Ownership and recovery rules

- One active rig may claim a canonical worktree. Worktree and port reservations commit together under the registry lock. Distinct worktrees of one repository may run concurrently.
- Persist a launch intent before starting Core. Identify an owned process by rig/service/launch labels and its recorded terminal address together. Never adopt or stop a process based only on a port, process name, checkout or terminal address.
- Closing the panel, switching layouts, hiding the sidebar or quitting Herdr must not stop a rig. Do not attach lifecycle ownership to a space or pane.
- `down` stops only verified owned launches, releasing reservations when absence/stop is confirmed. It does not delete data, profiles or checkouts, change branches, or stop external/manual providers.
- Unknown ownership, unavailable Core and possibly in-flight launches retain reservations. Restore Core and inspect `status`; use `down` to reconcile before replacing an unresolved launch. An absent possibly in-flight launch requires the existing 30-second reconciliation window. Do not bypass ownership checks or manually delete reservations.
- Startup rollback stops launches from that attempt only and preserves pre-existing services. Diagnostic capture must never prevent cleanup of verified owned launches. Preserve and redact bounded diagnostic output.
- Missing/moved checkouts remain stale until stopped and explicitly repaired with `configure`. Never substitute a sibling worktree by matching its branch name.

## Try a disposable demo

Use this path only when the user explicitly requests a demo or when running authorized fixture tests. Disposable examples can be prepared with the command below; do not substitute them for services discovered in an ordinary project.

From the source checkout, run `npm run prepare:desktop`. It prepares temp Git checkouts, profiles and a manifest with unique names; it does not register or launch rigs. Use the manifest's exact paths to create and preview its mono or split rig. Obtain approval before interactive demo launch. Fixture Git commits are confined to those new temp repositories; never modify the user's checkout history. Follow `docs/DESKTOP_ACCEPTANCE.md` for actual desktop checks and stop only the named fixture rigs you started.

## Change Rigs itself

| Source | Responsibility |
| --- | --- |
| `src/types.ts`, `src/profile.ts` | Profile contract, Git context, validation, resolution, review identity, secret references |
| `src/init.ts`, `mods/rigs/setup.ts` | Evidence discovery and the copied setup prompt |
| `src/lifecycle.ts`, `src/connections.ts`, `src/store.ts`, `src/core.ts` | Approval, ownership, locks, durable registry, Core transport and recovery |
| `src/observe.ts` | Read-only local/Windows-remote process queries, instance matching and observation status |
| `src/profiles.ts` | Saved profile catalog, shared references, revisions and guarded file editing/deletion |
| `src/cli.ts` | Shared versioned command interface for agents, shell and panel |
| `mods/rigs/main.ts` | Native GPUI sidebar, creation menu and dialogs; no DOM, browser framework or Node APIs |
| `scripts/` | Builds, installation, guarded syncing and disposable acceptance preparation |
| `tests/`, `fixtures/` | Resolver/lifecycle regressions and disposable Core/demo services |

Edit TypeScript sources. `mods/rigs/main.js`, `mods/rigs/setup.js`, `mods/rigs/AGENTS.md`, `docs/SETUP_PROMPT.md` and `dist/` are generated. The root `AGENTS.md` is the editable guide; build copies it into the mod, and installation adds exact local paths. Keep README, CLI help, agent guide and acceptance instructions consistent with actual behavior.

The ordinary compiler build covers `src/`, `tests/` and `scripts/`; it excludes the native mod. The native mod build checks against the installed Herdr declarations and emits its separate JS. Installed panel files are copies, so a compiler watcher alone cannot update the panel.

```sh
npm run build             # CLI, tests and TypeScript scripts -> dist/
npm run build:mod         # Native mod type check, JS and generated guides
npm run watch:cli         # Optional portless compiler watcher
npm run watch:mod         # Optional native-mod source watcher; builds local files
npm run sync:mod          # Build and update this checkout's existing rigs mod only
npm run watch:mod:installed  # Watch native sources and sync that existing installation
npm run install:mod       # First install: personal layout clone plus mod
```

`sync:mod` does not rewrite layouts or switch the current layout. It refuses to overwrite a mod that does not identify this source checkout. To sync an installation with another name, use `npm run sync:mod -- my-rigs`. The installed watcher targets the default `rigs` installation. Never modify Herdr's shipped layouts/mods or rewrite user layout choices just to refresh Rigs code. Keep this source checkout in place; the installed panel calls its compiled CLI through the absolute Node executable.

## Verify changes

- Run `npm test` for resolver/lifecycle/discovery/approval changes. Add meaningful regressions for new behavior or ownership failure cases. Fixture repositories are disposable; do not stage, commit or change branches in the actual source checkout unless requested.
- For native changes run `npm run build:mod` and `npm run check:mod`. `herdr-app check` exercises initial/eager descriptions, not every deferred or asynchronous state. Exercise changed preview/review states in a native checker harness and, when app access is available, in the actual app.
- Run `npm run test:live` when changing Core lifecycle or the command interface used by live fixtures. `npm run test:crash` covers durable launch recovery and stale-lock behavior. Both start disposable test processes and clean up only their own launches.
- Follow `docs/DESKTOP_ACCEPTANCE.md` for native click-through, endpoint opening, output peeks, visibility polling and actual app quit/reopen. Do not quit the user's app without authorization. Source review, checker rendering and registry reopen tests do not prove those desktop behaviors.
- Record exactly what was checked and any remaining limits in `docs/verification.md`. Do not present historical test results as a fresh run, or mark UI acceptance complete based on build success.
