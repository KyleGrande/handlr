import type { LayoutNode } from '../mods/layout.js';
import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const app = process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app');
const source = process.argv[2] || 'rigs-workspace';
const layout = JSON.parse(await readFile(join(app, 'layouts', source + '.json'), 'utf8'));
function find(n: LayoutNode, id: string): LayoutNode | undefined { return n.id === id ? n : n.children?.map(c => find(c, id)).find(Boolean); }
if (find(layout, 'toolbox-tray')) throw new Error('Layout already integrated');
const tabs = find(layout, 'tabs');
if (!tabs || tabs.content?.mod !== 'context-tabs') throw new Error('Expected personal Context tab bar');
tabs.content.mod = 'toolbox-tabs';
function wrap(n: LayoutNode): boolean {
  if (!n.children) return false;
  const i = n.children.findIndex(c => c.content?.tab === 'active');
  if (i < 0) return n.children.some(wrap);
  const original = n.children[i], size = original.size;
  delete original.size;
  n.children[i] = { id: 'toolbox-terminal-column', type: 'column', gap: original.content?.pane?.gap ?? 8, ...(size ? { size } : {}), children: [
    { id: 'toolbox-tray', type: 'block', hidden: true, size: { px: 220 }, min: 100, max: 500, content: { mod: 'toolbox' } }, original
  ] }; return true;
}
if (!wrap(layout)) throw new Error('No active terminal block');
await mkdir('prepared/layouts', { recursive: true });
await mkdir('prepared/mods', { recursive: true });
await cp('dist/mods/toolbox-tabs', 'prepared/mods/toolbox-tabs', { recursive: true, filter: p => !/\.d\.ts$|jsconfig\.json$/.test(p) });
await cp('dist/mods/toolbox', 'prepared/mods/toolbox', { recursive: true, filter: p => !/\.d\.ts$|jsconfig\.json$/.test(p) });
await writeFile('prepared/layouts/toolbox-workspace.json', JSON.stringify(layout, null, 2) + '\n');
console.log('Prepared independent Toolbox layout; existing files untouched.');
