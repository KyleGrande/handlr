import { watch } from 'node:fs';
import { spawn } from 'node:child_process';

const sync = process.argv.includes('--sync');
let child, pending = false, closing = false;
function run(argv) {
  return new Promise(resolve => {
    child = spawn(process.execPath,argv,{stdio:'inherit'});
    child.on('error', error => { console.error(error.message); resolve(false); });
    child.on('exit', code => resolve(code === 0));
  });
}
async function rebuild() {
  if (closing) return;
  if (child) { pending = true; return; }
  do {
    pending = false;
    const built = await run(['scripts/build-mod.mjs']);
    if (built && sync && !closing) await run(['dist/scripts/sync-mod.js']);
    child = undefined;
  } while (pending && !closing);
}
// Watch sources only: emitted JS/docs must never trigger another build.
const watchers = [
  watch('mods/rigs',(_event,file) => { if (file?.endsWith('.ts')) void rebuild(); }),
  watch('.',(_event,file) => { if (file === 'AGENTS.md') void rebuild(); }),
  watch('scripts',(_event,file) => { if (file === 'build-mod.mjs') void rebuild(); }),
  watch('src',(_event,file) => { if (file === 'types.ts') void rebuild(); }),
];
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => {
  closing = true; for (const watcher of watchers) watcher.close(); child?.kill(signal);
});
console.log(`Watching native mod sources${sync ? ' and syncing this checkout’s installed rigs mod' : ''}.`);
void rebuild();
