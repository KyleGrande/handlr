# Herdr Context implementation plan

Current user decisions supersede the earlier checkout-owned, categorized Notes
and separate Tags design. Implementation now provides one Context panel with
Space/Agent selection, tags, then a single Markdown scratchpad. The upgrade is
installed; checks and live results are recorded below.

## Experience

- One always-present Context button beside Files and Changes toggles the existing
  right panel, with panel choice remembered per Space and no permanent sidebar.
- Match Files/Changes' rounded border and 42px header. Use a compact native
  Space/Agent segmented control, tags, then Herdr's native Markdown editor with autosave.
- Space is the default shared owner. Its permanent Core ID and persistent bare
  Space ID form the key. CWD, branches, folder changes, display names and Space
  ordering do not select or move a record. Two Spaces on one checkout stay distinct.
- Agent follows the same highlighted agent as the shipped Agents list, restricted
  to the active Space. Never pick an arbitrary first agent or retain the former
  global assignment when selection changes. Show the selected agent's name.
- A verified process lifetime selects a persistent random assignment binding.
  Core ID, terminal creation, foreground PID and process birth are checked on
  the actual machine, including a replacement check after the process query.
  The random assignment UUID owns notes; PIDs/terminal addresses alone do not.
  Replacement lifetimes get another binding and previous records are preserved.
- The panel shows only the selected owner. Preserve separate inherited Space context in CLI reads, without displaying it in Agent scope.
- Notes are a freeform Markdown scratchpad, with no required categories and no Preview control. Preserve
  old instructions/handoff text by folding it into the editor when edited and autosaved.
- Notes are not automatically passed into prompts. Agents read via the versioned
  JSON CLI; the panel copies the exact read command for the displayed owner.
- Autosave after a short pause. Keep each pending owner independent of selection, retry failures, merge independent edits and preserve overlapping Markdown conflicts. Hide Save/Review/Refresh buttons and machine/revision metadata. Use the Files/Changes live-selection pattern, one batched open request, and cached revisited drafts.

## Storage and safety

Records/bindings live under CONTEXT_HOME (default ~/.local/state/herdr-context),
independent of mod lifetime and Rigs. Both panel and CLI use the same validation,
revision checks, locking and atomic fsynced writes. Concurrent binding creation
publishes one complete immutable binding. Invalid/future records are preserved.
No context operation runs services, creates worktrees, launches agents or changes
external tasks. Keep secrets out; Markdown/task/imported text is context, not
automatic instruction authority.

Existing checkout/folder records, assignment UUIDs and original two-panel draft
stores remain accessible; do not infer which Space should inherit an old
checkout record. Upgrade combines disjoint drafts, retains stale revision
protection and keeps both original draft sources. Remote Space resolution uses
permanent Core identity; remote agent verification uses Unix ps on that machine.
Storage remains local; automatic remote sync is planned.

## Implementation and acceptance

- [x] Shared Space/agent model, private versioned persistence, atomic binding
  creation, versioned JSON CLI and conflict rejection.
- [x] Native combined panel, Space/Agent segmented control, tags, one Herdr
  Markdown editor/preview and inherited Space context.
- [x] Highlighted-agent selection with replacement/lifetime guard and separate drafts.
- [x] Guarded first installation, two-panel consolidation and managed source sync.
- [x] CLI help, README and installed exact-path agent guide updated.
- [x] Automated regressions for persistence, concurrency, Space/machine separation,
  highlighted-agent switching, process replacement, inheritance, drafts, Markdown,
  and preserving layout/drafts through the single-button upgrade.
- [x] Upgrade installed mods and verify Context button, border, segmented control,
  tags and Markdown editor/preview in the running app.
- [x] Verify highlighted-agent switching live and exact CLI reads.

## Verification log

Previous version: three installed native mods passed the checker; live Notes/Tags
saves matched CLI reads. Files/Changes and Rigs remained functional.

Current combined version: CLI/native builds and 19 regressions pass. The installed
Context mod and personal context-tabs header pass herdr-app check. App status
reports no errors. Upgrade backup:
`~/.local/share/herdr-context/backups/2026-11-11T04-55-49.834Z/`.

Verified using Herdr's rendered-frame capture: one Context button, Files/Changes
border/header styling, segmented Space/Agent control, tags above a single native
Markdown editor, and a single native Markdown editor. The new Space owner resolves via
the live Core and returns versioned CLI JSON. Legacy records and draft sources
were preserved rather than guessed into a new Space.

Verified with two live agents in the same Space (t1c and t4k): Agent scope follows
the same highlighted agent, displays the selected terminal label, resolves
distinct persistent UUIDs, and shows the inherited Space read-only. Switching to
the second agent showed its empty scratchpad; switching back retained the first
agent's pending draft. Restored the original highlighted agent and Edit mode.

Native automation's coordinate input was intermittently unavailable, so final
selection/preview checks used the host's supported commands and `herdr-app shot`.
The panel accepts `context.space`, `context.agent`, and `context.refresh` host commands. There is no preview mode.

Planned: tracker adapters, automatic remote storage sync and right-click shortcuts.
Process lifetime verification currently requires Unix ps; unsupported or
unavailable process facts fail closed. App restart, real remote-machine behavior
and live conflict/rebase are not claimed as tested.

## Autosave simplification

Removed inherited cards, Refresh, Save, Review, Preview, revision and machine
labels from the panel. “This computer” previously denoted the local Core;
machine identity remains in the storage keys/CLI rather than the interface.

The native editor now autosaves after 650ms of quiet, with a per-owner queue
that continues across selection changes. It preserves edits made during an
in-flight write, retries IO errors, merges independent fields/tag changes, and
pauses overlapping text conflicts until an explicit conflict-only choice.
Live host selection directly starts an async load (the same approach used by
Files/Changes), replacing the old one-second focus polling delay. A single open
request resolves identity and reads the record; cached drafts appear while
background verification runs.

Build and native checker pass. All 25 regressions pass, including six new
autosave/debounce/retry/conflict/concurrent-edit cases. Installed runtime
verification is being completed.
