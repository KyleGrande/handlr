# Saved layouts and per-space arrangements

Kyle approved native coordination for this Handlr fork during implementation.
`AGENTS.md` now identifies Kyle as the fork maintainer and Can as the upstream
Herdr maintainer. No Core machine layout document fields were added.

## Ownership and lifecycle

The Layouts mod owns preset validation, library metadata and the panel UI.
`data/layouts/presets.json` contains the versioned library; its `.last-good`
copy supports recovery. `writeTextFile` acknowledges writes and compares the
exact previously read text, preventing concurrent copies from silently replacing
one another's edits. A save only publishes the new library after both writes
succeed. Recovery reports a warning; unrecoverable files are preserved.

The native window coordinates automatic working arrangements because mods only
stay alive while their blocks remain in the layout. A hidden mod's timer runs,
but a closed/removed panel cannot observe every transition. Polling snapshots
can also skip intermediate spaces. The approval questions were answered:

1. The app acts on this by changing composition during navigation.
2. Only the native transition owner can guarantee capture of every outgoing
   displayed arrangement before the next one is projected.
3. Existing mod lifecycle APIs cannot guarantee this when the panel is absent.

`workspace.remember {enabled?}` reads/sets the initially disabled preference.
The setting appears in Settings → Look and in Layouts. It uses its own local,
versioned `data/layouts/space-arrangements.json`, with a validated last-good copy;
it is not a new settings.json key. Keys include workspace document identity,
permanent Core machine ID and raw stable space ID, never display names.

Before synchronizing a changed active space, the window captures outgoing
geometry and composition, preflights the incoming document, persists state,
then imports at the live revision. This work is synchronous and serialized by
the owning window; no asynchronous restore can arrive for an old space.
New spaces copy the current composition. Disabling retains the displayed
arrangement and stored associations. Enabling restores the current association
or seeds it. Closing a space does not delete its arrangement or any presets.

The new `workspaceCommand` mod API returns command replies directly from the
mod copy's owning window, including for floating panels. It avoids shell/CLI
executable, environment and app-home ambiguity. `workspace.inspect` now includes
`space` and `workspace`; optional import guards reject delayed preset applies
after navigation, in addition to revision checks.

## Snapshot boundaries

Preset version 1 whitelists group/view/section placement, weights, selected
views, collapse, dock visibility and extent, and floating geometry. It excludes
props, bindings, storage namespaces, terminal ownership, focus, maximize, theme,
fonts and unknown extensions. Closed-panel history is omitted; unplaced panels
remain hidden. Moving or applying arrangements never owns or launches terminals.

Applying preserves current panel records and data, including extra panels absent
from the preset (which remain registered but hidden). A missing or reassigned
panel identity is rejected before import. Missing mod manifests produce an
actionable error. This first version reuses existing registered panel instances;
it does not create missing instances or convert legacy whole-window layouts.
Bindings are recorded by the engine but pinned-context delivery is still not
implemented, so presets must not claim to pin data.

Saved presets and working arrangements are deep copies. Editing or deleting a
preset never changes an applied arrangement. Whole-window layouts are listed
separately, offering Switch and Duplicate. Bundled originals remain read-only.
Cloning a panel-workspace layout now creates a distinct workspace file, without
overwriting any existing destination document. Existing files keep loading.

## Verification

Regression coverage includes format validation, independent working copies,
data/binding preservation, all preset transactions, concurrent writers, failed
writes, backup recovery, stable association keys, setting transitions, restart
and rapid navigation. An isolated native macOS test exercises the setting with
the Layouts panel absent, including renamed spaces and stale import rejection.
The runtime UI and full repository checks are recorded in the PR validation.
The live isolated macOS session exercised Save → Apply → Update → Rename →
Duplicate → Delete, restored two distinct arrangements across an app restart,
and verified both running test terminals remained present. The user app and
its Core were not restarted or installed over.
