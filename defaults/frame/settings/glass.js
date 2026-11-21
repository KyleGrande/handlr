import { appHome, exec, layout, layouts, notify, readTextFile, run, settings, shared, setShared, themes, window, writeTextFile } from "herdr";
import { newGlassState, reconcileGlass, glassCanBlur, glassBackgroundValue, glassCardFill } from "./glass-state.js";

const SHIPPED = ["main", "terminals", "win98"];
const ACCESSIBILITY = 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceTransparency ? "reduced" : "blur"';
const object = value => value && typeof value === "object" && !Array.isArray(value);
const parse = (raw, fallback) => {
  const value = raw === null ? fallback : JSON.parse(raw);
  if (!object(value)) throw new Error("Expected a JSON object");
  return value;
};
const path = name => `${appHome()}/layouts/${name}.json`;
const statePath = () => `${appHome()}/glass.json`;
const owner = `${Date.now()}-${Math.random()}`;
let accessibility = null, checked = 0, busy = false;

export function glassEnabled(name = shared("layout")) {
  return Boolean(shared("settings.glass")?.[name]);
}

export function glassBackground(name = shared("layout")) {
  return glassBackgroundValue(shared("settings.glass.background")?.[name]);
}

export function glassFrost(name = shared("layout")) {
  return glassBackgroundValue(shared("settings.glass.frost")?.[name]);
}

export function glassTerminal(name = shared("layout")) {
  const scoped = shared(settings().dark ? "settings.glass.terminal_dark" : "settings.glass.terminal_light")?.[name];
  const value = typeof scoped === "number" && Number.isFinite(scoped) ? scoped : shared("settings.glass.terminal")?.[name];
  if (typeof value === "number" && Number.isFinite(value)) return glassBackgroundValue(value);
  // Older layouts retain their current material until this slider is changed.
  const background = selectedPalette()?.background ?? (settings().dark ? "#17191d" : "#ffffff");
  return Math.round(parseInt(glassCardFill(background, glassFrost(name)).slice(-2), 16) * 100 / 255);
}

export function glassSupported() {
  const tabs = node => node?.content?.mod === "tabs" || (node?.children ?? []).some(tabs);
  return window()?.platform === "macos" && tabs(layout());
}

function publish(state) {
  setShared("settings.glass", Object.fromEntries(Object.entries(state.layouts).map(([name, entry]) => [name, Boolean(entry.enabled)])));
  setShared("settings.glass.background", Object.fromEntries(Object.entries(state.layouts).map(([name, entry]) => [name, glassBackgroundValue(entry.background)])));
  setShared("settings.glass.frost", Object.fromEntries(Object.entries(state.layouts).map(([name, entry]) => [name, glassBackgroundValue(entry.frost)])));
  for (const key of ["terminal", "terminal_light", "terminal_dark"]) {
    setShared(`settings.glass.${key}`, Object.fromEntries(Object.entries(state.layouts).map(([name, entry]) => [name, typeof entry[key] === "number" && Number.isFinite(entry[key]) ? glassBackgroundValue(entry[key]) : null])));
  }
  setShared("settings.glass.error", null);
}

async function locked(action) {
  const lock = shared("settings.glass.lock");
  if (busy || (lock && lock.owner !== owner && Date.now() - lock.at < 15000)) return false;
  busy = true;
  setShared("settings.glass.lock", { owner, at: Date.now() });
  try { await action(); return true; }
  finally { busy = false; if (shared("settings.glass.lock")?.owner === owner) setShared("settings.glass.lock", null); }
}

async function loadState() {
  const raw = await readTextFile(statePath());
  const state = parse(raw, { version: 1, layouts: {} });
  if (state.version !== 1 || !object(state.layouts)) throw new Error("Unsupported glass.json; leaving it unchanged");
  return { raw, state };
}

