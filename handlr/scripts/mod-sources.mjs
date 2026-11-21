// Source inventory shared by packaging tools; optional packages stay separate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function bundledModNames(root) {
  let text;
  try { text = readFileSync(join(root, 'mods/bundled.txt'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const names = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (names.some(name => !/^[a-z0-9-]+$/.test(name)) || new Set(names).size !== names.length) {
    throw new Error('Invalid or duplicate bundled mod name in mods/bundled.txt');
  }
  return names;
}
