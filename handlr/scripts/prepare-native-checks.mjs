import { mkdir, copyFile, writeFile } from 'node:fs/promises';

const destination = new URL('../.checks/tabs/', import.meta.url);
await mkdir(destination, { recursive: true });
const source = new URL('../prototype/mods/workspace-prototype/', import.meta.url);
for (const [from, to] of [['main.js', 'controls.js'], ['actions.js', 'actions.js'], ['mod.json', 'mod.json']]) {
  await copyFile(new URL(from, source), new URL(to, destination));
}
await writeFile(new URL('main.js', destination), `import Controls from './controls.js';
export default class TabsCheck extends Controls {
  options() { return { role: 'tabs' }; }
}
`);
console.log('Prepared .checks/tabs for herdr-app check');
