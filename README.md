# Herdr Rigs

A TypeScript CLI and native Herdr panel for named, restartable development stacks. Requires Node 22.18+, Git, `hc` 0.1.19 and `herdr-app` 0.1.14. Services run as parentless Core terminals. Closing the panel does not stop them.

## Install in Herdr

```sh
npm install
npm run install:mod
```

The installer creates a personal `rigs-workspace` clone of Herdr's `main` layout, then adds **Rigs** beneath the existing **Spaces** and **Agents** sections in the left sidebar. Shipped files are preserved. Existing names are preserved unless `--update` explicitly targets this checkout’s installation. To install under another name, use `npm run install:mod -- my-rigs`.

Keep this checkout in place: the installed mod calls the absolute Node executable and compiled CLI module. The CLI forwards its PATH to Core so version-manager executables can start. The registry defaults to `~/.local/state/herdr-rigs`; `RIG_HOME` changes it. No service lifecycle is attached to app space or pane IDs.

Return to the original layout:

```sh
herdr-app do layout.switch '{"name":"main"}'
```

The mod runs the CLI and Git, reads the profile you select, and opens configured browser URLs. Starting a rig executes the profile's commands. Review the preview first.

[AGENTS.md](AGENTS.md) is the maintained agent guide: setup workflow, commands, profile rules, ownership/recovery, development and verification. The build packages it with the mod; installation adds exact CLI and source paths. The copied setup prompt points to that installed guide.

## First stack

Click **+** in Rigs and choose **Agent Setup Prompt**. Paste it into the agent you already use. The prompt is one sentence pointing to the installed `AGENTS.md` and the selected checkout. The guide contains the exact CLI paths and all setup rules. Your agent inspects the project, proposes defaults, writes an unapproved draft, saves the named rig, and shows its plan. It asks only about material uncertainty. Hover the rig row and click **Start** to launch the saved configuration. Click the rig name whenever you want to inspect its preview or edit review decisions; preview is optional for launching. You do not need to arrive with a profile JSON or install a second agent.

Repositories with no commits are supported and show their branch with **no commits**. When discovery finds no supported long-running services, it reports that result. A TypeScript build may produce an optional portless compiler-watcher proposal. Demo fixtures are separate: **Setup options → Try a demo · copy setup prompt** explicitly opts into disposable demos.

The reusable prompt is in [docs/SETUP_PROMPT.md](docs/SETUP_PROMPT.md). **Already have a profile? Import it** exposes the manual flow.

For manual setup, write a version 1 JSON profile. Select an existing Git worktree for every repo slot when creating the rig. In the panel choose **+ → Setup options → Already have a profile? Import it**, enter the profile's absolute path and a rig name, load repo slots, and choose each checkout. **Save and preview** opens a centered popup showing commands, proposed ports, connections and data scope. Click any rig name to reopen that popup; there is no separate Preview button. The chevron beside a rig collapses/expands its services and endpoints, remembering your choice across reloads; the rig status and hover controls remain available. **Approve and start** approves the displayed configuration and launches it. Click anywhere on a service header bar to open its terminal output in a peek. Endpoint icons sit in that same bar: hover for the address, click a running HTTP endpoint to open it. TCP icons show port information. Lifecycle and endpoint controls have separate clicks; raw URLs and connection text stay in Preview. A service with no terminal has no output yet. Hover a rig or service row for **Start**, **Stop**, and **Restart**. Rig controls affect the entire stack; service controls affect that service, with declared prerequisites included on start. Stopping a service leaves its consumers running with degraded dependency status. Static green dots indicate running processes, warm dots indicate transitions/attention, and gray rings indicate stopped/draft states. Hover for details. The rig name identifies the process-owning instance; its gray description shows one checkout/branch or a compact checkout count. Profiles can be reused by separate rig instances.

The CLI is the same implementation used by the panel:

```sh
./bin/rig create shop --profile /absolute/shop/rig.json --repo app=/absolute/shop
./bin/rig plan shop
# After approving the preview, use review.fingerprint from plan:
./bin/rig approve shop --review <fingerprint-from-plan>
./bin/rig up shop --review <same-fingerprint>
./bin/rig status --checkout /absolute/shop/src --json
./bin/rig logs shop api
./bin/rig down shop
```

A profile for an existing Node app (adapt arguments to your actual server):

```json
{
  "version": 1,
  "repos": ["app"],
  "services": {
    "web": {
      "repo": "app",
      "directory": ".",
      "argv": ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "${web.http.port}", "--strictPort"],
      "endpoints": { "http": { "range": [3120, 3199] } },
      "readiness": { "endpoint": "http", "path": "/", "timeout": 20 },
      "data_scope": "Review whether this app uses shared databases or queues"
    }
  }
}
```

Commands are argument arrays, never shell strings. A service directory must resolve inside its selected worktree. Services can have several named endpoints or no endpoints. Ports bind to loopback in the fixtures; your command must honor the provided host/port and fail strictly instead of choosing a fallback port.

`env` values accept literal strings, `${rig.id}`, `${service.endpoint.port}`, or structured bindings:

```json
{
  "API_URL": { "endpoint": "api.http", "path": "/api" },
  "CORS_ORIGIN": { "endpoint": "web.http", "origin": true },
  "EXTERNAL_API": { "external": "https://example.test/api" },
  "TOKEN": { "secret_env": "LOCAL_API_TOKEN" },
  "PASSWORD": { "secret_file": "/absolute/local-secret.txt" }
}
```

