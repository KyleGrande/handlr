import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home = process.env.HERDR_APP_HOME ?? path.join(os.homedir(), '.config/herdr-app');
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, paths: { herdr: [path.join(home, 'herdr.d.ts')] } };
const program = ts.createProgram(['mods/rigs/main.ts', path.join(home, 'gpui-kit.d.ts')], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) { console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' })); process.exit(1); }
for (const name of ['main','setup']) {
  const source = fs.readFileSync(`mods/rigs/${name}.ts`, 'utf8');
  fs.writeFileSync(`mods/rigs/${name}.js`, '// Generated from main.ts by npm run build:mod.\n' + ts.transpileModule(source, { compilerOptions: options }).outputText);
}
const {setupPrompt} = await import('../mods/rigs/setup.js');
fs.writeFileSync('mods/rigs/AGENTS.md', '<!-- Generated from the source AGENTS.md by npm run build:mod. -->\n\n' + fs.readFileSync('AGENTS.md','utf8'));
fs.mkdirSync('docs', {recursive:true});
fs.writeFileSync('docs/SETUP_PROMPT.md', '# Set up Rigs with your agent\n\nUse **+ → Agent Setup Prompt** in the Rigs panel for a short prompt pointing to this installation’s agent guide. Paste it into the agent you already use. No profile JSON is needed beforehand.\n\nThe copied prompt points to the installed AGENTS.md, which contains the exact CLI paths and setup rules. The reusable text below needs your installation’s guide path.\n\n```text\n' + setupPrompt({guide:'/absolute/path/to/rigs/AGENTS.md'}) + '\n```\n');
