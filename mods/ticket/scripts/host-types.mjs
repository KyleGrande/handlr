import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const host=process.env.HERDR_APP_HOME??join(homedir(),'.config/herdr-app');
await mkdir('.host',{recursive:true});
await writeFile('.host/gpui-kit.d.ts',await readFile(join(host,'gpui-kit.d.ts'),'utf8'));
await writeFile('.host/herdr.d.ts',`declare module "herdr" {\n${await readFile(join(host,'herdr.d.ts'),'utf8')}\n}`);