Secret values travel only through Core's environment input. Previews/status show `<secret>` and the registry stores source references. CLI logs redact available declared secrets; native terminal peeks show raw application output. Keep credentials in secret sources, not literal argv/env/URLs. The service controls what it logs.

`depends_on` is an acyclic array of service IDs with readiness checks. It controls order independently of environment bindings (API can bind web's CORS origin while web waits for API). Probes support HTTP 2xx or `"kind": "tcp"`; each has a deadline. External bindings can add `"probe": {"kind": "http", "path": "/health", "timeout": 20}` to gate their consumer. External observations appear separately in status and never authorize stopping the provider. Consumers remain up when a dependency later becomes unhealthy; status reports degraded dependencies.

`rig configure <name> --repo slot=/new/checkout` repairs mappings only after `down`. Plans read the current branch, including detached HEAD and unborn branches, without substituting a sibling worktree. `rig init --checkout <path> --output <new-profile.json>` proposes dev/start services using scripts, framework dependencies and configuration, environment example variable names, and development-doc/infrastructure references. Demo/fixture scripts are excluded from ordinary discovery. A supported plain TypeScript build without application commands gets a development-tool proposal; otherwise `init` can return `outcome: "no_services"` with an empty draft and evidence, which needs a documented service before `create`. Vite/Next commands get suggested loopback and port arguments when no existing port flag is present. Config files are never executed and example environment values are omitted.

Review the evidence files with an agent and put proposed choices in `setup.decisions` under the relevant `setup.questions` keys (`commands`, `ports_and_readiness`, and connections/secrets or data isolation where relevant). Leave `setup.approved` false in the profile. Drafts can be created and previewed. The preview lets you edit decision notes and approve/start the displayed configuration. Sidebar Start/Restart controls approve and launch the saved configuration directly; missing required decisions still block launch. Edit actual command/binding/data settings in the profile and reopen the preview popup before approving.

For CLI review, `plan` returns `review.fingerprint`. After user approval, run `rig approve <name> --review <fingerprint>`, supplying any missing/corrected notes with repeated `--decision key=value`, then `rig up <name> --review <same-fingerprint>`. Approval saves to the registry without starting services or rewriting the profile. Changes to the profile or selected checkout/branch invalidate approval; `up --review` also rejects an outdated preview. Port ranges are reviewed settings, while free-port proposals can change at allocation. Secret values never enter the review hash. Setting `setup.approved` alone no longer satisfies draft review. Existing manual profiles without `setup` still support explicit `up`; once an approval is recorded, later launches require it to remain current.

## Developing Rigs

This project has no app server or database. `npm run watch:cli` is an optional compiler watcher writing to `dist/`; it has no port or HTTP readiness check. It does not rebuild the native panel because the main TypeScript project excludes `mods/rigs`.

Use `npm run watch:mod` to build native-mod sources as they change. `npm run sync:mod` builds and updates this checkout's existing installed `rigs` mod, including its agent guide, without rewriting layouts. `npm run sync:mod -- my-rigs` targets a different installation name. Sync refuses to overwrite a mod that belongs to another checkout. `npm run watch:mod:installed` watches native sources and syncs the existing default installation automatically. Initial installation still uses `npm run install:mod`.

## Ownership and recovery

One lifecycle mutation per rig; cross-rig checkout and port reservations commit together under a short shared lock. Readiness runs after releasing it. Preferred ports persist across stops. Overlapping active worktrees are rejected. Data, Git branches and externally managed services are never removed by `down`.

Each launch intent is synced before Core receives its unique rig/service/launch labels. A retry reconciles those labels. Stops require both labels and the recorded address. Unavailable Core, ambiguous ownership, or an unconfirmed start retains reservations. Restore Core access and run `down`; an absent terminal from a possibly in-flight launch requires at least 30 seconds before reconciliation. Locks use filesystem leases with stale-lock recovery. Startup rollback targets only the current operation; diagnostics retain a bounded, redacted excerpt where available.

## Verification

```sh
npm test
npm run test:live
npm run test:crash
npm run build:mod
npm run check:mod
```

Socket tests and native checks need local Core/desktop access. `test:live` creates disposable Git fixture checkouts in the system temp folder, runs concurrent monorepo and multi-repo stacks in separate CLI processes with a portless worker and CORS binding, checks actual HTTP responses, logs, no-parent ownership, checkout lookup, restart ports, and stop isolation. It stops fixture launches in `finally` and retains the temp directory for diagnostics. It does not close your Herdr window.

The panel polls at a bounded five-second interval; pause polling from its options menu. The installed layout supplies the panel's node ID, so polling pauses when that node or an ancestor is hidden or is an inactive stack child. Copies installed manually without a node ID cannot infer their layout visibility. App quit/reopen and live panel interaction require separate UI acceptance; CLI registry reopen testing does not prove app reopen behavior.

`test:crash` starts a disposable worker in real Core, holds its launch response, kills the CLI with SIGKILL, and verifies durable intent reconciliation, lease recovery, and reuse of exactly the same terminal before stopping it.

For the remaining native interaction checks, use [docs/DESKTOP_ACCEPTANCE.md](docs/DESKTOP_ACCEPTANCE.md). `npm run prepare:desktop` prepares disposable inputs without registering or starting rigs.

Individual services can also be controlled with `rig up|down|restart <name> --service <id>`. Service start includes declared readiness prerequisites. Partial stacks retain conservative reservations for the entire profile while any owned launch remains active or unresolved. Restart holds the rig lease through stop/start and preserves reservations until replacement or explicit reconciliation.
