export function quote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
export function parameters(command) { return [...new Set([...command.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g)].map(m => m[1]))]; }
export function expand(command, values) {
  return command.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key) || typeof values[key] !== 'string') throw new Error(`Enter a value for ${key}`);
    return quote(values[key]);
  });
}
export function saveEntry(state, owner, entry, expected) {
  const current = state?.owners?.[owner] ?? { revision: 0, entries: [] };
  if (current.revision !== expected) throw new Error('Toolbox changed in another view. Reopen the editor.');
  if (!entry.label?.trim() || !entry.command?.trim()) throw new Error('Label and command are required.');
  const entries = current.entries.filter(e => e.id !== entry.id);
  entries.push(entry);
  return { version: 1, owners: { ...state?.owners, [owner]: { revision: current.revision + 1, entries } } };
}
export function repoTools(text) {
  const data = text ? JSON.parse(text) : { version: 1, tools: [] };
  if (data?.version !== 1 || !Array.isArray(data.tools) || data.tools.some(t => !t || typeof t.label !== 'string' || !t.label.trim() || typeof t.command !== 'string' || !t.command.trim() || (t.icon !== undefined && typeof t.icon !== 'string'))) throw new Error('Invalid .herdr/toolbox.json');
  return data.tools.map(t => ({ label: t.label, command: t.command, icon: t.icon || '▶', id: 'repo:' + t.command }));
}
