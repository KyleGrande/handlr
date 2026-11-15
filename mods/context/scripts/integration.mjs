/** Adapt the installed header, preserving its tabs, menus and panel conventions. */
export function integrate(layout, tabSource, declarations) {
  const copy = JSON.parse(JSON.stringify(layout));
  function find(node, id) {
    if (node.id === id) return node;
    for (const c of node.children ?? []) { const found = find(c, id); if (found) return found; }
  }
  const tabs = find(copy, 'tabs'), body = find(copy, 'panel-body'), panel = find(copy, 'panel');
  if (!tabs?.content?.mod || body?.type !== 'stack' || !panel || !Array.isArray(body.children)) throw new Error('Unsupported layout: expected tabs, panel and panel-body stack.');
  const sourceMod = tabs.content.mod;
  if (sourceMod === 'context-tabs') throw new Error('Already integrated: use sync instead of preparing another integration.');
  const enabled = 'const enabled = shared("workspace.panels") ?? ["files", "changes"];';
  const insertion = '      .when(w?.buttons,';
  if (!tabSource.includes(enabled) || !tabSource.includes(insertion)) throw new Error('The current tab bar is incompatible; no files were changed.');
  for (const d of declarations) {
    if (body.children.some(c => c.id === d.name)) throw new Error('Context panel ID already exists.');
    body.children.push({ id: d.name, type: 'block', content: { mod: d.name } });
  }
  tabs.content = { ...tabs.content, mod: 'context-tabs' };
  const ids = declarations.map(d => d.name);
  let source = tabSource.replace(enabled, `const enabled = [...new Set([...(shared("workspace.panels") ?? ["files", "changes"]), ...${JSON.stringify(ids)}])];`);
  const buttons = declarations.map(d => `      .child(panelButton(${JSON.stringify(d.name)}, ${JSON.stringify(d.button.label)}, ${JSON.stringify(`mods/${d.name}/${d.button.icon}`)}))\n`).join('');
  source = source.replace(insertion, buttons + insertion);
  return { layout: copy, source, sourceMod };
}

export function consolidate(layout, tabSource) {
  const copy = JSON.parse(JSON.stringify(layout));
  function find(n, id) { if (n.id === id) return n; for (const c of n.children ?? []) { const f = find(c, id); if (f) return f; } }
  const body = find(copy, 'panel-body');
  if (!body || find(copy, 'tabs')?.content?.mod !== 'context-tabs' || body.children.some(c => c.id === 'context')) throw new Error('Expected the managed two-panel Context integration; use sync for an existing combined panel.');
  for (const name of ['context-notes', 'context-tags']) if (!body.children.some(c => c.id === name && c.content?.mod === name)) throw new Error('Context panel layout was modified.');
  body.children = body.children.filter(c => !['context-notes', 'context-tags'].includes(c.id));
  body.children.push({ id: 'context', type: 'block', content: { mod: 'context' } });
  if (['context-notes', 'context-tags'].includes(body.active)) body.active = 'context';
  const oldButtons = '      .child(panelButton("context-notes", "Notes", "mods/context-notes/notes.svg"))\n      .child(panelButton("context-tags", "Tags", "mods/context-tags/tags.svg"))';
  const oldList = '...["context-notes","context-tags"]';
  if (!tabSource.includes(oldButtons) || !tabSource.includes(oldList)) throw new Error('Managed tab bar changed; no upgrade was applied.');
  const source = tabSource.replace(oldButtons, '      .child(panelButton("context", "Context", "mods/context/context.svg"))').replace(oldList, '...["context"]');
  return { layout: copy, source, sourceMod: 'context-tabs' };
}

/** Preserve originals and combine disjoint pending edits when two views become one. */
export function mergePanelDrafts(notes, tags) {
  const entries = new Map();
  for (const store of [notes, tags]) for (const [key, draft] of JSON.parse(store['drafts-v1'] ?? '[]')) {
    const prior = entries.get(key);
    if (!prior) { entries.set(key, draft); continue; }
    const dirty = Object.keys(prior.patch).length || Object.keys(draft.patch).length;
    const base = dirty ? (prior.record.revision <= draft.record.revision ? prior.record : draft.record) : (prior.record.revision >= draft.record.revision ? prior.record : draft.record);
    entries.set(key, { record: base, patch: { ...prior.patch, ...draft.patch }, generation: Math.max(prior.generation, draft.generation) + 1 });
  }
  return { 'drafts-v1': JSON.stringify([...entries]), 'pending-tags-v1': tags['pending-tags-v1'] ?? '{}',
    // Keep both originals available if two old views edited the same field.
    'legacy-panel-drafts-v1': JSON.stringify({ notes, tags }) };
}
