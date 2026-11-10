# Herdr Rigs implementation plan

## Purpose

A rig is a named, restartable development stack. It binds service definitions to specific Git worktrees, allocates local endpoints, and wires the services together. A worktree can host several services, and a rig can span several worktrees. The rig still exists when all its services are stopped.

The first release should let someone open the Rigs panel in Herdr, preview a stack for their checkout, start it, open its endpoints, inspect service output, and stop it. They should be able to quit Herdr, reopen it, and see the same running services. The same rig should be operable from a shell or agent.

## System boundaries

| Component | Purpose and ownership | Interface |
| --- | --- | --- |
| Herdr desktop mod | Present the rig in context. Suggest a worktree from the focused terminal, collect explicit selections, show the plan, and render service state and actions. Own view preferences such as which rig is selected. | Call `rig` with structured arguments, consume versioned JSON, open browser endpoints, and peek at Core terminals. |
| `rig` CLI and resolver | Own stack semantics. Validate profiles, resolve worktrees and connections, manage reservations and launches, verify readiness, and recover interrupted operations. This is the entry point for the mod, shell users, and agents. | Expose preview, lifecycle, status, and log commands. Use one implementation of each operation across callers. |
| Herdr Core | Host foreground service processes in terminals and report terminal lifecycle and output. | Start a program with explicit arguments, directory, and environment. Inspect, read, and stop it using the returned terminal address. |
| Service process | Listen on the assigned address and port, honor the configured environment, and expose its readiness signal. | The profile describes the service's existing launch and health interfaces. |

An app space is a convenient view onto a rig. Space, tab, and pane IDs are optional UI context. Closing or moving a view has no lifecycle effect on the rig. A Core terminal belongs to one service launch. A restart can produce a new terminal while the rig and service keep their identities.

