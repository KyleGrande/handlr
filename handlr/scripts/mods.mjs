// Run each mod in its own package, retaining its lockfile and compiler version.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mods = {
  toolbox: { build: ['build'], native: ['dist/mods/toolbox', 'dist/mods/toolbox-tabs'] },
  context: { build: ['build'], native: ['build/mods/context'] },
  rigs: { build: ['build', 'build:mod'], native: ['mods/rigs'] },
  ticket: { build: ['build'], native: ['build/ticket'] },
};
const [action, ...selected] = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(mods);
if (!['install', 'build', 'test', 'check'].includes(action) || names.some(name => !Object.hasOwn(mods, name))) {
  console.error('Usage: node scripts/mods.mjs install|build|test|check [toolbox|context|rigs|ticket ...]');
  process.exit(1);
}
for (const name of names) {
  const cwd = fileURLToPath(new URL(`../../mods/${name}/`, import.meta.url));
  const run = (command, args) => {
    console.log(`\n${name}: ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (action === 'install') run(npm, ['ci']);
  else {
    for (const script of mods[name].build) run(npm, ['run', script]);
    if (action === 'test') run(npm, ['test']);
    if (action === 'check') for (const path of mods[name].native) run('herdr-app', ['check', path]);
  }
}
