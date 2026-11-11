import path from 'node:path';
import * as fs from 'node:fs/promises';
import { propose } from './init.js';
import { Rigs } from './lifecycle.js';
import { expandHome } from './profile.js';
import { requireValue as check } from './types.js';
import { ProcessObserver, resolveObservedApp, validateObservedApp } from './observe.js';
import type { ObservedApp } from './types.js';
import { Profiles } from './profiles.js';

const usage = `rig create <name> --profile <file> --repo <slot>=<checkout> [--repo ...]
rig plan|up|down <name> [--json]
rig approve <name> --review <fingerprint> [--decision key=value ...]
rig up|restart <name> [--review <fingerprint>] [--service <id>]
rig down <name> [--service <id>]
rig status [<name>] [--checkout <directory>] [--json]
rig logs <name> <service> [--json]
rig show <name>
rig configure <name> [--name <new-name>] [--profile <file>] [--repo <slot>=<checkout> ...] [--revision <from-show>]
rig delete <name> [--revision <from-show>]
rig profile list
rig profile show|import --profile <file>
rig profile update --profile <file> --input <edited-json-file> --revision <from-show>
rig profile delete --profile <file> --revision <from-show>
rig init --checkout <directory> --output <profile.json>
rig observe --process-name <executable-name> [--executable <path>] [--platform win32|darwin|linux] [--machine <Herdr-Windows-machine>]

Profiles contain executable project configuration. Review rig plan before rig up.
RIG_HOME selects the durable local registry. Managed endpoints bind to loopback.
observed_apps are read-only process matches; they never grant launch/stop ownership.
observe reports one snapshot without creating a rig or reserving resources.`;
export async function main(argv = process.argv.slice(2)) {
  const command = argv.shift();
  if (!command || ['help', '--help', '-h'].includes(command)) { console.log(usage); return; }
  const positional: string[] = [], options: Record<string,string[]> = {};
  while (argv.length) {
    const arg = argv.shift()!;
    if (arg === '--json') continue;
    if (arg.startsWith('--')) { check(argv[0] && !argv[0].startsWith('--'), `Missing value for ${arg}`); (options[arg] ??= []).push(argv.shift()!); }
    else positional.push(arg);
  }
  check(Object.keys(options).every(k => ['--profile','--repo','--checkout','--output','--review','--decision','--service','--process-name','--executable','--platform','--machine','--name','--revision','--input','--consume-input'].includes(k)), 'Unknown option; run rig help');
  const selections: Record<string,string> = {};
  for (const value of options['--repo'] ?? []) {
    const at = value.indexOf('='); check(at > 0 && at < value.length - 1, 'Use --repo slot=/concrete/worktree');
    check(!selections[value.slice(0, at)], 'Duplicate repo selection'); selections[value.slice(0, at)] = path.resolve(expandHome(value.slice(at + 1)));
  }
  const rigs = new Rigs(); let result: unknown;
  const name = positional[0];
  if (!['status','init','observe'].includes(command)) check(name, 'Specify a rig name');
  switch (command) {
    case 'profile': {
      const profiles = new Profiles(rigs.store), action = positional[0], file = options['--profile']?.[0];
      if (action === 'list') { result = await profiles.list(); break; }
      check(file, 'Select --profile <file>');
      if (action === 'show') result = await profiles.describe(file);
      else if (action === 'import') result = await profiles.register(file);
      else if (action === 'delete') {
        check(options['--revision']?.[0], 'Use --revision from profile show before deleting');
        result = await profiles.delete(file,options['--revision'][0]);
      } else if (action === 'update') {
        check(options['--revision']?.[0] && options['--input']?.[0], 'Use --input <edited-json-file> and --revision from profile show');
        const input = path.resolve(expandHome(options['--input'][0]));
        const consume = options['--consume-input']?.[0] === 'true';
        check(!consume || /^\.rig-profile-draft-[a-zA-Z0-9-]+\.json$/.test(path.basename(input)), 'Only generated profile drafts can be consumed');
        const content = await fs.readFile(input,'utf8');
        try { result = await profiles.update(file,content,options['--revision'][0]); }
        finally { if (consume) await fs.rm(input,{force:true}); }
      } else throw new Error('Use profile list|show|import|update|delete');
      break;
    }
    case 'observe': {
      check(options['--process-name']?.length === 1, 'Use observe --process-name <exact executable name>');
      const app: ObservedApp = {repo:'app', process_name:options['--process-name'][0],
        ...(options['--executable'] ? {executable:options['--executable'][0]} : {}),
        ...(options['--platform'] ? {platform:options['--platform'][0] as ObservedApp['platform']} : {}),
        ...(options['--machine'] ? {machine:options['--machine'][0]} : {})};
      validateObservedApp(app, 'app');
      result = {observed_apps:await new ProcessObserver().session()({app:resolveObservedApp(app, process.cwd())})};
      break;
    }
    case 'create': check(options['--profile']?.[0], 'Select --profile'); result = await rigs.create(name, path.resolve(expandHome(options['--profile'][0])), selections); break;
    case 'show': result = await rigs.definition(name); break;
    case 'delete': result = await rigs.delete(name, options['--revision']?.[0]); break;
    case 'configure': result = await rigs.configure(name, selections, {name:options['--name']?.[0],profile:options['--profile']?.[0],revision:options['--revision']?.[0]}); break;
    case 'plan': result = await rigs.plan(name); break;
    case 'approve': {
      check(options['--review']?.length === 1, 'Use approve <name> --review <fingerprint> from the plan you reviewed');
      const decisions: Record<string,string> = Object.create(null);
      for (const value of options['--decision'] ?? []) {
        const at = value.indexOf('='); check(at > 0, 'Use --decision key=value');
        const key = value.slice(0,at); check(!Object.hasOwn(decisions,key), 'Duplicate setup decision');
        decisions[key] = value.slice(at + 1);
      }
      result = await rigs.approve(name, options['--review'][0], decisions); break;
    }
    case 'up': result = await rigs.up(name, options['--review']?.[0], options['--service']?.[0]); break;
    case 'restart': result = await rigs.restart(name, options['--review']?.[0], options['--service']?.[0]); break;
    case 'down': result = await rigs.down(name, options['--service']?.[0]); break;
    case 'status': result = await rigs.status(name, options['--checkout']?.[0]); break;
    case 'logs': check(positional[1], 'Select a service'); result = await rigs.logs(name, positional[1]); break;
    case 'init': {
      check(options['--checkout']?.[0] && options['--output']?.[0], 'Use init --checkout <directory> --output <new-file>');
      const proposed = await propose(options['--checkout'][0]);
      await fs.writeFile(path.resolve(options['--output'][0]), JSON.stringify(proposed.profile, null, 2) + '\n', { flag: 'wx' });
      result = { outcome: Object.keys(proposed.profile.services).length ? 'review_required' : 'no_services', profile: options['--output'][0], checkout: proposed.root,
        discovery: proposed.discovery,
        review: proposed.profile.setup,
        next: Object.keys(proposed.profile.services).length ? 'Save the unapproved draft with create, then show plan and its proposed decisions. Ask only about material uncertainty. Approve the reviewed fingerprint before up; do not launch during discovery.' : 'No supported long-running services found. Read the evidence and report that result; add only a command supported by project documentation. Demo fixtures are a separate opt-in.' };
      break;
    }
    default: throw new Error(`Unknown command ${command}; run rig help`);
  }
  console.log(JSON.stringify({ schema_version: 1, outcome: 'ok', ...result as object }, null, 2));
}
main().catch(error => { console.log(JSON.stringify({ schema_version: 1, outcome: 'error', error: { message: error.message, action: 'Review inputs and Core availability; use rig status before retrying' } })); process.exitCode = 1; });
