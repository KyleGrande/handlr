// Configure Handlr Dev's Rigs integration. No compilation or app lifecycle work.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const handlr = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(handlr, '..');
const home = process.env.HERDR_APP_HOME || join(homedir(), '.config/handlr-dev');
const cli = resolve(repo, 'mods/rigs/bin/rig');
const profile = join(handlr, 'rig.handlr.json');
const report = join(home, 'data/handlr-dev-build-status.json');
function rig(args) {
  const result = spawnSync(cli, args, { encoding:'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.stdout || 'Rigs CLI unavailable');
  return JSON.parse(result.stdout);
}
const existing = existsSync(profile) ? rig(['profile','show','--profile',profile]) : null;
const document = existing ? JSON.parse(existing.content) : {version:1,repos:['app'],services:{},observed_apps:{}};
if (!document.repos.includes('app')) throw new Error('Expected an app repo slot in the Handlr development profile');
document.observed_apps ??= {};
document.observed_apps.desktop = {
  repo:'app',process_name:'Herdr',platform:'darwin',executable:join(homedir(),'Applications/Handlr Dev.app/Contents/MacOS/Herdr'),
  build_status_file:{path:report,max_age_seconds:90},
  development:{
    check:[process.execPath,join(handlr,'scripts/dev-build-status.mjs'),'--json','--report-file',report],
    rebuild:[process.execPath,join(handlr,'scripts/dev-app-action.mjs'),'rebuild'],
    relaunch:[process.execPath,join(handlr,'scripts/dev-app-action.mjs'),'relaunch'],
  },
};
if (existing) {
  const draft = join(handlr,'.rig-profile-draft-handlr-dev.json');
  writeFileSync(draft,JSON.stringify(document,null,2)+'\n');
  rig(['profile','update','--profile',profile,'--input',draft,'--revision',existing.revision,'--consume-input','true']);
} else {
  writeFileSync(profile,JSON.stringify(document,null,2)+'\n');
  rig(['create','handlr-dev','--profile',profile,'--repo',`app=${repo}`]);
}
// Remove only the dedicated badge node, preserving all other personal edits.
const layoutFile = join(home,'layouts/Handlr.json');
if (existsSync(layoutFile)) {
  const text = readFileSync(layoutFile,'utf8'), layout = JSON.parse(text);
  const removeBadge = node => { if (Array.isArray(node.children)) { node.children=node.children.filter(child=>child.id!=='handlr-dev-build-status'); node.children.forEach(removeBadge); } };
  removeBadge(layout);
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(layout)) {
    writeFileSync(`${layoutFile}.before-rigs-dev-tools`,text);
    writeFileSync(layoutFile,JSON.stringify(layout,null,2)+'\n');
  }
}
console.log('Configured Handlr Dev build status, Rebuild & reopen, and Reopen in Rigs. No app was built or restarted.');
