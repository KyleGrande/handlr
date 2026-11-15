import type { ContextContent, ContextPatch, ContextRecord, ContextTarget } from './types.js';

export class ContextError extends Error {
  constructor(public code: string, message: string, public current_revision?: number) { super(message); }
}
export function fail(code: string, message: string): never { throw new ContextError(code, message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_input', 'Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) fail('invalid_input', 'Unknown field.');
}
export function text(value: unknown, name: string, max = 65536): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail('invalid_input', `Invalid ${name}.`);
  return value;
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail('invalid_input', 'Expected a nonnegative integer revision.');
  return value as number;
}
export function machineID(value: unknown): string {
  const id = text(value, 'Core machine ID', 128);
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(id)) fail('identity_unavailable', 'A permanent Core machine ID is required.');
  return id;
}
export function target(value: unknown): ContextTarget {
  const t = object(value), machine = machineID(t.machine);
  if (t.kind === 'space') {
    keys(t, ['kind', 'machine', 'id']);
    const id = spaceID(t.id);
    return { kind: 'space', machine, id };
  }
  if (t.kind === 'agent') {
    keys(t, ['kind', 'machine', 'id']);
    const id = text(t.id, 'assignment ID', 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) fail('invalid_input', 'Agent context requires an explicit v4 assignment UUID.');
    return { kind: 'agent', machine, id };
  }
  if (t.kind !== 'checkout' && t.kind !== 'folder') fail('invalid_input', 'Unknown target kind.');
  keys(t, ['kind', 'machine', 'path']);
  const path = text(t.path, 'canonical absolute path', 8192);
  if (!(path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) || /(?:^|[\\/])\.{1,2}(?:[\\/]|$)/.test(path) || (path.length > 1 && /[\\/]$/.test(path))) fail('invalid_input', 'Use the canonical absolute path returned by resolve.');
  return { kind: t.kind, machine, path };
}
export function spaceID(value: unknown): string {
  const id = text(value, 'persistent Space ID', 34);
  if (!/^sp[0-9a-f]{32}$/.test(id)) fail('invalid_input', 'Use the persistent Herdr Space ID (sp…), not its name, folder or position.');
  return id;
}
export function targetKey(t: ContextTarget): string { return JSON.stringify(target(t)); }
export function patch(value: unknown): ContextPatch {
  const p = object(value);
  keys(p, ['notes', 'instructions', 'handoff', 'tags']);
  const out: ContextPatch = {};
  for (const k of ['notes', 'instructions', 'handoff'] as const) if (k in p) out[k] = text(p[k], k);
  if ('tags' in p) {
    if (!Array.isArray(p.tags) || p.tags.length > 64) fail('invalid_input', 'Expected at most 64 tags.');
    out.tags = p.tags.map(v => {
      const tag = text(v, 'tag', 80).trim();
      if (!tag || /[\r\n\t]/.test(tag)) fail('invalid_input', 'Tags must be nonempty single-line text.');
      return tag;
    });
    if (new Set(out.tags).size !== out.tags.length) fail('invalid_input', 'Duplicate tags.');
  }
  if (!Object.keys(out).length) fail('invalid_input', 'An update needs at least one content field.');
  return out;
}
export const blankContent = (): ContextContent => ({ tags: [], notes: '', instructions: '', handoff: '' });
/** Fold legacy fields into the editor without changing the stored record on read.
 * The next explicit edit/save stores the complete scratchpad in notes. */
export function scratchpad(content: ContextContent): string {
  return [content.notes, content.instructions ? `## Instructions\n\n${content.instructions}` : '', content.handoff ? `## Handoff\n\n${content.handoff}` : ''].filter(Boolean).join('\n\n');
}
export function emptyRecord(t: ContextTarget): ContextRecord {
  return { schema_version: 1, target: target(t), ...blankContent(), revision: 0, created_at: null, updated_at: null };
}
export function record(value: unknown, expected: ContextTarget): ContextRecord {
  const r = object(value);
  keys(r, ['schema_version', 'target', 'tags', 'notes', 'instructions', 'handoff', 'revision', 'created_at', 'updated_at']);
  if (r.schema_version !== 1) fail('unsupported_version', 'Unsupported stored record version.');
  if (targetKey(target(r.target)) !== targetKey(expected)) fail('corrupt_record', 'Stored owner does not match its record key.');
  const content = patch({ tags: r.tags, notes: r.notes, instructions: r.instructions, handoff: r.handoff });
  const rev = revision(r.revision);
  if (rev < 1 || typeof r.created_at !== 'string' || typeof r.updated_at !== 'string' || !Number.isFinite(Date.parse(r.created_at)) || !Number.isFinite(Date.parse(r.updated_at))) fail('corrupt_record', 'Invalid stored revision or timestamps.');
  return { schema_version: 1, target: target(r.target), ...content as ContextContent, revision: rev, created_at: r.created_at, updated_at: r.updated_at };
}
