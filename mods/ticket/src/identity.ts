import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execute } from './process.js';
import { TicketError } from './errors.js';
import type { Checkout, Issue } from './types.js';
const hash = (x:string) => createHash('sha256').update(x).digest('hex');
export async function machineIdentity(): Promise<string> {
  // Read the permanent Core identity directly: no dependency on a running Core or app.
  // An explicit path supports non-default sessions without guessing a global active session.
  const path = process.env.HERDR_TICKET_CORE_ID_FILE ?? join(process.env.XDG_STATE_HOME ?? join(homedir(),'.local/state'),'herdr-core/default/core.json');
  try {
    const core = JSON.parse(await readFile(path,'utf8'));
    if (typeof core.id === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(core.id)) return `core:${core.id}`;
  } catch { /* Fail closed; do not create machine identity during a read. */ }
  throw new TicketError('unverified_checkout','Cannot verify the local Core machine identity. Set HERDR_TICKET_CORE_ID_FILE to this machine’s Core identity file.',5);
}
export async function identifyCheckout(path: string): Promise<Checkout> {
  try {
    const machine_id = await machineIdentity();
    const git = (args:string[]) => execute('git',['-C',path,...args],3000).then(x=>x.trim());
    const root = await realpath(await git(['rev-parse','--show-toplevel']));
    const dir = await realpath(await git(['rev-parse','--absolute-git-dir']));
    const common = await realpath(await git(['rev-parse','--path-format=absolute','--git-common-dir']));
    // Birth time + inode of both root and Git admin directory distinguish deleted/recreated lifetimes.
    const [rs,ds,cs] = await Promise.all([stat(root,{bigint:true}),stat(dir,{bigint:true}),stat(common,{bigint:true})]);
    if (!rs.birthtimeNs || !ds.birthtimeNs || !cs.birthtimeNs) throw new Error('filesystem lacks lifetime evidence');
    const life = (s:typeof rs) => `${s.dev}:${s.ino}:${s.birthtimeNs}`;
    const repository_id = `local-repo:${hash(`${machine_id}|${common}|${life(cs)}`)}`;
    const fingerprint = hash(`${machine_id}|${root}|${life(rs)}|${dir}|${life(ds)}|${repository_id}`);
    return {id:randomUUID(),machine_id,repository_id,path:root,git_dir:dir,fingerprint,branch:await git(['symbolic-ref','--short','-q','HEAD']).catch(()=>'(detached)'),verified_at:new Date().toISOString()};
  } catch (e) {
    if (e instanceof TicketError) throw e;
    throw new TicketError('unverified_checkout','Cannot verify this checkout’s Git identity and filesystem lifetime.',5);
  }
}
export async function availability(c:Checkout): Promise<{checkout:Checkout;availability:'verified'|'unavailable'; identity_issue:Issue|null}> {
  try {
    const current = await identifyCheckout(c.path);
    if (current.fingerprint !== c.fingerprint) return {checkout:c,availability:'unavailable',identity_issue:{code:'identity_changed',message:'Checkout identity changed. Explicitly remove and add the mapping to repair it.'}};
    return {checkout:{...c,branch:current.branch,verified_at:current.verified_at},availability:'verified',identity_issue:null};
  } catch { return {checkout:c,availability:'unavailable',identity_issue:{code:'checkout_unavailable',message:'Cannot verify this checkout on the local machine.'}}; }
}
