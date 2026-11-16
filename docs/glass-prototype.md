# Glass material study

The Settings control is implemented in `defaults/frame/settings/main.js`.
`glass.js` owns per-layout preference and restoration in the mod-owned
`glass.json` file. A copy runs inside bundled tabs so theme/accessibility changes
continue to update the material after Settings closes. Preset styling and
restoration remain mod-owned. Kyle approved the optional local pane-frame
`focus_background` rendering field on 2026-11-16: it changes only the focused
terminal’s fill, leaving other panes translucent. No native setting, command,
shared mod API or Core state was added.
The native workspace adapter now carries the file root's existing look and
`window_blur` onto the displayed wrapper root, including maximized groups.
Previously it kept those fields only on the nested center, so root material and
blur changes had no effect in Handlr. This restores existing layout behavior
without adding native fields. A regression test covers normal/maximized layouts
and reverting to opaque defaults.

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
files with `--dark-theme` and `--light-theme` to study another palette. Text,
selection, focus and custom border colors stay under theme control. Glass lifts
the dark background tint 6% toward white to avoid black terminal wells. Its
backdrop uses 30% tint in dark themes and 18% in light themes; canvas adds
2% and chrome 6%. Panel surfaces use 14%. Resting terminal backgrounds use 10%
per paint pass (two passes), over a `surface` card background. Only the focused
terminal gets a 70% tinted `focus_background` on its frame. The renderer follows
focus immediately; mods do not poll focus or rewrite layout files on clicks.
Glyphs and explicitly colored application cells stay opaque. Popovers and
raised controls retain dense fills for readability.

Terminal cards use soft shadows and 12px corners. Their background, focused
background, shadow and radius are journaled; disabling Glass restores prior
values and preserves independent edits without replaying layout structure.
Opaque accessibility fallback restores the authored pane fills.

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
  the terminal palette uses background RGB. Glass lifts dark background RGB slightly while keeping foreground and ANSI
  colors unchanged; terminal opacity applies only to background painting.
- `defaults/frame/settings/main.js`: Seamless saves its own color overrides and
  restores only values it still owns. A future material must restore Seamless
  before capturing a baseline, and must remain active when Settings is closed.
- `defaults/herdr.d.ts`: `window()` exposes OS, focus and window state, but no
  reduced-transparency or blur-capability signal.
- `vendor/gpui-pre-macos/src/window.rs`: older macOS uses NSVisualEffectView;
  macOS 26 uses a window-server blur call whose result is not exposed to mods.
  This code does not provide a reliable accessibility/capability fallback.

## Architecture boundary

The preset adds no model/Core state, command, native setting or shared mod API.
The only local layout addition is the Kyle-approved optional pane-frame
`focus_background` fill. Existing mod execution provides the reduced-transparency
read; the control does not require native accessibility APIs.
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
pass for Settings and tabs. The optimized macOS app build and all 44 native
layout/adapter tests pass, including the root-material regression.

Quit only the scratch window when done; its Core/terminal lifetime is independent.
Never stop or restart another app/Core to test the material.

### Material revision (2026-11-16)

Compared the open Rex Beta window and Handlr Dev using native screenshots.
The revised material uses a theme-dependent backdrop, translucent terminal
backgrounds, original border alpha, and softly shadowed, rounded terminal cards.
The mod test suite covers appearance refresh, card restoration, independent
edits, interrupted writes, and opaque accessibility fallback. The customized
local tabs mod required its unchanged glass controller file to be updated
explicitly; its unrelated customizations were preserved.

The live restoration journal confirmed both appearance palettes and their
adaptive fills were applied. Initial captures repeated a stale frame; raising
the window through its native accessibility action refreshed the render.
Subsequent captures verified the final light and dark materials: light terminal
cards are brighter than the surrounding workspace, and dark terminal cards use
a lifted tint over a deeper smoked backdrop. Light appearance was restored and
visually verified afterward. This is a focused material/contrast smoke check;
full accessibility, fullscreen and performance acceptance remains pending.

### Focus refinement (2026-11-16)

All panel/terminal fills are translucent at rest, with only the focused terminal
using a denser frame fill. The existing terminal opacity setting applies to
every terminal and the old pane focus field changes only the border, so mods
could not supply the independent focused fill. Kyle approved adding the
optional `content.pane.focus_background` field. Existing layouts without it
retain their previous rendering. Mod panes do not receive this focus fill.
