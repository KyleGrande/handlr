# Herdr Context implementation plan

Status: design saved; implementation and installation are pending. The recommended default owner is the focused checkout/worktree, selected from the terminal CWD; agent/session context is an optional separate layer.

## Agreed placement

Add two always-available buttons to the top-right of Herdr's tab bar, alongside the current space's Files and Changes buttons:

```text
… terminal tabs …                         +  Files  Changes  Notes  Tags
```

The buttons open their respective views in Herdr's existing right-side panel. Clicking the selected button toggles its panel using the same behavior as Files/Changes. The buttons remain present even when there are no saved notes/tags. They do not need to be added from +, and there is no new permanent section in the left sidebar.

The + button keeps its existing terminal/agent creation behavior. Space/agent right-click integration is optional future convenience, not the primary entry point for this version.

Reference: [Herdr Ranch mod-buttons recipe](https://github.com/jslowack/herdr-ranch/blob/main/mod-buttons/RECIPE.md). Its custom tab-bar mod discovers installed mods with a `button` declaration in `mod.json`, renders a button for each, and opens the chosen panel with per-space selection. That discovery is a community tab-bar implementation, not a guarantee that a stock Herdr tab bar understands the extra manifest field.

## Recommended ownership: checkout selected by CWD

The button placement and panel visibility belong to Herdr's space UI. The saved notes/tags should normally belong to the project checkout the person is working in. A space is a way to select/view that context, rather than its default storage owner.

Resolve the focused terminal/pane CWD on its actual machine, falling back to the active space folder when no pane/terminal CWD is available. In Git, canonicalize to the Git worktree root. Outside Git, use the canonical folder path. If the folder/machine cannot be resolved, show that state and retain drafts; do not redirect a save to a guessed target. Distinguish a confirmed non-Git folder from a failed Git/machine query before using the folder fallback.

| Situation | Recommended behavior |
| --- | --- |
| CWD moves from `/project` to `/project/src` | The same checkout notes/tags remain selected. |
| Two spaces or terminals use the same checkout on the same machine | Both see the same checkout notes/tags. |
| Another worktree of that repository is selected | It has its own notes/tags, even if branch names repeat. |
| A branch or space is renamed | Its checkout context remains attached to the same canonical worktree. |
| A terminal changes into a different Git repository | Show that repository's checkout context. |
| CWD is outside Git | Use that canonical folder as the owner, with no automatic parent-folder inheritance. |
| Two machines have the same path | Keep their records separate using machine/Core identity. |
| The user selects Agent scope | Edit the agent/session record and show inherited checkout/folder context separately. |

This matches the workflow of Changes and the Focused rig filter: use CWD to find the checkout. Files itself browses the CWD, so Notes/Tags deliberately keep project-level context stable when navigating subdirectories. Rigs remains independent and can switch between Focused and All; its filter does not own or change Context records.

Recommend **Checkout / Agent** as the initial scope control, displaying **Folder / Agent** outside Git. An explicit space-only scope can be added later if space-specific planning proves useful. Avoid three competing shared scopes in the first version. This updates the earlier Space/Agent default in this plan; checkout/folder context is now the primary shared layer.

## Notes and Tags views

- Default to the focused checkout/folder's context. Show its name, machine and a full-path tooltip; the current space may be shown as navigation context without becoming the storage key.
- Offer a compact Checkout/Agent (or Folder/Agent) scope control in both views. Agent scope uses an explicit/current agent in the active space; keep the selected target visible so edits have a clear owner.
- Notes contains editable descriptive notes, clearly identified instructions and handoff text. Use ordinary native text controls and theme styling.
- Tags contains simple editable tag chips, with add/remove controls. Tags describe context and do not execute rules.
- In Agent scope, show inherited checkout/folder context separately from editable agent context. Never copy shared notes into each agent record or overwrite the checkout when saving agent notes. Inherited tags are distinguishable and cannot be removed through the agent record. A CWD change may change the inherited view, but it must not move or reassign the agent's own record.
- Task URLs are clickable links. Jira/Linear authentication is not required. No tracker writes or lifecycle actions follow from saving notes/tags.
- Retain drafts per target. Changing spaces, agents or panels must not lose text or save it to a newly focused target. Use an explicit Save action and reject stale revisions while retaining the draft.
- Remember panel selection/visibility per space using the current tab bar's conventions. Hiding a panel leaves persistent records intact.

## Architecture

One independent Herdr Context project owns the data model, persistence and CLI. Provide two thin native entry points, Notes and Tags, over that shared implementation. Neither depends on Rigs.

For a compatible mod-buttons header, each view declares a panel button, for example:

```json
{"place":"none","button":{"label":"Notes","icon":"notes.svg","opens":"panel","order":30}}
```

Tags gets a separate entry point/declaration and the next order value. Both buttons are present as soon as the entry points are installed; users do not add them through +. Do not publish counts, background observers or extra UI controls until they serve an implemented behavior.

If the active tab bar does not support these declarations, adapt a personal copy of that tab bar or integrate the compatible button-discovery behavior. Preserve the existing layout, Rigs panel, pane settings and Files/Changes behavior. Do not install the reference's older full layout over the user's current layout, edit shipped mods, or switch layouts merely to add these buttons.

## Identity and persistence

1. Confirm the installed host APIs before choosing identity bindings. Persist checkout/folder context using the owning machine/Core identity and canonical worktree/folder path. Use the worktree root, not the shared Git common directory, branch name, space ID or raw CWD subdirectory. Machine display names alone must not merge records after a rename/reconnection.
2. Agent context belongs to an agent session/instance. A terminal address alone is insufficient because a terminal can host a replacement program. Verify a durable session identity or implement an explicit persistent context binding; never guess from a PID or silently reuse notes for a replacement agent.
3. Keep worktree identity separate from space identity. Space IDs govern panel selection/visibility, not default record ownership. If a checkout moves, preserve the old record and offer explicit relinking; do not substitute a sibling worktree by branch/name. Treat any future space-only scope as a separate explicit owner.
4. Store versioned records under `CONTEXT_HOME` (proposed default `~/.local/state/herdr-context`), outside installed mod code and the Rigs registry.
5. Panel and CLI use the same validation and atomic persistence with revision checks. Keep checkout/folder and agent records separate. Capture the displayed target and revision for each edit/save; reject late loads for old focus and retain drafts by owner. Preserve data through panel closure, mod reload and app restart.
6. Agent updates remain optional. Read/inherit context without requiring the agent to update it. General notes and imported task text are context, not automatic executable instructions. External task updates require a separately enabled future integration.

## Implementation sequence

- [ ] Resolve machine-qualified checkout/folder identities from the focused CWD and verify stable agent/session bindings against the installed Herdr/Core surfaces; document limitations before automatic agent association.
- [ ] Update the initial scaffold types (currently space/agent only) for the agreed checkout/folder owners before implementing storage; no persisted records exist to migrate yet.
- [ ] Implement the shared model, validation, atomic storage and stale-write rejection.
- [ ] Add a versioned JSON CLI for reading and updating explicit targets. Pass edited content through files/stdin rather than shell interpolation.
- [ ] Build native Notes and Tags panel entry points with scope controls, inherited context and retained drafts.
- [ ] Integrate the two always-present top-right buttons with the current personal tab bar/layout, following the reference's panel behavior.
- [ ] Add guarded installation/sync scripts and an installed agent guide with exact local CLI paths.
- [ ] Install when implementation resumes; document what was verified and any checks the user asks to skip.

Proposed CLI operations and manifest entries are design, not currently available commands.

## Acceptance

- Notes and Tags appear beside Files/Changes without using +, including for an empty space.
- Each button opens/toggles the existing right-side panel and follows its selected-space state.
- Checkout/Folder and Agent scopes load distinct records; inherited context is read-only in the child scope.
- Moving into a checkout subdirectory retains the same notes/tags; two spaces on that checkout share them. Different worktrees and machines stay separate. Confirmed non-Git folders use folder context; failed/offline resolution never redirects saves.
- Saving writes to the displayed target even if focus changes; drafts survive target/panel switching.
- Stale concurrent edits are rejected without discarding the user's draft.
- Space/branch renames, space reordering and app restarts preserve checkout context. Replacement agents do not inherit an unrelated prior session's notes. Moved checkouts require explicit relinking.
- Notes/tags work without Rigs, Jira/Linear or a running agent. Existing Rigs and Files/Changes controls continue to work.
- Installation/sync preserves personal layout choices and shipped files. Record runtime acceptance separately from build/checker results.

## Current state

The repository contains only its initial scaffold and this plan. Installed host declarations and current sidebar/tab-bar composition were inspected during planning; the linked mod-buttons recipe was read. No Context code, CLI, panel buttons or layout integration has been installed, and no checks or runtime acceptance have been performed.
