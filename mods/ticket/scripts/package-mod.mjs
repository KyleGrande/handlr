import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
await mkdir('build/ticket',{recursive:true});
await copyFile('.artifacts/native/native/main.js','build/ticket/main.js');
await copyFile('native/mod.json','build/ticket/mod.json');
await writeFile('build/ticket/runtime.js',`// Repository build. The installer replaces this with absolute paths.\nexport const runtime = ${JSON.stringify({node:process.execPath,cli:fileURLToPath(new URL('../dist/src/cli.js',import.meta.url)),store:process.env.HERDR_TICKET_STORE??null})};\n`);
