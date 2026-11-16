// Pure material/restoration logic. State belongs to the Settings mod, not Core.
const KEYS = ["background", "canvas", "chrome", "surface", "popover", "raised", "border"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = value => JSON.parse(JSON.stringify(value));
const alpha = (color, value) => /^#[\da-f]{6}([\da-f]{2})?$/i.test(color ?? "")
  ? color.slice(0, 7) + Math.round(value * 255).toString(16).padStart(2, "0") : color;

export function glassMaterial(baseline, blur) {
  const rgb = (baseline.background ?? '#17191d').slice(1, 7);
  const channels = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16));
  const dark = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 < 128;
  // Smoke must be denser in a dark theme to avoid a gray, washed-out window.
  // Lift its tint slightly so terminal cards do not become black wells.
  const tint = dark && blur ? '#' + channels.map(c => Math.round(c + (255 - c) * .06).toString(16).padStart(2, '0')).join('') : baseline.background;
  return {
    background: alpha(tint, blur ? (dark ? .82 : .20) : 1),
    canvas: alpha(baseline.canvas, blur ? .04 : 1),
    chrome: alpha(baseline.chrome, blur ? .10 : 1),
    surface: alpha(baseline.surface, blur ? (dark ? .36 : .55) : 1),
    popover: alpha(baseline.popover, 1), raised: alpha(baseline.raised, 1),
    // Preserve the theme's existing fine border instead of strengthening it.
    border: baseline.border,
    // The terminal paints its background twice; glyphs stay fully opaque.
    window_blur: blur, terminal_opacity: blur ? (dark ? .40 : .60) : 1,
  };
}

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
  const material = glassMaterial(baseline, blur);
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
  reconcileCards(next, entry, blur);
  entry.pending = true;
  return { root: next, state: entry };
}

export function glassCanBlur(platform, result) {
  return platform === "macos" && result?.code === 0 && result.stdout?.trim() === "blur";
}

// PaneFrame already supports shadows and rounding. Keep their provenance beside
// the color journal so disabling Glass never replays an old layout document.
function reconcileCards(root, entry, blur) {
  entry.cards ??= {};
  const visit = (node, path) => {
    const pane = node.content?.pane;
    if (pane) {
      const id = node.id ?? path;
      let card = Object.hasOwn(entry.cards, id) ? entry.cards[id] : null;
      if (!card && entry.enabled) {
        card = { saved: {}, applied: {}, protected: {} };
        Object.defineProperty(entry.cards, id, { value: card, enumerable: true, writable: true, configurable: true });
      }
      if (card) {
        const before = {};
        for (const [key, value] of Object.entries({ shadow: blur ? 'md' : undefined, radius: 12 })) {
          if (!Object.hasOwn(card.saved, key)) card.saved[key] = { had: Object.hasOwn(pane, key), value: pane[key] ?? null };
          if (Object.hasOwn(pane, key)) before[key] = pane[key];
          if (Object.hasOwn(card.applied, key) && !same(pane[key] ?? null, card.applied[key])
              && !(entry.pending && same(pane[key], card.before?.[key]))) card.protected[key] = true;
          if (card.protected[key]) continue;
          const target = entry.enabled && blur ? value : card.saved[key].had ? card.saved[key].value : undefined;
          if (target === undefined) delete pane[key]; else pane[key] = target;
          // Null is a journal sentinel for an absent field, since JSON omits undefined.
          card.applied[key] = target ?? null;
        }
        card.before = before;
      }
    }
    (node.children ?? []).forEach((child, index) => visit(child, `${path}/${index}`));
  };
  visit(root, 'root');
}
