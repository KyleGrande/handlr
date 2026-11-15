import { readFile, access, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const run = promisify(execFile);
const sources = JSON.parse(await readFile(new URL('./rust-check-sources.json',import.meta.url),'utf8'));
await mkdir('.tools/vendor',{recursive:true});
await Promise.all(sources.map(async source=>{
  const directory=resolve('.tools/vendor',source.directory);
  try { await access(directory); }
  catch {
    await run('gh',['repo','clone',source.repository,directory,'--','--depth','1','--revision',source.revision],{maxBuffer:1024*1024});
  }
  const {stdout}=await run('git',['-C',directory,'rev-parse','HEAD']);
  if(stdout.trim()!==source.revision) throw new Error(`Wrong dependency revision in ${directory}; left untouched`);
}));
console.log('Verified pinned upstream sources for the offline engine check');
