// Pure material/restoration logic. State belongs to the Settings mod, not Core.
const KEYS = ["background", "canvas", "chrome", "surface", "popover", "raised", "border"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = value => JSON.parse(JSON.stringify(value));
const alpha = (color, value) => /^#[\da-f]{6}([\da-f]{2})?$/i.test(color ?? "")
  ? color.slice(0, 7) + Math.round(value * 255).toString(16).padStart(2, "0") : color;

export function newGlassState(root) {
  return { enabled: true, saved: {
    hadColors: Object.hasOwn(root, "colors"),
    colors: Object.fromEntries(KEYS.filter(key => Object.hasOwn(root.colors ?? {}, key)).map(key => [key, root.colors[key]])),
    ...Object.fromEntries(["window_blur", "terminal_opacity"].filter(key => Object.hasOwn(root, key)).map(key => [key, root[key]])),
  }, applied: {}, protected: {} };
}

// Compare only fields we own; layout structure and other colors are never saved
// or replayed. A pending write accepts either side of its write-ahead journal.
export function reconcileGlass(root, state, palette, personColors, blur) {
  const next = copy(root), entry = copy(state);
  const current = { ...(root.colors ?? {}), window_blur: root.window_blur, terminal_opacity: root.terminal_opacity };
  for (const [key, applied] of Object.entries(entry.applied)) {
    if (same(current[key], applied) || (entry.pending && same(current[key], entry.before?.[key]))) continue;
    entry.protected[key] = true;
  }
  // An independent decision to disable blur must also select readable fills.
  blur = blur && !(entry.protected.window_blur && root.window_blur !== true);
  const baseline = { ...palette, ...personColors, ...entry.saved.colors };
  const material = {
    background: alpha(baseline.background, blur ? 0.40 : 1),
    canvas: alpha(baseline.canvas, blur ? 0.30 : 1),
    chrome: alpha(baseline.chrome, blur ? 0.30 : 1),
    surface: alpha(baseline.surface, blur ? 0.80 : 1),
    popover: alpha(baseline.popover, 1), raised: alpha(baseline.raised, 1),
    border: alpha(baseline.border, blur ? 0.16 : 0.12),
    window_blur: blur, terminal_opacity: 1,
  };
  next.colors ??= {};
  for (const key of [...KEYS, "window_blur", "terminal_opacity"]) {
    if (entry.protected[key]) continue;
    const target = KEYS.includes(key) ? next.colors : next;
    const value = entry.enabled ? material[key] : (KEYS.includes(key) ? entry.saved.colors[key] : entry.saved[key]);
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
  if (!Object.keys(next.colors).length && (entry.enabled || !entry.saved.hadColors)) delete next.colors;
  entry.before = Object.fromEntries([...KEYS, "window_blur", "terminal_opacity"].filter(key => current[key] !== undefined).map(key => [key, current[key]]));
  entry.applied = Object.fromEntries([...KEYS, "window_blur", "terminal_opacity"].filter(key => !entry.protected[key]).map(key => [key,
    KEYS.includes(key) ? next.colors?.[key] : next[key]]).filter(([, value]) => value !== undefined));
  entry.pending = true;
  return { root: next, state: entry };
}

export function glassCanBlur(platform, result) {
  return platform === "macos" && result?.code === 0 && result.stdout?.trim() === "blur";
}
