# Glass material study

The Settings control is implemented in `defaults/frame/settings/main.js`.
`glass.js` owns per-layout preference and restoration in the mod-owned
`glass.json` file. A copy runs inside bundled tabs so theme/accessibility changes
continue to update the material after Settings closes. No native settings,
commands, layout-schema fields, mod APIs or Core state were added.

Settings → Look → Glass starts off. It is available on macOS layouts using
bundled tabs, including Handlr. Shipped layouts are copied before enabling;
personal layouts retain their composition, theme and unrelated colors. Glass
and Seamless are mutually exclusive in the UI. Disabling Glass restores fields
it still owns, preserving independent color, opacity, blur and structural edits.
The file writes use compare-and-swap guards and a write-ahead restoration journal.

Run `node handlr/scripts/sync-glass.mjs` after changing the controller. Module
imports cannot cross a mod's sandbox, so Settings and tabs carry synchronized
copies rather than adding a shared native API for this visual preference.

The controller refreshes every three seconds while Settings or bundled tabs is
loaded. It reads macOS's NSWorkspace reduced-transparency property using the
existing `exec` capability and system JXA bridge, at most every fifteen seconds.
Reduced transparency, unknown output and failed queries select opaque fills and
disable root blur. Startup may briefly show the previously persisted material
before the first refresh. Actual compositor blur failure is not observable via
the existing APIs; supported macOS blur remains a backend assumption. Other
platforms are unavailable pending native validation. Removing/replacing the
bundled tabs controller while Glass is active is not supported; disable it first.

Material tuning and full visual/performance acceptance remain pending. The
following tooling creates a separate scratch material study without touching the
installed window's data.

Run from the repository root:

```sh
node handlr/scripts/glass-prototype.mjs > /tmp/glass-study.json
```

The JSON contains a fresh temporary `home` and an `env` object. Launch the local
Handlr Dev executable with **all** those environment entries. They override
inherited Core addresses as well as the app home. `core_session: "own"` alone
preserves inherited Core addresses and is insufficient for this experiment.
Use the same environment for every subsequent app/Core command. Do not launch
through a wrapper that substitutes the normal development home.

The generated `glass-study-opaque` layout is selected initially. On macOS only,
`glass-study-glass` is available via `layout.switch {name}`. Both use the native
Handlr workspace with bundled Files, Changes, Spaces and Agents panels. Optional
Context, Toolbox and Rigs are omitted, matching the portable application's seed.
They share a workspace document so changing material retains the composition.
No installed settings, mods, layouts or workspace documents are copied or edited.

The reference palettes are Atom One Dark and Paper. Supply existing theme JSON
files with `--dark-theme` and `--light-theme` to study another palette. Palette
RGB, terminal colors, text, selections, focus colors and custom borders remain
unchanged. Only material surface alphas change. Terminals stay fully opaque.
The root background (40%) and canvas (30%) combine to approximately 58% opacity;
panel headers use a denser 78% surface. Popover and raised surfaces are opaque.
These are provisional study values, not visually approved values. Dialog/mod
content using `background` instead of `popover` can still be translucent.

Before switching to glass, check native reduced transparency, e.g. on macOS:

```sh
swift -e 'import AppKit; print(NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency)'
```

Keep the opaque layout if this returns true, fails, or blur is unavailable.
This is a manual development check, not an automatic accessibility fallback.
Do not infer accessibility state from a missing `defaults` preference key.
The opaque variant disables root blur and makes all material fills opaque.

## Investigation

- `src/settings.rs`: theme-file colors are resolved first, then personal colors,
  then layout-owned colors. Nested looks can override the root. A static global
  settings color override cannot follow arbitrary light/dark palettes by itself.
- `src/window.rs`: the outer window always paints `background` before the layout
  paints `canvas`. Making only panel surfaces translucent leaves an opaque floor.
- `src/window/titlebar.rs`: `apply_blur` runs during render and reads only root
  `window_blur`. Mods can edit a personal layout using existing commands; this
  requires ownership/restoration bookkeeping and cannot rewrite shipped layouts.
- `src/terminal.rs` and `src/vt.rs`: terminal opacity affects background painting;
  the terminal palette uses background RGB. Preserving RGB while adjusting alpha
  avoids substituting a different terminal palette.
- `defaults/frame/settings/main.js`: Seamless saves its own color overrides and
  restores only values it still owns. A future material must restore Seamless
  before capturing a baseline, and must remain active when Settings is closed.
- `defaults/herdr.d.ts`: `window()` exposes OS, focus and window state, but no
  reduced-transparency or blur-capability signal.
- `vendor/gpui-pre-macos/src/window.rs`: older macOS uses NSVisualEffectView;
  macOS 26 uses a window-server blur call whose result is not exposed to mods.
  This code does not provide a reliable accessibility/capability fallback.

## Architecture boundary

No model, layout schema, command, native setting or shared mod API was added.
The existing mod execution capability provides the reduced-transparency read;
the permanent control does not require the native additions initially considered.
If actual compositor capability or immediate native notifications are added,
discuss the smallest proposal with Can first. The AGENTS.md questions are:

1. Material styling itself is appearance only; it belongs in the Settings mod.
2. Native accessibility and actual blur availability are visible to the platform
   backend, and currently absent from the mod snapshot.
3. Mods can poll the native reduced-transparency property using `exec`; a
   continuing tabs controller handles the Settings lifecycle. They cannot detect
   actual compositor blur success through the current snapshot. Shell preference
   keys alone do not establish native accessibility state or blur support.

These findings do not authorize extending native APIs. Preset state, transitions
and color restoration stay in mods. Windows and Linux glass remain unavailable.

## Validation record

On 2026-11-15 the installed Handlr Dev 0.1.15 accepted generated layouts,
light/dark appearance changes and Settings commands in an isolated home/Core.
After correcting the prototype to use the native Handlr composition,
`workspace.inspect` returned the expected bundled panels and `status` reported
the Handlr layout with no errors. macOS reported reduced transparency false.

Visual acceptance is **not established**: `shot` repeatedly returned the same
stale frame, and Computer Use permission to inspect Handlr Dev was denied.
Focused/inactive appearance, bright/dark/busy backgrounds, menus, dialog
readability, resize/scroll performance, fullscreen, accessibility changes and
restart still require native verification. The installed binary was used for
this smoke check; no native source was changed or rebuilt.

Run `node --test handlr/tests/*.test.mjs` for prototype, control and existing
regression coverage. Tests cover palette preservation, independent edits/deletion,
appearance refresh, opaque fallback, Seamless transitions, restoring all layouts,
guarded-write conflicts, journal recovery, prototype isolation, platform gating,
valid workspace references and synchronized module copies. Native module checks
pass for Settings and tabs. The optimized macOS app build passes.

Quit only the scratch window when done; its Core/terminal lifetime is independent.
Never stop or restart another app/Core to test the material.
