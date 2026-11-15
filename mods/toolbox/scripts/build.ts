import { execFileSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Use declarations from the installed runtime, never a committed snapshot.
const app = process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app');
await mkdir('.types', { recursive: true });
for (const name of ['gpui-kit.d.ts', 'herdr.d.ts']) {
  await cp(join(app, name), join('.types', name));
}
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', ...process.argv.slice(2)], { stdio: 'inherit' });
if (!process.argv.includes('--noEmit')) {
  for (const mod of ['toolbox', 'toolbox-tabs']) {
    await cp(`mods/${mod}`, `dist/mods/${mod}`, { recursive: true, filter: path => !/\.(?:ts|js)$|jsconfig\.json$/.test(path) });
  }
}
