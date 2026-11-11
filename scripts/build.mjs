import { mkdir, copyFile, readFile, writeFile, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const app = process.env.HERDR_APP_HOME || join(homedir(), '.config/herdr-app');
await mkdir('.host', { recursive: true });
for (const name of ['herdr.d.ts', 'gpui-kit.d.ts']) await copyFile(join(app, name), join('.host', name));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.native.json'], { stdio: 'inherit' });
{
  const dir = 'build/mods/context';
  await mkdir(dir, { recursive: true });
  await cp('build/native/native', join(dir, 'native'), { recursive: true });
  await cp('build/native/src', join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'main.js'), "export { default } from './native/panel.js';\n");
  await writeFile(join(dir, 'mod.json'), JSON.stringify({ place: 'none', button: { label: 'Context', icon: 'context.svg', opens: 'panel', order: 30 } }, null, 2) + '\n');
  await copyFile('mods/context/notes.svg', join(dir, 'context.svg'));
}
console.log(`Built CLI and native Context against ${resolve(app)}.`);
