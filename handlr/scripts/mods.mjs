// Run each mod in its own package, retaining its lockfile and compiler version.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bundledModNames } from './mod-sources.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const mods = {
  toolbox: { build: ['build'], native: ['dist/mods/toolbox', 'dist/mods/toolbox-tabs'] },
  context: { build: ['build'], native: ['build/mods/context'] },
  rigs: { build: ['build', 'build:mod'], native: ['mods/rigs'] },
  ticket: { build: ['build'], native: ['build/ticket'] },
};
for (const name of [...bundledModNames(root), ...readdirSync(join(root, 'mods/frame'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => `frame/${entry.name}`), 'workspace-prototype']) {
  mods[name] = { raw: true, native: ['.'] };
}
const jsFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? jsFiles(path) : entry.name.endsWith('.js') ? [path] : [];
});
const [action, ...selected] = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(mods);
if (!['install', 'build', 'test', 'check'].includes(action) || names.some(name => !Object.hasOwn(mods, name))) {
  console.error('Usage: node scripts/mods.mjs install|build|test|check [toolbox|context|rigs|ticket|machines|layouts|frame/settings|other bundled mod ...]');
  process.exit(1);
}
for (const name of names) {
  const cwd = fileURLToPath(new URL(`../../mods/${name}/`, import.meta.url));
  const run = (command, args) => {
    console.log(`\n${name}: ${command} ${args.join(' ')}`);
    // Only npm.cmd needs a shell; executable paths/arguments may contain spaces.
    const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: command.endsWith('.cmd') });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (mods[name].raw) {
    if (action === 'install') console.log(`${name}: no package dependencies`);
    else {
      for (const path of jsFiles(cwd)) run(process.execPath, ['--check', path]);
      if (action === 'check') run('herdr-app', ['check', '.']);
    }
  } else if (action === 'install') run(npm, ['ci']);
  else {
    for (const script of mods[name].build) run(npm, ['run', script]);
    if (action === 'test') run(npm, ['test']);
    if (action === 'check') for (const path of mods[name].native) run('herdr-app', ['check', path]);
  }
}

// Bundled JS has a shared regression suite rather than per-panel npm packages.
if (action === 'test' && names.some(name => mods[name].raw)) {
  const tests = join(root, 'handlr/tests');
  const result = spawnSync(process.execPath, ['--test', ...readdirSync(tests).filter(name => name.endsWith('.test.mjs')).sort().map(name => join(tests, name))], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
