# Native desktop acceptance

These checks remain necessary in addition to `npm test`, Core integration tests and `herdr-app check`. They operate on disposable profiles/checkouts and require native Herdr access.

## Prepare

Run `npm run prepare:desktop` from this repository. It creates three disposable Git checkouts and two profiles in a system-temp directory, then prints their paths and unique acceptance rig names. It does not register rigs or start services. Save the printed manifest path for the session.

Keep Herdr on `rigs-workspace`. Rigs must be stacked beneath Spaces and Agents with the same small dim header and chrome background.

## First-run setup and import

1. Click Rigs **+**. Confirm a native popup opens with Agent Setup Prompt, a saved-profile list and Import profile…, styled like the terminal + menu. No inline sidebar form or initial profile field should appear. Every saved profile path should appear once even when several rigs reuse it.
2. Choose one disposable checkout and use **Agent Setup Prompt**. Inspect the copied text locally: it must be one sentence containing the installed AGENTS.md path and that checkout, without duplicating the guide. The linked guide must contain the exact executable/module paths and the rules to prepare a draft/preview, propose defaults, and ask only about material uncertainty. Follow the guide's README link and confirm it resolves. Preparing demos remains an explicit action through the guide; ordinary setup must not substitute fixtures for project services. Do not send either prompt to another person or external account for this check.
3. Choose a saved profile from the popup, then try **Import profile…**. A New rig dialog should prefill the selected profile and suggest an unused name, with editable checkout mappings. Import the monorepo profile using the manifest's mono name and `app` checkout. **Save and preview** must leave it stopped and reserve nothing.
4. Click the rig name to open a centered native preview popup; there should be no separate Preview button or inline sidebar preview. Review the human-readable preview: checkout/branch, command argument arrays, startup order, environment/API/CORS bindings, proposed endpoints, readiness and data scope. Close it with Close or Escape, then reopen it by clicking the rig name. Verify this never starts/stops services. Test a narrow sidebar and a long, scrollable plan; the launch action stays in the popup footer.
5. Try a nonexistent profile once. Its error must remain visible after a successful status refresh, until dismissed or replaced by another action.
6. Import a discovered draft with proposed decisions. Confirm the preview shows editable review notes. Leave one required note blank; **Approve and start** must reject it before any process launches. Fill it and approve. Changes to a command, binding, data scope or selected branch after preview must reject approval/start until a fresh preview is reviewed. Review notes do not rewrite executable profile settings.
7. Use a disposable repository with no commits. Confirm discovery, save, preview and lookup work, the branch shows **no commits**, and no source Git history or branch is changed.
8. Inspect a portless compiler proposal. Confirm no managed browser URL and no HTTP readiness check, and that separate native build/install steps are explained. A project with no recognized command must produce a useful no-services result rather than a fixture stack.

## Live services