Use a peek for live output by default. A regular terminal pane can be closed as a process-ending action in Herdr, so a dedicated service terminal pane should be an explicit choice. The panel obtains process state through `rig status` and uses Herdr terminal APIs for presentation. [Herdr app mod guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md) · [Herdr Core API](https://github.com/herdrdev/herdr-core/blob/master/schema/README.md)

## Rig boundaries

### Identity and membership

A rig is the unit of configuration and lifecycle. Its immutable ID identifies the stack across display-name changes, app spaces, and restarts. Within a rig, a service ID identifies one service slot with at most one active launch in the first release. A launch ID identifies one attempt to run that slot. Two rigs built from the same profile have distinct service instances even when both call a service `api`.

The profile supplies the service slots. The rig definition maps their repo IDs to concrete worktrees, and each service's relative directory selects its working directory. A monorepo rig can own `web`, `api`, and a portless `worker` in one checkout. A split-repo rig can own the same slots across several checkouts. Both follow the same start and stop rules. Opening the same rig from another space or shell refers to those same instances.

| Item | What the rig controls | What survives `down` |
| --- | --- | --- |
| Owned service launch | Foreground service terminal, managed endpoint assignments, and readiness observation | The service slot and diagnostic summary. A later `up` can create a new launch. |
| Selected worktree | Which existing checkout supplies a repo slot | The checkout, branch, files, and saved mapping |
| External dependency | The configured endpoint binding and any explicit probe | The remote or local provider and its data |
| Local state and credentials | References or settings passed to the service, such as a database URL or data directory | The underlying databases, queues, caches, files, and secrets |

The rig owns terminals it launched for its service slots. Terminal labels and the recorded launch identify that ownership. A listener on an expected port, a matching terminal name, or a shell in the same directory gives no authority to adopt or stop that process. A start that encounters a manually started service can report the conflict. The profile can deliberately consume that service through an external URL.

### Checkout and data isolation

Use **one active rig per worktree** as the first-release default. Several stopped rig definitions can select the same worktree. When starting, claim the canonical Git worktree roots that the rig will run services from, together with its port reservations. Reject an overlapping start before launching anything and show the conflicting rig and checkout. Keep the claim while any owned launch from that checkout is running or unresolved. Distinct worktrees of the same repo can run concurrently.

This guard covers collisions that separate ports miss, such as dev servers writing to the same build directory. It coordinates Rigs launches. A manually started process can still write to that checkout. Also, distinct worktrees can still point at the same database, queue, or cache. Where a service supports it, the profile can pass a rig-scoped directory or namespace. Where it uses shared infrastructure, declare that scope in the profile and show it in the plan. `down` ends owned processes and releases their claims. Data cleanup and Git operations require their own explicit actions.

### Connections across the boundary

| Connection | Ownership and lifecycle |
| --- | --- |
| Same-rig endpoint | Resolve from the provider slot's reserved endpoint. An explicit readiness dependency can delay the consumer. Both services participate in this rig's lifecycle. |
| External URL | Bind to the configured URL. The rig may probe it if configured. The provider stays under external ownership, even when the URL points to a local terminal or another rig. |
| Shared-rig endpoint, future | Reference a provider rig ID, service ID, and endpoint name. The provider rig retains lifecycle authority. Define how consumers register usage, how stopping a provider with active consumers is handled, and how consumers learn when a resolved URL changes before adding this feature. |

Bindings are resolved when a service launches. A readiness dependency controls startup order and provides a status signal if the dependency later fails. The first release leaves already-running consumers up and surfaces the degraded dependency. Changing a resolved URL takes effect when the affected service is relaunched.

### Lifecycle scope

- **Create and preview.** `create` saves a named definition. `plan` reads the current checkout and proposed bindings. Neither starts a service or claims a worktree.
- **Start and retry.** `up` operates on the rig's service slots. Retry can reuse verified launches that match the resolved configuration. Rollback applies to launches created by the failed invocation. The definition remains available even if startup never finishes.
- **Stop and reconfigure.** `down` stops the owned launches for that rig. Require a stopped rig before changing its worktree mapping. A branch change within a selected checkout is a Git operation. Show the branch in the plan and let the service's normal development workflow handle source edits.
- **App and Core interruptions.** Closing the app affects presentation. A Core interruption may leave a launch unavailable or lost. The rig retains its identity and selections, reports what it can verify, and waits for reconciliation before starting replacements or releasing claims.

## Data and authority

| Record | Contents and lifetime |
| --- | --- |
| **Profile** | Versioned, reviewable project configuration. Declares repo IDs, service IDs, worktree-relative directories, command argument arrays, port inputs, endpoint names, readiness probes, environment bindings, and references to local secrets. |
| **Rig definition** | Local durable configuration. Stores an immutable rig ID, display name, selected profile, explicit repo-to-worktree mappings, and preferred port assignments. Survives stop and app exit. |
| **Launch record** | Local operational state. Stores an operation ID, launch ID, service ID, allocated endpoints, Core terminal address when known, timestamps, and the latest outcome. Records a launch intent before the start request. |
| **Live observations** | Core supplies terminal liveness and exit details. Probes supply endpoint readiness. Status combines these observations with the launch records and identifies unavailable or stale observations. |

Use the focused terminal's Git worktree root as the initial suggestion. Confirm a concrete worktree for every repo ID. Validate each checkout and service directory, and surface missing or moved paths. Report the current branch in the plan. A user may change branches within a selected worktree, so the plan shows the current selection every time and never substitutes a sibling checkout based on a branch name.

Profiles declare named endpoints such as `api.http` and how each service receives its port. Services can expose multiple endpoints or run without a port. A binding can reference another endpoint, derive its origin, append a path, or use an explicitly configured external URL. Resolve bindings before launching services. A separate, acyclic readiness graph determines startup order. For example, API can receive web's origin for CORS while web waits for API's health check.

Resolve secrets at launch from declared local sources. Send them through Core's environment input. Keep secret values out of arguments, labels, persisted rig state, previews, and status responses. Treat configured service commands as executable project configuration and make them reviewable before the first start. Service output is application-controlled and should be viewed as such. [Core launch schema](https://github.com/herdrdev/herdr-core/blob/master/schema/released.openrpc.json)

## Branch trees and the Rigs panel

Treat a branch tree as a concrete Git checkout as shown in Herdr. Keep the **rig as the primary unit in the panel**, with services and endpoints under it. Link each contributing checkout to its rigs so a branch tree can open the relevant rig and its URLs without requiring a worktree-first layout.

### How the link works

1. **Save the selected checkouts.** A rig has one binding per profile repo slot. Each binding records the local repository identity and canonical checkout root. Each service already declares its repo slot and relative directory, so it inherits that checkout link. One binding can cover several services.
2. **Resolve in both directions.** `rig status --json` includes checkout bindings and the repo slot for every service. The app can look up the rigs for a selected branch tree using its directory. Put path normalization and Git lookup in `rig`, for example through `rig status --checkout <path> --json`, so a service subdirectory or path alias resolves to the same checkout.
3. **Show branch names as context.** Read the branch or detached commit from Git. Two repos can both have a `feature/checkout` branch. Match by repository and checkout identity so each leads to the correct rigs. A branch switch inside the same checkout updates the label while preserving the link. If the checkout moves or disappears, show the stale binding and require explicit repair.
4. **Handle more than one match.** A checkout can belong to several saved definitions. Show the active rig first, then any stopped definitions available to start. The first-release checkout claim allows at most one active rig on that checkout.

### What the panel shows

The main view lists active rigs, with stopped definitions available separately. Each rig shows its name, contributing repo and branch labels, and service rows with their current endpoint assignments. A service can show multiple named endpoints, including a browser URL or a port-only entry. A worker can show its state and logs without an endpoint. Show proposed ports in the preview and allocated ports after launch. If Core becomes unreachable, label retained endpoint assignments as last known.

Provide **Show rigs for this checkout** in the Rigs panel using the focused terminal's directory. The checkout view links to the entire rig and highlights the services contributed by that checkout, so a frontend branch can still lead to the backend URL in the same rig. A branch-tree badge or menu shortcut can use the same lookup later.

| Fixture | Saved checkout links | Expected panel result |
| --- | --- | --- |
| Monorepo | `checkout-mono` binds `app` to the `shop` checkout on `feature/checkout`. Both `web` and `api` use that binding. | One rig shows `web :3120` and `api :4120`. The branch tree opens the rig and highlights both services. |
| Multi-repo | `checkout-split` binds `frontend` to `shop-web` on `feature/checkout` and `backend` to `shop-api` on `feature/tax`. | One rig shows `web :3121` and `api :4121`, each with its own checkout label. Either branch tree opens the same rig. Web shows its resolved API target on `:4121`. |
| Concurrent rigs | Both fixtures run from distinct checkout roots. | Both rigs appear together with their own ports. Looking up `feature/checkout` through either checkout leads to the corresponding rig despite the repeated branch name. |

## Operations

| Operation | Contract |
| --- | --- |
| `rig create <name>` | Save a profile selection and explicit worktree mappings. |
| `rig plan <name>` | Preview worktrees, commands, proposed ports, connections, and readiness order. Read-only. Mark unreserved ports as proposals. |
| `rig up <name>` | Revalidate inputs, reserve ports, resolve bindings, and start missing services in readiness order. Reuse healthy services whose launch configuration still matches. If a change affects live services, show the drift and let the user apply it with `down` followed by `up`. |
| `rig status [<name>] --json` | Return the rig definition, checkout bindings, actual endpoint assignments, and current service observations. Support lookup by checkout path. Distinguish stopped, starting, running, exited, and unknown process states from readiness states. Include observed timestamps and concise errors. |
| `rig down <name>` | Stop verified rig-owned terminals in reverse dependency order. Keep the rig definition and preferred ports for the next start. Repeated stops are safe. |
| `rig logs <name> <service>` | Read available Core terminal output. Keep a bounded startup failure excerpt locally when available so a failure can still be inspected after terminal history disappears. |

The mod and CLI share the same JSON contract. Include a schema version, stable rig and service IDs, an operation outcome, and actionable errors. Refresh on panel open, after actions, and on a bounded polling interval while visible. A temporarily unreachable Core should show as unavailable and leave the last known assignments visible. A liveness failure alone does not prove an endpoint is free.

## Lifecycle and failure handling

- **Serialize changes.** Allow one lifecycle mutation per rig at a time. Claim worktrees and reserve port assignments across all rigs on the machine in a short, atomic transaction. Release the shared reservation lock before running readiness probes so separate rigs can start concurrently.
- **Prefer stable ports.** Reuse an existing assignment on subsequent starts. Fail clearly when a preferred port is occupied. New rigs can choose from the configured range during reservation, and the result of `up` reports the authoritative URLs. Reservations coordinate Rigs callers. Another local process can still bind between allocation and launch, so use strict port settings where supported and treat bind failures or unexpected fallback ports as failed starts.
- **Track launches across interruptions.** Persist a unique launch intent and label Core terminals with the rig, service, and launch IDs. If the start request times out or the CLI dies after Core accepts it, reconcile by label before retrying. Use the address and expected labels together before issuing a stop. If Core is unreachable, preserve ownership and reservation records until reconciliation can confirm what happened.
- **Wait on service readiness.** Start a dependent only after its declared prerequisites pass their probes. Give each probe a deadline. For a service without a readiness probe, report that it is running with no readiness check configured. A service used as a readiness prerequisite needs a defined check.
- **Roll back one attempt.** If startup fails, capture the failing service and available output, then stop services created by that invocation. Keep previously running services. Record any cleanup still pending and retain the affected reservations until those processes are confirmed gone.
- **Keep stop predictable.** Run services as foreground processes in Core-owned terminals with no agent parent. Confirm terminal exit after a stop and report any listener still occupying a reserved port. A Core restart that preserves terminals should preserve the running rig. If a terminal is lost, surface that state and let the user explicitly start it again.

## Delivery sequence and acceptance

1. **Prove the platform boundary.** Run one disposable HTTP service in a Core terminal with explicit arguments, directory, environment, labels, and no parent. Use the installed `hc 0.1.19` and `herdr-app 0.1.14` as the first compatibility target. Verify terminal output in the app, continued execution after the launching terminal and app close, and port release after a stop. The available interfaces were inspected. The live test is pending because sandboxed Core startup was denied.
2. **Build the resolver and fixtures.** Cover a single app, two services in one worktree, and two repos with explicit worktree selections. Include a portless worker and the CORS example. Verify invalid references, readiness cycles, missing paths, and redaction. Check that repeated previews with the same inputs and port availability agree.
3. **Build the Core-backed lifecycle.** Verify duplicate starts, concurrent starts in distinct worktrees, rejection of an overlapping start, stable restart ports, a readiness timeout, and a crash between Core launch and registry update. Confirm rollback leaves existing services alone, and verify that `down` leaves external providers, unrelated listeners, worktree files, and local data intact.
4. **Ship the desktop flows.** Run both the monorepo and multi-repo fixtures and show the endpoints, actual API target, and service output under each rig. Verify checkout lookup from every contributing branch tree, including two repos with the same branch name, and check detached and missing checkouts. Quit and reopen the app, then stop one rig. Confirm its terminal addresses were restored after reopening, its endpoints are released after stop, and the other rig still runs. Run `herdr-app check` and exercise the actual panel with a running Core. [App mod check workflow](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md)
5. **Add assisted setup.** Once the profile format and checkout selection flow are proven, add agent-assisted `rig init` to propose a profile from scripts, framework configuration, environment examples, and dev docs. The user reviews uncertain bindings and decides which databases, caches, and queues are shared. Later launches resolve the approved profile deterministically.

The first release targets one local Core and binds managed endpoints to loopback. Shared-rig dependencies, remote hosts and forwarding, automatic recovery after reboot, and discovery of manually started listeners are separate increments. Each needs its own ownership or reachability rules. Explicit external URLs cover the first release's connections to separately managed systems.
