import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyInstallation, writeMod } from './mod-files.js';
const root = process.cwd();
const update = process.argv.includes('--update');
const name = process.argv.slice(2).find(a => a !== '--update') ?? 'rigs';
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Use a simple mod folder name');
const app = process.env.HERDR_APP_HOME ?? path.join(os.homedir(), '.config/herdr-app');
const layoutName = `${name}-workspace`;
const layoutPath = path.join(app, 'layouts', `${layoutName}.json`);
const existingLayout = await fs.readFile(layoutPath, 'utf8').then(JSON.parse).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
if (existingLayout && (!update || existingLayout.cloned_from?.name !== 'main')) throw new Error('Layout already exists; use --update only for this installation');
const destination = path.join(app, 'mods', name);
await fs.mkdir(path.dirname(destination), { recursive: true });
// Update only a generated installation belonging to this checkout.
const cli = path.join(root, 'bin', 'rig');
try { await fs.mkdir(destination); } catch (e) {
  if (!update || (e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  await verifyInstallation(root,destination);
}
await writeMod(root,destination);
if (!existingLayout) execFileSync('herdr-app', ['do', 'layout.clone', JSON.stringify({name: 'main', as: layoutName})], { stdio: 'inherit' });
const tree = JSON.parse(await fs.readFile(layoutPath, 'utf8'));
const removeOldDock = (node: {children?: {content?: {mod?:string}}[]}) => {
  if (!node.children) return;
  node.children = node.children.filter(child => child.content?.mod !== name);
  for (const child of node.children) removeOldDock(child as typeof node);
};
removeOldDock(tree);
const sidebar = tree.children.find((n: {id:string}) => n.id === 'sidebar');
if (!sidebar) throw new Error('The cloned layout has no sidebar');
const priorLists = sidebar.children.find((node: {id:string}) => node.id === 'sidebar-lists');
const priorSizes = new Map((priorLists?.children ?? []).map((node: {id:string;size?:unknown}) => [node.id,node.size]));
const index = sidebar.children.findIndex((n: {id:string}) => n.id === 'sidebar-lists');
if (index < 0) throw new Error('The cloned layout has no sidebar-lists');
sidebar.children.splice(index, 1,
  { id: 'sidebar-lists', type: 'column', children: [
    { id: 'spaces', type: 'block', size: priorSizes.get('spaces') ?? {weight: 1}, min: 90, content: {mod:'spaces'} },
    { id: 'agents', type: 'block', size: priorSizes.get('agents') ?? {weight: 1}, min: 90, content: {mod:'agents'} },
    { id: 'rigs', type: 'block', size: {weight: 1.5}, min: 180, content: {mod: name, props: {nodeId: 'rigs'}} },
  ] });
sidebar.size ??= {px: 380};
tree.preview = `layouts/${layoutName}.svg`;
await fs.copyFile(path.join(root,'mods/rigs/layout-preview.svg'),path.join(app,'layouts',`${layoutName}.svg`));
await fs.writeFile(layoutPath, JSON.stringify(tree,null,2)+'\n');
console.log(`Installed ${destination} in the left sidebar of ${layoutName}.\nSpaces, Agents and Rigs are stacked in one sidebar. Click + in Rigs to copy the setup prompt for your existing agent.\nKeep this checkout at ${root}; the panel runs ${cli}.\nTo return to your previous layout: herdr-app do layout.switch '{"name":"main"}'`);