async function canBlur(force) {
  if (window()?.platform !== "macos") return false;
  if (force || Date.now() - checked > 15000) {
    checked = Date.now();
    try { accessibility = await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", ACCESSIBILITY], { timeout: 3000 }); }
    catch { accessibility = null; }
  }
  return glassCanBlur(window()?.platform, accessibility);
}

function selectedPalette() {
  const s = settings();
  return themes().find(item => item.name === (s.dark ? s.theme_dark : s.theme_light))?.colors;
}

async function sync(state, raw, name, force = false) {
  const entry = Object.hasOwn(state.layouts, name) ? state.layouts[name] : null;
  if (!entry) { publish(state); return; }
  // Never write bundled layouts, even if somebody edits our private state file.
  if (SHIPPED.includes(name) || !/^[^/\\.][^/\\]*$/.test(name)) throw new Error("Glass requires a personal layout");
  const rootRaw = await readTextFile(path(name));
  if (rootRaw === null) return;
  const root = parse(rootRaw);
  const palette = selectedPalette();
  if (!palette) throw new Error("The current theme is unavailable");
  const person = parse(await readTextFile(`${appHome()}/settings.json`), {});
  const next = reconcileGlass(root, entry, palette, person.colors ?? {}, entry.enabled && await canBlur(force), Boolean(person.seamless));
  const changed = JSON.stringify(root) !== JSON.stringify(next.root);
  if (changed) {
    // Persist restoration provenance before touching the layout. A crash or
    // concurrent edit can then recover from either side of this guarded write.
    state.layouts[name] = next.state;
    const pending = JSON.stringify(state, null, 2) + "\n";
    await writeTextFile(statePath(), pending, raw);
    raw = pending;
    await writeTextFile(path(name), JSON.stringify(next.root, null, 2) + "\n", rootRaw);
  }
  if (entry.enabled) {
    next.state.pending = false;
    delete next.state.before;
    state.layouts[name] = next.state;
  } else delete state.layouts[name];
  const committed = JSON.stringify(state, null, 2) + "\n";
  if (committed !== raw) await writeTextFile(statePath(), committed, raw);
  publish(state);
}

export async function setGlass(enabled) {
  if (enabled && !glassSupported()) throw new Error("Glass requires a macOS layout with bundled tabs");
  const completed = await locked(async () => {
    let name = String(shared("layout") ?? "main");
    const { state, raw } = await loadState();
    const rootRaw = await readTextFile(path(name));
    if (rootRaw === null) throw new Error("Cannot read the current layout");
    const root = parse(rootRaw);
    let cloned = false;
    if (enabled && SHIPPED.includes(name)) {
      const base = `${name}-glass`;
      name = base;
      for (let i = 2; layouts().includes(name); i++) name = `${base}-${i}`;
      // Preserve the currently chosen themes, which may be click-state rather
      // than fields in the shipped file. Never serialize the projected workspace.
      root.theme = { light: settings().theme_light, dark: settings().theme_dark };
      await writeTextFile(path(name), JSON.stringify(root, null, 2) + "\n", null);
      cloned = true;
    }
    if (!Object.hasOwn(state.layouts, name)) Object.defineProperty(state.layouts, name, {
      value: newGlassState(root), enumerable: true, writable: true, configurable: true,
    });
    state.layouts[name].enabled = enabled;
    const updated = JSON.stringify(state, null, 2) + "\n";
    await writeTextFile(statePath(), updated, raw);
    await sync(state, updated, name, true);
    if (cloned) run("layout.switch", { name });
  });
  if (!completed) throw new Error("Appearance is updating; try again in a moment");
}

export async function setGlassBackground(value, name = String(shared("layout") ?? "main")) {
  return setGlassFinish({ background: value }, name);
}

export async function setGlassFinish(values, name = String(shared("layout") ?? "main")) {
  const completed = await locked(async () => {
    const { state, raw } = await loadState();
    const entry = state.layouts[name];
    if (!entry?.enabled) return;
    for (const key of ["background", "frost", "terminal", "terminal_light", "terminal_dark"]) {
      if (Object.hasOwn(values, key)) entry[key] = glassBackgroundValue(values[key]);
    }
    const updated = JSON.stringify(state, null, 2) + "\n";
    await writeTextFile(statePath(), updated, raw);
    // Save a delayed edit to its owner, but wait for that layout to be selected
    // before applying material with the active layout's resolved palette.
    if (String(shared("layout") ?? "main") === name) await sync(state, updated, name);
    else publish(state);
  });
  if (!completed) throw new Error("Appearance is updating; try again in a moment");
}

export async function disableAllGlass() {
  const completed = await locked(async () => {
    let { state, raw } = await loadState();
    for (const name of Object.keys(state.layouts)) {
      state.layouts[name].enabled = false;
      const updated = JSON.stringify(state, null, 2) + "\n";
      await writeTextFile(statePath(), updated, raw);
      await sync(state, updated, name);
      ({ state, raw } = await loadState());
    }
  });
  if (!completed) throw new Error("Appearance is updating; try again in a moment");
}

export function startGlass(cx) {
  const refresh = cx => cx.spawn(async cx => {
    try {
      await locked(async () => {
        const { raw, state } = await loadState();
        await sync(state, raw, String(shared("layout") ?? "main"));
      });
    } catch (error) {
      // Retry guarded writes after concurrent edits; report only once per view.
      if (!shared("settings.glass.error")) notify({ title: "Glass could not update", body: String(error?.message ?? error), level: "error" });
      setShared("settings.glass.error", true);
    }
    cx.notify();
  });
  refresh(cx);
  cx.timer.every(3000, refresh);
}
