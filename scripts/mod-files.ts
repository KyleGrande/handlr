import * as fs from 'node:fs/promises';
import path from 'node:path';

/** Only overwrite a generated installation that points back to this source checkout. */
export async function verifyInstallation(root: string, destination: string) {
  const installed = await fs.readFile(path.join(destination,'main.js'),'utf8');
  if (!installed.startsWith('// Generated from main.ts by npm run build:mod.') ||
      ![path.join(root,'bin/rig'),path.join(root,'dist/src/cli.js')].some(file => installed.includes(JSON.stringify(file))))
    throw new Error('Existing mod is not this checkout installation; choose another name');
}

/** Update mod code and its agent guide without rewriting layouts or starting services. */
export async function writeMod(root: string, destination: string) {
  let source = await fs.readFile(path.join(root,'mods/rigs/main.js'),'utf8');
  source = source.replace("props()?.cli ?? 'rig'", `props()?.cli ?? ${JSON.stringify(process.execPath)}`);
  source = source.replace("this.guide = '';", `this.guide = ${JSON.stringify(path.join(destination,'AGENTS.md'))};`);
  source = source.replace('this.cliArgs = [];', `this.cliArgs = [${JSON.stringify(path.join(root,'dist/src/cli.js'))}];`);
  source = source.replace("modName = 'rigs';", `modName = ${JSON.stringify(path.basename(destination))};`);
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const context = `<!-- Generated installation guide; edit the source AGENTS.md and sync the mod. -->\n\nInstallation context:\n\n- Source checkout: ${JSON.stringify(root)}\n- Profile reference: [README](<${path.join(root,'README.md')}>)\n- CLI: \`${[process.execPath,path.join(root,'dist/src/cli.js')].map(quote).join(' ')}\`\n- Registry: RIG_HOME or ~/.local/state/herdr-rigs; independent of this mod folder.\n\n`;
  await fs.writeFile(path.join(destination,'AGENTS.md'), context + await fs.readFile(path.join(root,'AGENTS.md'),'utf8'));
  await fs.copyFile(path.join(root,'mods/rigs/setup.js'),path.join(destination,'setup.js'));
  await fs.copyFile(path.join(root,'mods/rigs/mod.json'),path.join(destination,'mod.json'));
  await fs.writeFile(path.join(destination,'main.js'),source);
}
