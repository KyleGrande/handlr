// Development-only material study. Never reads or changes an installed app home.
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glassMaterial } from '../../defaults/frame/settings/glass-state.js';

const root = new URL('../../', import.meta.url);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const color = value => typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value);

// A reference light palette, matching the built-in Paper palette. These are
// prototype inputs, not new application defaults. Custom palettes can be passed in.
export const paper = {
  background: '#ffffff', foreground: '#25272c', selection: '#cfdcf5', cursor: '#25272c',
  ansi: ['#25272c', '#c62a2a', '#1a7f37', '#8f5d00', '#1f62d0', '#7a45c8', '#0f6f74', '#5f6068',
    '#7b7e87', '#d1242f', '#1f883d', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#111214'],
};

export function materialTheme(palette, glass) {
  for (const key of ['background', 'foreground', 'selection']) {
    if (!color(palette[key])) throw new Error(`Invalid palette ${key}`);
  }
  if (!Array.isArray(palette.ansi) || palette.ansi.length !== 16 || !palette.ansi.every(color)
    || (palette.cursor != null && !color(palette.cursor))) throw new Error('Invalid terminal palette');
  const colors = palette.colors ?? {};
  if (typeof colors !== 'object' || Array.isArray(colors) || !Object.values(colors).every(color)) {
    throw new Error('Invalid palette colors');
  }
  const bg = palette.background;
  const baseline = { background: bg, canvas: bg, chrome: bg, surface: bg, popover: bg, raised: bg, ...colors };
  const { window_blur, terminal_opacity, ...material } = glassMaterial(baseline, glass);
  return { ...structuredClone(palette), colors: { ...colors, ...material, 'glass-focus': material.background.slice(0, 7) + '38' } };
}

export function prototypeLayout(layout, material) {
  const out = structuredClone(layout);
  // This is an explicit study of the reference layout, never an installed layout
  // migration. Reject owned looks rather than accidentally flattening them.
  const owned = node => ['theme', 'colors', 'terminal_opacity'].some(key => Object.hasOwn(node, key))
    || (node.children ?? []).some(owned);
  if (owned(out)) throw new Error('Prototype requires a layout without theme, colors or terminal_opacity overrides');
  out.window_blur = material === 'glass';
  out.theme = { dark: `glass-study-${material}-dark`, light: `glass-study-${material}-light` };
  // Match the translucent resting terminals in the Settings controller.
  out.terminal_opacity = material === 'glass' ? 0.10 : 1;
  // A light panel tint adds separation without hiding the desktop.
  const panels = node => {
    if (node.content?.pane) {
      node.content.pane.background = 'surface';
      if (material === 'glass') {
        node.content.pane.shadow = 'sm'; node.content.pane.radius = 12;
        node.content.pane.focus_background = 'glass-focus';
      }
    }
    for (const child of node.children ?? []) panels(child);
  };
  panels(out);
  return out;
}

export async function preparePrototype({ platform = process.platform, dark, light = paper } = {}) {
  dark ??= await json(new URL('defaults/themes/atom-one-dark.json', root));
  const layout = await json(new URL('handlr/prototype/layouts/panel-workspace-native.json', root));
  const workspace = await json(new URL('handlr/prototype/workspaces/panel-workspace-native.json', root));
  // Match the portable Handlr seed: optional external panels are not installed
  // into a new scratch home. Preserve IDs and the remaining composition.
  const bundled = new Set(['files', 'changes', 'spaces', 'agents']);
  workspace.panels = Object.fromEntries(Object.entries(workspace.panels).filter(([, p]) => bundled.has(p.content.name)));
  for (const group of workspace.groups) {
    for (const view of group.views) view.sections = view.sections.filter(s => workspace.panels[s.panel_id]);
    group.views = group.views.filter(v => v.sections.length);
    if (!group.views.some(v => v.id === group.active_view_id)) group.active_view_id = group.views[0]?.id;
  }
  workspace.groups = workspace.groups.filter(g => g.views.length);
  for (const zone of Object.values(workspace.zones)) {
    zone.groups = zone.groups.filter(r => workspace.groups.some(g => g.id === r.group_id));
    zone.hidden = zone.groups.length === 0;
  }
  layout.workspace = 'Handlr';
  // Validate before creating anything. Each run gets a new home; no overwrite or
  // restoration state is needed and no installed settings are ever copied.
  const themes = {};
  for (const material of ['opaque', ...(platform === 'darwin' ? ['glass'] : [])]) {
    for (const [appearance, palette] of Object.entries({ dark, light })) {
      themes[`glass-study-${material}-${appearance}`] = materialTheme(palette, material === 'glass');
    }
  }
  const home = await mkdtemp(join(tmpdir(), 'herdr-glass-study-'));
  await mkdir(join(home, 'themes'));
  await mkdir(join(home, 'layouts'));
  await mkdir(join(home, 'workspaces'));
  const write = (path, value) => writeFile(join(home, path), JSON.stringify(value, null, 2) + '\n');
  await write('workspaces/Handlr.json', workspace);
  await copyFile(new URL('handlr/prototype/layouts/panel-workspace-native.svg', root), join(home, 'layouts/panel-workspace-native.svg'));
  for (const [name, theme] of Object.entries(themes)) await write(`themes/${name}.json`, theme);
  for (const material of ['opaque', ...(platform === 'darwin' ? ['glass'] : [])]) {
    await write(`layouts/glass-study-${material}.json`, prototypeLayout(layout, material));
  }
  await write('settings.json', { core_session: 'own', telemetry: false, appearance: 'system' });
  await write('shared.json', { layout: 'glass-study-opaque', 'frame.welcomed': 'skip' });
  // Explicitly override inherited Core addresses too: core_session:own preserves
  // inherited addresses by design, so that setting alone does not isolate a launch.
  return { home, env: {
    HERDR_APP_HOME: home, HC_SESSION: 'glass-study', HC_SOCKET: join(home, 'core.sock'),
    XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config'), XDG_RUNTIME_DIR: join(home, 'run'),
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node handlr/scripts/glass-prototype.mjs [--dark-theme palette.json] [--light-theme palette.json]\nCreates a fresh scratch home, initially opaque. Outputs JSON containing the home and isolated launch environment.');
  } else {
    const options = {};
    while (args.length) {
      const key = args.shift();
      if (!['--dark-theme', '--light-theme'].includes(key) || !args.length) throw new Error('Use --help for arguments');
      options[key === '--dark-theme' ? 'dark' : 'light'] = await json(resolve(args.shift()));
    }
    console.log(JSON.stringify(await preparePrototype(options), null, 2));
  }
}
