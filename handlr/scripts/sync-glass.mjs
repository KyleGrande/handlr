// Mod modules are sandboxed to their own directory. Keep this small controller
// in both owners rather than adding a shared native mod API for a visual preset.
import { copyFile } from 'node:fs/promises';
for (const name of ['glass.js', 'glass-state.js']) {
  await copyFile(new URL(`../../defaults/frame/settings/${name}`, import.meta.url),
    new URL(`../../defaults/mods/tabs/${name}`, import.meta.url));
}
