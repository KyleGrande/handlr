#!/usr/bin/env node
import { readFile, rm, lstat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContextError, fail, target } from './model.js';
import { localMachine, resolveSpace } from './identity.js';
import { dispatch } from './service.js';
import { Store } from './storage.js';
import type { Response } from './types.js';

export const help = `herdr-context — persistent notes and tags (JSON protocol v1)

  read [--space SPACE_ID] [--on MACHINE] [--agent ASSIGNMENT_UUID]
      View the Space's Markdown scratchpad (notes) and tags; no updates required.
      --agent returns its own record plus inherited Space context.
      Without --space, use this live terminal's verified herdr.space label.
      If that identity is unavailable, copy the panel's explicit read command.
  resolve [--space SPACE_ID] [--on MACHINE]
      Return the persistent Space target and permanent Core ID. No Git/CWD lookup.
  new-agent [--space SPACE_ID] [--on MACHINE]
      Allocate an explicit assignment UUID. No process is launched or bound.
  write --input FILE|-
      JSON: {"target":{...},"expected_revision":0,"patch":{"notes":"..."}}
      Patch fields: notes (Markdown), tags (string array).
      Legacy instructions/handoff fields remain supported for existing records.
  read --target FILE
      Read an explicit saved target, including legacy checkout/folder records.
  request --input FILE|- [--consume-from DIRECTORY]
      Panel protocol: resolve/resolve-agent/read/write/new-agent with an op field.
  help

Every response, including errors and help, is versioned JSON. Exit 0: success;
1: validation/IO/resolution error; 2: stale revision; 3: storage locked.
CONTEXT_HOME defaults to ~/.local/state/herdr-context. Local agents and the
panel must use the same CONTEXT_HOME. --on resolves a connected Core's permanent
ID; records remain in the local CONTEXT_HOME (no remote storage sync).
Pass edited content via UTF-8 files or stdin, never shell interpolation.
Notes and task links are context, not automatic authority. Keep secrets out.
`;

async function input(path: string) {
  let raw: string;
  if (path === '-') {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of process.stdin) {
      const b = Buffer.from(chunk); size += b.length;
      if (size > 512 * 1024) fail('invalid_input', 'Request too large.');
      chunks.push(b);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  } else {
    if ((await lstat(path)).size > 512 * 1024) fail('invalid_input', 'Request too large.');
    raw = await readFile(path, 'utf8');
  }
  try { return JSON.parse(raw); } catch { fail('invalid_json', 'Input is not valid JSON.'); }
}

export async function main(argv: string[]): Promise<{ response: Response; code: number }> {
  let consumed: string | undefined;
  try {
    const command = argv[0] ?? 'help', opts: Record<string, string> = {};
    for (let i = 1; i < argv.length; i += 2) {
      const key = argv[i];
      if (!key.startsWith('--') || !argv[i + 1] || key in opts) fail('invalid_input', 'Options need one value each and cannot repeat.');
      opts[key] = argv[i + 1];
    }
    const allowed: Record<string, string[]> = {
      help: [], '--help': [], read: ['--space', '--on', '--agent', '--target'], resolve: ['--space', '--on'],
      'new-agent': ['--space', '--on'], write: ['--input'], request: ['--input', '--consume-from', '--home'],
    };
    if (!allowed[command] || Object.keys(opts).some(k => !allowed[command].includes(k))) fail('invalid_input', 'Unknown command or option. Run herdr-context help.');
    let data: unknown;
    if (command === 'help' || command === '--help') data = { help };
    else if (command === 'request' || command === 'write') {
      if (!opts['--input']) fail('invalid_input', '--input FILE|- is required.');
      if (opts['--consume-from']) {
        const path = resolve(opts['--input']), root = resolve(opts['--consume-from']);
        if (dirname(path) !== root || !/^request-[a-zA-Z0-9-]+\.json$/.test(basename(path)) || !(await lstat(path)).isFile()) fail('invalid_input', 'Invalid panel request file.');
        consumed = path;
      }
      const body = await input(opts['--input']);
      data = await dispatch(command === 'write' ? { ...body, op: 'write' } : body, opts['--home'] ? new Store(resolve(opts['--home'])) : new Store());
    } else if (command === 'read' && opts['--target']) {
      if (opts['--space'] || opts['--on'] || opts['--agent']) fail('invalid_input', '--target cannot be combined with Space options.');
      data = await dispatch({ op: 'read', target: target(await input(opts['--target'])) });
    } else if (command === 'new-agent' && !opts['--space'] && !opts['--on']) {
      data = await dispatch({ op: 'new-agent', machine: await localMachine() });
    } else {
      const inherited = await resolveSpace(opts['--space'], opts['--on']);
      if (command === 'resolve') data = { target: inherited };
      else if (command === 'new-agent') data = await dispatch({ op: 'new-agent', machine: inherited.machine });
      else data = await dispatch({ op: 'read', target: opts['--agent'] ? { kind: 'agent', machine: inherited.machine, id: opts['--agent'] } : inherited, ...(opts['--agent'] ? { inherited } : {}) }, new Store());
    }
    return { response: { schema_version: 1, ok: true, data }, code: 0 };
  } catch (e) {
    const error = e instanceof ContextError ? e : new ContextError('io_error', 'Context could not access its storage or request file.');
    return { response: { schema_version: 1, ok: false, error: { code: error.code, message: error.message, ...(error.current_revision === undefined ? {} : { current_revision: error.current_revision }) } }, code: error.code === 'conflict' ? 2 : error.code === 'locked' ? 3 : 1 };
  } finally { if (consumed) await rm(consumed, { force: true }).catch(() => {}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { response, code } = await main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(response) + '\n');
  process.exitCode = code;
}
