import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const app = process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app');
const source = process.argv[2] || 'rigs-workspace';
const layout = JSON.parse(await readFile(join(app, 'layouts', source + '.json'), 'utf8'));
function find(n, id) { return n.id === id ? n : n.children?.map(c => find(c, id)).find(Boolean); }
const sidebar = find(layout, 'sidebar');
if (!sidebar?.children || find(layout, 'toolbox-tray')) throw new Error('Unsupported or already integrated layout');
sidebar.children.splice(1, 0, { id: 'toolbox-button', type: 'block', size: { px: 34 }, content: { mod: 'toolbox', props: { toolbar: true } } });
function wrap(n) {
  if (!n.children) return false;
  const i = n.children.findIndex(c => c.content?.tab === 'active');
  if (i < 0) return n.children.some(wrap);
  const original = n.children[i], size = original.size;
  delete original.size;
  n.children[i] = { id: 'toolbox-terminal-column', type: 'column', ...(size ? { size } : {}), children: [
    { id: 'toolbox-tray', type: 'block', hidden: true, size: { px: 220 }, min: 100, max: 500, content: { mod: 'toolbox' } }, original
  ] }; return true;
}
if (!wrap(layout)) throw new Error('No active terminal block');
await mkdir('prepared/layouts', { recursive: true });
await mkdir('prepared/mods', { recursive: true });
await cp('mods/toolbox', 'prepared/mods/toolbox', { recursive: true, filter: p => !/\.d\.ts$|jsconfig\.json$/.test(p) });
await writeFile('prepared/layouts/toolbox-workspace.json', JSON.stringify(layout, null, 2) + '\n');
console.log('Prepared independent Toolbox layout; existing files untouched.');
