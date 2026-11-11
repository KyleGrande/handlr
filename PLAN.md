# Herdr Context implementation plan

Status: design saved; implementation and installation are pending.

## Agreed placement

Add two always-available buttons to the top-right of Herdr's tab bar, alongside the current space's Files and Changes buttons:

```text
… terminal tabs …                         +  Files  Changes  Notes  Tags
```

The buttons open their respective views in Herdr's existing right-side panel. Clicking the selected button toggles its panel using the same behavior as Files/Changes. The buttons remain present even when there are no saved notes/tags. They do not need to be added from +, and there is no new permanent section in the left sidebar.

The + button keeps its existing terminal/agent creation behavior. Space/agent right-click integration is optional future convenience, not the primary entry point for this version.

Reference: [Herdr Ranch mod-buttons recipe](https://github.com/jslowack/herdr-ranch/blob/main/mod-buttons/RECIPE.md). Its custom tab-bar mod discovers installed mods with a `button` declaration in `mod.json`, renders a button for each, and opens the chosen panel with per-space selection. That discovery is a community tab-bar implementation, not a guarantee that a stock Herdr tab bar understands the extra manifest field.

## Notes and Tags views

- Default to the selected space's context. Show the space name and machine in the panel header.
- Offer a compact Space/Agent scope control in both views. Agent scope uses an explicit/current agent in that space; keep the selected target visible so edits have a clear owner.
- Notes contains editable descriptive notes, clearly identified instructions and handoff text. Use ordinary native text controls and theme styling.
- Tags contains simple editable tag chips, with add/remove controls. Tags describe context and do not execute rules.
- In Agent scope, show inherited space context separately from editable agent context. Never copy shared notes into each agent record or overwrite the space when saving agent notes. Inherited tags are distinguishable and cannot be removed through the agent record.
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

1. Confirm the installed host APIs before choosing identity bindings. Persist space context using its stable space identity qualified by the owning machine/Core, not its name or branch.
2. Agent context belongs to an agent session/instance. A terminal address alone is insufficient because a terminal can host a replacement program. Verify a durable session identity or implement an explicit persistent context binding; never guess from a PID or silently reuse notes for a replacement agent.
3. Keep worktree identity separate from space identity. Any optional worktree association uses a canonical path on the correct machine and an explicit binding.
4. Store versioned records under `CONTEXT_HOME` (proposed default `~/.local/state/herdr-context`), outside installed mod code and the Rigs registry.
5. Panel and CLI use the same validation and atomic persistence with revision checks. Keep space and agent records separate. Preserve data through popup/panel closure, mod reload and app restart.
6. Agent updates remain optional. Read/inherit context without requiring the agent to update it. General notes and imported task text are context, not automatic executable instructions. External task updates require a separately enabled future integration.

## Implementation sequence

- [ ] Resolve stable space/agent bindings against the installed Herdr/Core surfaces; document limitations before automatic agent association.
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
- Space and Agent scopes load distinct records; inherited context is read-only in the child scope.
- Saving writes to the displayed target even if focus changes; drafts survive target/panel switching.
- Stale concurrent edits are rejected without discarding the user's draft.
- Space renames/reordering and app restarts preserve context. Replacement agents do not inherit an unrelated prior session's notes.
- Notes/tags work without Rigs, Jira/Linear or a running agent. Existing Rigs and Files/Changes controls continue to work.
- Installation/sync preserves personal layout choices and shipped files. Record runtime acceptance separately from build/checker results.

## Current state

The repository contains only its initial scaffold and this plan. Installed host declarations and current sidebar/tab-bar composition were inspected during planning; the linked mod-buttons recipe was read. No Context code, CLI, panel buttons or layout integration has been installed, and no checks or runtime acceptance have been performed.