1. Hover mono and click its **Start** icon without opening Preview. Confirm web/API/worker rows, two named API endpoints (HTTP and port-only metrics), actual allocated ports, and the web API target.
2. Open the web endpoint. Its disposable JSON response must name the current API URL. Return to Herdr and click the API and worker service rows to open their output. These must be peeks, not lifecycle-owning service panes. There should be no separate Live output button. Click service names, blank header space and status dots: the full bar should open output. Endpoint icons must sit directly beside the status dot, outside the hover-only lifecycle controls, and disappear when stopped/starting/unknown. HTTP endpoint icons show their URL on hover and open it only for a running allocated endpoint; their clicks must not also open output. Metrics and TCP endpoints must have no sidebar icons, while their addresses remain visible in Preview. Lifecycle buttons must stop click propagation too. There should be no raw URL/connection lines beneath service rows. Rig header whitespace/status clicks open Preview, while its chevron and lifecycle controls do not. A service row with no terminal should explain that output is not available yet and must not start a process when clicked.
3. Import/start the split profile under its manifest name, selecting frontend and backend explicitly. Both rigs must remain visible and have different ports.
4. From a terminal in each contributing checkout, use Rig options **Show rigs for this checkout**. It must return the correct entire rig and highlight the matching service contribution. Mono/frontend deliberately share the `feature/checkout` branch name; backend uses `feature/tax`.
5. Verify static status dots: green for running, warm for transitions/attention, and gray rings for stopped/draft; no animated status indicator. Hover each rig and service row to reveal Start/Stop/Restart icons, with no separate stop-services line. Rig controls act on the whole stack. Service controls only affect the selected service (and declared prerequisites on start); unrelated services keep their terminal addresses. Stopping a provider leaves consumers running and reports degraded dependencies. Restart must keep the scope correct and retain ownership during stop/start. For multiple checkouts, the gray description is a compact count rather than a list of paths. Hover for the actual status; do not imply healthy readiness for an unchecked process.
6. Confirm component rows show repo/worktree, branch and app-directory context while rig headings show only a compact summary. Start the separate backend/external-web scenario: both rigs should show a ↔ peer row with service/address details on hover. Peer clicks open Preview and never start/stop anything. Ambiguous/unmanaged providers should not get a guessed owner; the checkout filter must retain metadata for connected peers.
7. Use the chevron beside a rig to collapse its services/endpoints. The rig name, aggregate status and hover controls must remain available. Folding must not open Preview or start/stop anything. Reopen the rig, poll, filter and reload the mod: the saved collapse choice must persist. Clicking the rig name still opens Preview independently.
8. Hide and show the Rigs node. Confirm no status work while hidden, and fresh state after showing it. `layout.hide/show` calls alone are insufficient evidence unless actual polling/process observations are captured.

## Edit/delete acceptance on disposable definitions

1. Right-click a disposable rig header. Confirm Edit rig…, Edit profile… and Delete rig… appear without opening Preview. Open Preview and confirm Edit/Delete rig controls and Edit/Delete profile actions are available there too, including when no ports can be allocated.
2. Rename a running disposable rig. Its ID, terminal addresses, ownership and ports must remain unchanged. Profile/worktree edits and Delete must be refused until it is stopped/reconciled. Cancel each editor/deletion dialog once and confirm no changes occur.
3. Stop the disposable rig, change its profile/mappings through Edit rig, save and review the new Preview. It must remain stopped with no reservations and need fresh approval. Reject a duplicate name and a stale edit from another window.
4. Right-click a saved profile in + and edit its JSON. Confirm all referencing rigs are named; saving is refused while any is active/unresolved. Invalid JSON/configuration, incompatible shared slots and stale revisions must leave the file intact. Save a valid stopped edit, then reopen Preview to see the new configuration. No profile contents should be passed in CLI arguments; the editor uses a temporary draft file.
5. Delete only a stopped disposable rig. Its worktree/profile/data must remain, and its profile must still appear once in +. Attempt to delete a referenced profile and verify it is blocked with the referencing rig names. Finally delete an unreferenced disposable profile and verify its file and saved-list entry disappear. Do not use user profiles for destructive acceptance.

## Quit/reopen and cleanup

1. Save `./bin/rig status <mono-name> --json` and the split equivalent. Record service terminal addresses and endpoints.
2. Quit Herdr normally, leaving Core running. Verify both rig HTTP endpoints still answer and Core still reports the same labeled terminals.
3. Reopen Herdr. The panel must recover the same rig IDs, terminal addresses and endpoint assignments. Open output again.
4. Hover mono and click its **Stop** icon in the panel. Verify all its terminals have finished and all its reserved ports are free. Split must still answer its HTTP endpoint.
5. Stop split. Repeated stops must be safe. Keep profiles/checkouts/manifest as diagnostic evidence; do not remove project data or unrelated processes.

Record observed results, screenshots and terminal/port evidence in `verification.md`. A denied app-access tool or a source-only/render-only check leaves these gates open.
