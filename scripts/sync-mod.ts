import os from 'node:os';
import path from 'node:path';
import { verifyInstallation, writeMod } from './mod-files.js';

const root = process.cwd(), name = process.argv[2] ?? 'rigs';
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Use a simple mod folder name');
const destination = path.join(process.env.HERDR_APP_HOME ?? path.join(os.homedir(),'.config/herdr-app'),'mods',name);
await verifyInstallation(root,destination);
await writeMod(root,destination);
console.log(`Updated ${destination}; layouts and rig services were not changed.`);
