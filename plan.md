# Glass UI mode

Status: proposed. This plan does not authorize changes to the app's core.

Implementation progress: the Settings Glass control and per-layout restoration
are implemented in mod code, with a continuing controller in bundled tabs.
No native APIs, commands, settings, model or layout-schema fields were added.
`handlr/scripts/glass-prototype.mjs` prepares isolated material studies. See
`docs/glass-prototype.md` for findings, usage and remaining visual validation.

## Goal

Add an opt-in glass finish that follows the current light or dark theme:
frosted window surfaces, subtle highlights, and crisp, fully opaque text.
Glass is off by default and preserves existing layouts and installed user data.

## Proposed appearance

- Frost the workspace background and panel headers.
- Give panels a slightly denser tint, thin borders, and restrained shadows.
- Keep menus, dialogs, and tooltips dense enough to read over busy backgrounds.
- Keep terminal backgrounds mostly opaque initially. Never lower text opacity.
- Support light and dark themes without replacing the user's chosen palette.
- Start with one tuned preset; defer opacity sliders until the default is proven.

## Existing foundations

The app already exposes root-level `window_blur`, theme colors with alpha, and
layout-level terminal background opacity. `src/window/titlebar.rs` applies the
native window background appearance. The Settings mod's Seamless preset in
`mods/frame/settings/main.js` demonstrates reversible color overrides, with
coverage in `handlr/tests/seamless.test.mjs`.

These are implementation starting points, not proof that every platform or
layout supports the intended appearance. Trace color precedence, root blur
updates, and platform behavior before choosing the final integration.

## Settings behavior

Add **Settings → Look → Glass**, initially off.

- Enabling Glass applies the tuned material while retaining the chosen theme.
- Glass and Seamless can be enabled independently or combined. Together they
  retain frost and the focused-terminal fill while removing panel fills,
  outlines and shadows. Each preset preserves its original restoration baseline.
- Disabling Glass restores previous overrides while preserving independent
  edits made while it was enabled.
- Theme and system appearance changes refresh the material appropriately.
- Respect layout-specific looks; do not silently rewrite bundled layouts.
- Unsupported blur or reduced-transparency environments use readable opaque
  surfaces. Investigate existing capability and accessibility signals before
  selecting how this fallback is triggered.

## Architecture and approval boundary

Keep controls, preset styling, and restoration state in the Settings mod where
existing APIs allow. Investigate whether it can reliably coordinate root blur,
theme changes, persistence, and layout switching without native additions.
Do not add herdr-core state for a visual preference.

Before adding to the app's model, layout documents, commands, native settings,
or shared mod APIs, answer the questions from `AGENTS.md` with evidence:

1. Does the app itself act on it?
2. Can only the app see it?
3. Can mods not do it correctly, even with care?

If all three are no, keep the behavior in mods. If native coordination is
necessary, document the smallest proposed change, discuss it with Can, and wait
for his go before implementing that portion. Preserve released behavior and
compatibility; discuss any breaking change before proceeding.

## Implementation steps

1. **Investigate rendering and ownership.** Trace theme resolution, nested
   backgrounds, layout look precedence, live blur updates, Settings persistence,
   and Seamless restoration. Determine which surfaces remain opaque and how
   accessibility or missing blur support is detected.
2. **Build an isolated macOS prototype.** Use a personal layout with
   `window_blur: true` and translucent color overrides. Check for stacked opacity
   that hides the effect. Tune the finish over bright, dark, and busy desktop
   backgrounds. Keep the prototype reversible and separate from real user data.
3. **Review the material.** Verify terminal readability and light/dark appearance
   before adding permanent controls. Select conservative surface opacity and
   border values from the prototype rather than hard-coding speculative values.
4. **Integrate the Settings control.** Implement mod-owned styling and saved
   state where practical. Handle Glass/Seamless transitions, custom edits, theme
   changes, layout switching, and restart. Obtain Can's approval first for any
   required core additions.
5. **Verify platform behavior.** Enable the feature on each platform only after
   native UI checks there. Keep genuine OS differences behind the existing
   platform boundary or one small module per concern. Provide an opaque fallback
   and verify reduced-transparency behavior.
6. **Document and prepare review.** Update `defaults/AGENTS.md` in the same change
   as user-facing behavior. Update `src/SKILL.md` if agent-facing behavior changes.
   Run relevant checks and open a PR to `master` for Can's review. Leave release
   notes to the repository's release-time changelog workflow.

## Acceptance criteria

- Glass is opt-in and follows both light and dark themes.
- Terminal text, icons, selections, focus indicators, and notifications remain
  legible over bright, dark, and busy backgrounds.
- Disabling Glass restores prior overrides without losing independent edits.
- Combining Glass and Seamless, or disabling either independently, does not
  corrupt saved appearance state.
- Theme changes, layout switching, and restart retain the intended preference
  without overriding layout-owned looks unexpectedly.
- Missing blur support and reduced transparency retain readable opaque surfaces.
- Existing personal themes, layouts, and workspace files continue to load.
- Scrolling and resizing show no material performance regression relative to
  the same workspace with Glass disabled.

## Validation

Add focused tests for restoration, independent edits, preset transitions,
appearance changes, and the chosen persistence behavior. Test fallback selection
where it is implemented. Run required repository checks appropriate to the scope.

Visually inspect focused and inactive windows, terminals, menus, dialogs,
resizing, fullscreen, and restart in an isolated app home and Core session.
Compare scrolling and resize performance against Glass disabled. Test macOS
changes on macOS and verify other platforms on their own systems before enabling
them. Use the Linux sandbox for Linux UI checks and shut it down afterward.
Never stop, signal, restart, or inject input into someone else's app or Core.

## First milestone and deferred scope

The first milestone is a reversible macOS prototype demonstrating the material,
readability, and performance before permanent controls are added.

Defer multiple material presets, arbitrary opacity sliders, animated refraction,
and per-panel material editors. Resolve whether existing mod APIs can coordinate
blur, how layout overrides interact with Glass, and how fallback conditions are
observed during investigation rather than assuming new core fields are needed.
