import * as fs from 'node:fs/promises';
import path from 'node:path';
import { checkout } from './profile.js';
import { requireValue as check, type Profile, type Service, type SetupReview } from './types.js';

/** Read-only setup discovery. No install, shell evaluation, Git changes or secret values. */
export async function propose(directory: string) {
  const selected = await checkout(directory), root = selected.root;
  const evidence: SetupReview['evidence'] = [];
  const read = async (relative: string) => {
    try {
      const file = await fs.realpath(path.join(root, relative));
      check(file.startsWith(root + path.sep), 'Setup evidence must stay inside the selected checkout');
      const stat = await fs.stat(file); if (!stat.isFile() || stat.size > 256 * 1024) return '';
      return await fs.readFile(file, 'utf8');
    } catch { return ''; }
  };
  const packageText = await read('package.json');
  let pkg: {scripts?: Record<string,string>; dependencies?: Record<string,string>; devDependencies?: Record<string,string>} = {};
  try { pkg = JSON.parse(packageText); evidence.push({file: 'package.json', topic: 'scripts and framework dependencies'}); } catch {}
  const scripts = Object.entries(pkg.scripts ?? {}).filter(([name, command]) => /^(dev|start)(:.*)?$/.test(name) && typeof command === 'string' && !/(?:^|[\s/:_-])(fixtures?|demo)(?:[\s/.:_-]|$)/i.test(`${name} ${command}`));
  const dependencies = {...pkg.dependencies, ...pkg.devDependencies};
  const names = await fs.readdir(root);
  for (const file of names.filter(name => /^(pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|go\.mod|Makefile|Procfile)$/.test(name))) if (await read(file)) evidence.push({file,topic:'project runtime and service command evidence for agent review'});
  const configNames = names.filter(name => /^(vite|next|nuxt|webpack|astro|svelte)\.config\.[cm]?[jt]s$/.test(name));
  for (const file of configNames) {
    const text = await read(file); if (text) { evidence.push({file, topic: 'framework host/port, proxy and environment configuration (not executed)'}); }
  }
  const environment = new Set<string>();
  for (const file of names.filter(name => /^(\.env[\w.-]*\.(example|sample|template)|\.env\.(example|sample|template)|env\.example)$/.test(name))) {
    const text = await read(file);
    if (!text) continue;
    for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) environment.add(match[1]);
    evidence.push({file, topic: 'environment variable names only; example values omitted'});
  }
  const docNames = [...names.filter(name => /^(README|DEVELOPMENT|CONTRIBUTING|DEV)(\.[\w-]+)?\.md$/i.test(name))];
  try { for (const name of await fs.readdir(path.join(root,'docs'))) if (/dev|setup|local|getting.started/i.test(name) && /\.md$/i.test(name)) docNames.push(`docs/${name}`); } catch {}
  for (const file of docNames.slice(0,20)) {
    const text = await read(file); if (!text) continue;
    const topics = ['database','postgres','mysql','redis','cache','queue','docker','proxy','cors','port'].filter(topic => new RegExp(`\\b${topic}\\b`, 'i').test(text));
    evidence.push({file, topic: topics.length ? `development docs mention: ${topics.join(', ')}` : 'development setup instructions'});
  }
  for (const file of names.filter(name => /^(docker-)?compose.*\.ya?ml$/.test(name))) if (await read(file)) evidence.push({file,topic:'container infrastructure: review shared services and data ownership'});
  const questions = ['commands', 'ports_and_readiness'];
  const decisions: Record<string,string> = {};
  const services: Record<string,Service> = {};
  for (const [index, [script, command]] of scripts.entries()) {
    const id = index ? `app${index + 1}` : 'app';
    const vite = /^(?:\S*\/)?vite(?:\s|$)/.test(command.trim()) && !!dependencies.vite;
    const next = /^next\s+dev(?:\s|$)/.test(command.trim()) && !!dependencies.next;
    const argv = ['npm','run',script];
    const service: Service = {repo:'app', argv, data_scope:'REVIEW REQUIRED: choose rig-local state or explicitly shared databases, queues and caches'};
    // Do not override an existing port flag or an arbitrary command wrapper.
    if ((vite || next) && !/(?:--port|\s-p(?:\s|=)|\bPORT\s*=)/.test(command)) {
      argv.push('--', ...(vite ? ['--host','127.0.0.1','--port',`\${${id}.http.port}`,'--strictPort'] : ['--hostname','127.0.0.1','--port',`\${${id}.http.port}`]));
      service.endpoints = {http: {range: [3120,3199]}};
      service.readiness = {endpoint:'http', path:'/', timeout:20};
    }
    if (environment.size) service.env = Object.fromEntries([...environment].sort().map(key => [key, {secret_env:key}]));
    services[id] = service;
  }
  let kind: 'application' | 'development_tools' | 'no_services' = scripts.length ? 'application' : 'no_services';
  const configText = await read('tsconfig.json');
  if (!scripts.length && dependencies.typescript && configText && /^tsc(?:\s+-p\s+tsconfig\.json)?\s*$/.test(pkg.scripts?.build ?? '')) {
    // This is a development-tool suggestion, never an application server or an automatic launch.
    let output = 'the output configured in tsconfig.json';
    try { const config = JSON.parse(configText); if (typeof config.compilerOptions?.outDir === 'string') output = config.compilerOptions.outDir; } catch {}
    services.compiler = {repo:'app', argv:[process.execPath,'node_modules/typescript/bin/tsc','-p','tsconfig.json','--watch','--preserveWatchOutput'], data_scope:`Writes ${output} in this checkout; no additional data directory is proposed. Installed tools and the Rigs registry remain externally managed.`};
    evidence.push({file:'tsconfig.json', topic:'optional compiler watcher; review output paths and any separate mod build/install steps'});
    kind = 'development_tools';
  }
  if (Object.keys(services).length) {
    decisions.commands = kind === 'development_tools' ? 'Proposed: optional TypeScript compiler watcher; no application server was found. This does not rebuild or install native mod files outside tsconfig.json.' : 'Proposed: run the detected dev/start scripts as foreground services; review service membership and command arguments in the preview.';
    decisions.ports_and_readiness = Object.values(services).some(s => s.endpoints) ? 'Proposed: loopback endpoints and HTTP checks shown in the preview; ports remain unreserved until launch.' : 'Proposed: no managed endpoints or readiness checks; process state and live output remain available. Review any undocumented listeners before launch.';
    if (environment.size) questions.push('connections_and_secrets');
    const infrastructure = evidence.some(e => /container infrastructure|development docs mention:.*(?:database|postgres|mysql|redis|cache|queue|docker)/.test(e.topic));
    if (infrastructure) questions.push('data_isolation');
    else for (const service of Object.values(services)) if (!service.data_scope || service.data_scope.startsWith('REVIEW REQUIRED')) service.data_scope = 'No database, cache, queue or additional data directory identified in inspected evidence; existing service output stays in this checkout. Review undocumented external dependencies before launch.';
  }
  const summary = kind === 'application' ? 'Application commands proposed from package scripts. Review their membership and any unresolved bindings.' : kind === 'development_tools' ? 'No application server found. An optional compiler watcher is proposed; it has no managed ports or browser URL.' : 'No supported long-running services found. Demo fixtures are available separately and are not project services.';
  // Config is deliberately not evaluated. Its presence is review evidence, not permission to execute it.
  const profile: Profile = {version:1, repos:['app'], services, setup:{approved:false, questions, decisions, evidence}};
  return { root, profile, discovery:{kind, summary} };
}
