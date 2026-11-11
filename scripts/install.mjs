import { execFileSync } from 'node:child_process';
import { mkdir, cp, access, readFile, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const app = process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app');
execFileSync(process.execPath, ['scripts/prepare-install.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
// Run directly: Herdr submits its checker to the GUI session through launchd.
execFileSync('herdr-app', ['check', 'mods/toolbox'], { stdio: 'inherit', timeout: 60000 });
execFileSync('herdr-app', ['check', 'mods/toolbox-tabs'], { stdio: 'inherit', timeout: 60000 });
const destination = join(app, 'mods/toolbox');
const tabbar = join(app, 'mods/toolbox-tabs');
const layout = join(app, 'layouts/toolbox-workspace.json');
const stamp = Date.now();
const backups = [];
async function backup(path) {
  try { await access(path); } catch { return; }
  const saved = `${path}.backup-${stamp}`;
  await cp(path, saved, { recursive: true }); backups.push({ path, saved });
}
await backup(destination); await backup(tabbar); await backup(layout);
try {
  await mkdir(join(app, 'mods'), { recursive: true });
  await mkdir(join(app, 'layouts'), { recursive: true });
  await cp('prepared/mods/toolbox', destination, { recursive: true });
  await cp('prepared/mods/toolbox-tabs', tabbar, { recursive: true });
  await writeFile(layout, await readFile('prepared/layouts/toolbox-workspace.json'));
  execFileSync('herdr-app', ['do', 'layout.switch', JSON.stringify({ name: 'toolbox-workspace' })], { stdio: 'inherit', timeout: 15000 });
} catch (error) {
  // Restore overwritten files; remove only newly created Toolbox destinations.
  for (const path of [destination, tabbar, layout]) {
    const old = backups.find(b => b.path === path);
    await rm(path, { recursive: true, force: true });
    if (old) await cp(old.saved, path, { recursive: true });
  }
  throw error;
}
console.log('Installed Toolbox and selected its layout. Backups:', backups.map(b => b.saved));
