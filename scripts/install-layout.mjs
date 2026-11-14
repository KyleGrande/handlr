// Clone the running workspace, retaining host-managed click settings through its clone API.
import { readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const host=process.env.HERDR_APP_HOME??join(homedir(),'.config/herdr-app');
const name=process.argv[2]??'ticket-workspace',toolbar=`${name}-tabs`;
if(!/^[a-z][a-z0-9-]{0,60}$/.test(name))throw new Error('Use a lowercase layout name with letters, digits, and hyphens.');
const call=(...args)=>execFileSync('herdr-app',args,{encoding:'utf8',timeout:30000});
const status=JSON.parse(call('status')),source=status.layout;
if(!source)throw new Error('No active Herdr layout.');
const sourcePath=join(host,'layouts',`${source}.json`);
const original=await readFile(sourcePath,'utf8'),tree=JSON.parse(original);
const find=(node,id)=>node?.id===id?node:(node?.children??[]).map(child=>find(child,id)).find(Boolean);
const tabs=find(tree,'tabs'),body=find(tree,'panel-body'),panel=find(tree,'panel');
if(!tabs?.content?.mod||body?.type!=='stack'||!panel)throw new Error('This layout does not have the expected workspace tabs and side-panel stack. No changes made.');
if(body.children.some(child=>child.id==='ticket'))throw new Error('This layout already has Ticket. No changes made.');
const sourceToolbar=tabs.content.mod,toolbarPath=join(host,'mods',sourceToolbar,'main.js');
const originalToolbar=await readFile(toolbarPath,'utf8');
const once=(text,from,to)=>{
  if(text.split(from).length!==2)throw new Error('The installed toolbar differs from the verified workspace version. No changes made.');
  return text.replace(from,to);
};
let code=once(originalToolbar,'...["context"]','...["context", "ticket"]');
code=once(code,'.child(panelButton("context", "Context", "mods/context/context.svg"))',
  `.child(panelButton("context", "Context", "mods/context/context.svg"))\n            .child(panelButton("ticket", "Ticket", "mods/${toolbar}/ticket.svg"))`);
for(const path of [join(host,'layouts',`${name}.json`),join(host,'mods',toolbar)]) {
  try {await access(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw new Error(`Destination already exists: ${path}. Choose another layout name; no files were overwritten.`);
}
await access(join(host,'mods/ticket/main.js'));
call('check',join(host,'mods/ticket'));
// The cloned toolbar gets its own per-space panel preferences; the original remains untouched.
call('do','mod.clone',JSON.stringify({name:sourceToolbar,as:toolbar}));
await writeFile(join(host,'mods',toolbar,'ticket.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4z"/><path d="M15 5v3m0 3v2m0 3v3"/></svg>\n');
await writeFile(join(host,'mods',toolbar,'main.js'),code);
call('check',join(host,'mods',toolbar));
call('do','layout.clone',JSON.stringify({name:source,as:name}));
try {
  const target=join(host,'layouts',`${name}.json`),copy=JSON.parse(await readFile(target,'utf8'));
  find(copy,'tabs').content.mod=toolbar;
  find(copy,'panel-body').children.push({id:'ticket',type:'block',content:{mod:'ticket',props:{nodeId:'ticket'}}});
  find(copy,'panel-body').active='ticket';
  find(copy,'panel').hidden=false;
  find(copy,'panel').size={px:460};
  find(copy,'panel').min=380;
  copy.preview=`layouts/${name}.svg`;
  const preview='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" rx="12" fill="#17191c"/><rect x="8" y="8" width="150" height="384" rx="8" fill="#202225"/><rect x="166" y="48" width="258" height="344" rx="8" fill="#131619"/><rect x="432" y="48" width="200" height="344" rx="8" fill="#202225"/><g fill="#b8bec7" font-family="sans-serif" font-size="12"><text x="22" y="34">Herdr</text><text x="22" y="70">Spaces</text><text x="22" y="170">Agents</text><text x="22" y="270">Rigs</text><text x="182" y="76">Your terminals</text><text x="280" y="29">Context</text><text x="350" y="29" fill="#a6b8d8">Ticket</text><text x="406" y="29">Toolbox</text><text x="447" y="76" font-size="16">Ticket</text><text x="447" y="109">Focused · All · Watching</text><text x="447" y="153">Tasks and pull requests</text><text x="447" y="181">Repositories / checkouts</text><text x="447" y="230">Copy links · Copy status</text></g></svg>\n';
  await writeFile(join(host,'layouts',`${name}.svg`),preview);
  await writeFile(target,JSON.stringify(copy,null,2)+'\n');
  const unchanged=(await readFile(sourcePath,'utf8'))===original&&(await readFile(toolbarPath,'utf8'))===originalToolbar;
  if(!unchanged)throw new Error('The source layout or toolbar changed during installation. Review concurrent changes.');
  console.log(JSON.stringify({ok:true,layout:name,based_on:source,toolbar,source_preserved:true,layout_file:target,source_sha256:createHash('sha256').update(original).digest('hex')}));
} catch(error) {
  call('do','layout.switch',JSON.stringify({name:source}));
  throw error;
}
