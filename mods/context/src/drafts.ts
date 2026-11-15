import { targetKey } from './model.js';
import type { ContextPatch, ContextRecord, ContextTarget } from './types.js';

/** Uses the same focused flag as Herdr's highlighted Agents row. */
export function highlightedAgent<T extends { address: string; space: string; focused: boolean }>(space: string, agents: T[], shown: string | null): T | undefined {
  return agents.find(a => a.space === space && a.focused) ?? agents.find(a => a.space === space && a.address === shown);
}

/** Owner-bound drafts and conflict state, independent of native view lifetime. */
export interface Draft { record: ContextRecord; patch: ContextPatch; generation: number; conflict?: ContextRecord }
export class Drafts {
  entries = new Map<string, Draft>();
  epoch = 0;
  selected: string | null = null;
  select(owner: ContextTarget | null): number { this.selected = owner ? targetKey(owner) : null; return ++this.epoch; }
  accept(epoch: number, record: ContextRecord): boolean {
    if (epoch !== this.epoch || targetKey(record.target) !== this.selected) return false;
    if (!this.entries.has(this.selected)) this.entries.set(this.selected, { record, patch: {}, generation: 0 });
    return true;
  }
  edit(owner: ContextTarget, update: ContextPatch) {
    const d = this.entries.get(targetKey(owner));
    if (!d) throw new Error('Load the displayed owner before editing.');
    d.patch = { ...d.patch, ...update }; d.generation++;
    if (d.conflict) this.reconcile(owner, d.conflict);
  }
  snapshot(owner: ContextTarget) {
    const d = this.entries.get(targetKey(owner));
    if (!d) throw new Error('No draft.');
    return { target: d.record.target, expected_revision: d.record.revision, patch: structuredCopy(d.patch), generation: d.generation };
  }
  saved(record: ContextRecord, generation: number) {
    const d = this.entries.get(targetKey(record.target));
    if (!d) return;
    d.record = record;
    if (d.generation === generation) d.patch = {};
    else for (const key of Object.keys(d.patch) as (keyof ContextPatch)[]) if (same(d.patch[key], record[key])) delete d.patch[key];
    delete d.conflict;
  }
  /** Merge independent fields and tag additions/removals. Conflicting Markdown
   * stays untouched until the user chooses; never retry a stale full snapshot. */
  reconcile(owner: ContextTarget, remote: ContextRecord): boolean {
    if (targetKey(owner) !== targetKey(remote.target)) throw new Error('Wrong owner.');
    const d = this.entries.get(targetKey(owner));
    if (!d) throw new Error('No draft.');
    if (remote.revision < Math.max(d.record.revision, d.conflict?.revision ?? 0)) return !d.conflict;
    const merged: ContextPatch = {};
    for (const key of ['notes', 'instructions', 'handoff'] as const) {
      if (d.patch[key] === undefined || d.patch[key] === d.record[key] || d.patch[key] === remote[key]) continue;
      if (remote[key] !== d.record[key]) { d.conflict = remote; return false; }
      merged[key] = d.patch[key];
    }
    if (d.patch.tags) {
      const removed = d.record.tags.filter(tag => !d.patch.tags!.includes(tag));
      const added = d.patch.tags.filter(tag => !d.record.tags.includes(tag));
      const tags = [...new Set([...remote.tags.filter(tag => !removed.includes(tag)), ...added])];
      if (!same(tags, remote.tags)) merged.tags = tags;
    }
    d.record = remote; d.patch = merged; delete d.conflict;
    return true;
  }
  resolveConflict(owner: ContextTarget, keepLocal: boolean) {
    const d = this.entries.get(targetKey(owner));
    if (!d?.conflict) return;
    d.record = d.conflict; delete d.conflict;
    if (!keepLocal) d.patch = {};
    d.generation++;
  }
}
function structuredCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type DraftSnapshot = ReturnType<Drafts['snapshot']>;
export interface AutosaveIO {
  write(snapshot: DraftSnapshot): Promise<ContextRecord>;
  read(owner: ContextTarget): Promise<ContextRecord>;
}
/** Debounced per-owner queue: switching focus never changes a pending target. */
export class Autosave {
  due = new Map<string, number>();
  saving = new Set<string>();
  errors = new Map<string, string>();
  constructor(public drafts: Drafts, private now = Date.now) {}
  schedule(owner: ContextTarget, delay = 650) {
    const key = targetKey(owner), d = this.drafts.entries.get(key);
    if (d && Object.keys(d.patch).length && !d.conflict) this.due.set(key, this.now() + delay);
    else this.due.delete(key);
  }
  hasDue() { return [...this.due].some(([key, at]) => at <= this.now() && !this.saving.has(key)); }
  async flush(io: AutosaveIO) {
    const work: Promise<void>[] = [];
    for (const [key, at] of this.due) {
      if (at > this.now() || this.saving.has(key)) continue;
      this.due.delete(key);
      const d = this.drafts.entries.get(key);
      if (!d || !Object.keys(d.patch).length || d.conflict) continue;
      const snapshot = this.drafts.snapshot(d.record.target);
      this.saving.add(key);
      work.push((async () => {
        try {
          this.drafts.saved(await io.write(snapshot), snapshot.generation);
          this.errors.delete(key);
        } catch (error) {
          try {
            if ((error as { code?: string }).code !== 'conflict') throw error;
            this.drafts.reconcile(snapshot.target, await io.read(snapshot.target));
            this.errors.delete(key);
          } catch { this.errors.set(key, 'Could not save changes. Your draft is kept; retrying…'); }
        } finally {
          this.saving.delete(key);
          if (!this.due.has(key)) this.schedule(snapshot.target, this.errors.has(key) ? 5000 : 650);
        }
      })());
    }
    await Promise.all(work);
  }
}
