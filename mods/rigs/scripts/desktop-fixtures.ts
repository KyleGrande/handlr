/** Prepare disposable inputs for real panel acceptance; does not start or register rigs. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const root = await fs.mkdtemp(path.join(os.tmpdir(),'rigs-desktop-'));
for (const name of ['mono','frontend','backend']) {
  const directory = path.join(root,name); await fs.mkdir(directory);
  execFileSync('git',['init','-q',directory]);
  await fs.copyFile('fixtures/service.ts',path.join(directory,'service.ts'));
  execFileSync('git',['-C',directory,'add','.']);
  execFileSync('git',['-C',directory,'-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','disposable fixture']);
  execFileSync('git',['-C',directory,'checkout','-qb',name === 'backend' ? 'feature/tax' : 'feature/checkout']);
}
for (const file of ['monorepo.json','multi-repo.json']) await fs.copyFile(path.join('fixtures',file),path.join(root,file));
const suffix=path.basename(root).replace('rigs-desktop-','').toLowerCase();
const manifest={root,rigs:[
  {name:`acceptance-mono-${suffix}`,profile:path.join(root,'monorepo.json'),checkouts:{app:path.join(root,'mono')}},
  {name:`acceptance-split-${suffix}`,profile:path.join(root,'multi-repo.json'),checkouts:{frontend:path.join(root,'frontend'),backend:path.join(root,'backend')}},
],note:'No rigs have been registered or started. Import these profiles through the panel. Stop only these named rigs after acceptance; fixture files are retained.'};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
