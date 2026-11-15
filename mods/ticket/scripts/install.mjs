import { mkdir, readFile, writeFile, lstat, readlink, symlink, rename, chmod } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
const repo=fileURLToPath(new URL('..',import.meta.url));
const host=process.env.HERDR_APP_HOME??join(homedir(),'.config/herdr-app');
const target=join(host,'mods/ticket');
const bin=process.env.HERDR_TICKET_BIN??join(homedir(),'.local/bin/herdr-ticket');
const digest=x=>createHash('sha256').update(x).digest('hex');
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
// Read and validate all inputs and collision checks before writing to the host.
await readFile(join(repo,'dist/src/cli.js'));
const files={};
for(const name of ['main.js','mod.json'])files[name]=await readFile(join(repo,'build/ticket',name),'utf8');
files['runtime.js']=`// Installed by herdr-ticket. Reinstall after moving the repository.\nexport const runtime = ${JSON.stringify({node:process.execPath,cli:join(repo,'dist/src/cli.js'),store:process.env.HERDR_TICKET_STORE?resolve(process.env.HERDR_TICKET_STORE):null})};\n`;
if(await exists(target)) {
  let manifest;try{manifest=JSON.parse(await readFile(join(target,'.ticket-install.json'),'utf8'));}catch{throw new Error('Existing ticket mod is not managed by this installer. Choose another HERDR_APP_HOME; no files were replaced.');}
  for(const name of Object.keys(files)) {
    const current=await readFile(join(target,name));
    if(manifest.hashes?.[name]!==digest(current))throw new Error(`Ticket mod ${name} has local edits. Preserve them before reinstalling.`);
  }
}
const source=join(repo,'bin/herdr-ticket');
if(await exists(bin)) {
  const info=await lstat(bin);
  if(!info.isSymbolicLink()||resolve(dirname(bin),await readlink(bin))!==source)throw new Error('CLI destination already exists and belongs to another installation. Set HERDR_TICKET_BIN.');
}
await mkdir(join(host,'mods'),{recursive:true});await mkdir(dirname(bin),{recursive:true});
await chmod(source,0o755);
// Stage a complete mod before making it visible. Updates retain host-generated declarations.
const stage=join(host,'mods',`.ticket-stage-${randomUUID()}`);
await mkdir(stage);
for(const [name,body] of Object.entries(files))await writeFile(join(stage,name),body);
await writeFile(join(stage,'.ticket-install.json'),JSON.stringify({repository:repo,hashes:Object.fromEntries(Object.entries(files).map(([name,body])=>[name,digest(body)]))},null,2));
if(await exists(target)) {
  for(const [name,body] of Object.entries(files))await rename(join(stage,name),join(target,name));
  await rename(join(stage,'.ticket-install.json'),join(target,'.ticket-install.json'));
  const { rmdir }=await import('node:fs/promises');await rmdir(stage);
} else await rename(stage,target);
if(!await exists(bin))await symlink(source,bin);
console.log(JSON.stringify({ok:true,mod:target,cli:bin,store:process.env.HERDR_TICKET_STORE??join(homedir(),'.local/share/herdr-ticket/store.json'),open:'herdr-app do mod.open --name ticket',layout_changed:false}));
