import { emptyLibrary, editLibrary, validateLibrary } from "./library.js";

// A validated previous library survives even a failed first primary write.
export class LibraryStore {
  constructor(path, read, write) { this.path = path; this.read = read; this.write = write; }
  async load() {
    this.text = await this.read(this.path);
    this.backup = await this.read(`${this.path}.last-good`);
    const parse = text => { const value = JSON.parse(text); validateLibrary(value); return value; };
    if (this.text === null && this.backup === null) { this.library = emptyLibrary(); return; }
    try { this.library = parse(this.text); this.warning = null; }
    catch {
      try { this.library = parse(this.backup); this.warning = "Recovered the last good layout library. Your previous save may need to be repeated."; }
      catch { throw new Error("Cannot read the layout library or its last good copy. Repair the files before saving; your current arrangement is unchanged."); }
    }
  }
  async edit(action) {
    if (!this.library) throw new Error("Reload or repair the layout library before saving.");
    const candidate = editLibrary(this.library, this.library.revision, action);
    const backup = JSON.stringify(this.library);
    await this.write(`${this.path}.last-good`, backup, this.backup);
    this.backup = backup;
    const text = JSON.stringify(candidate);
    await this.write(this.path, text, this.text);
    this.text = text; this.library = candidate; this.warning = null;
  }
}
