// These existing host commands demonstrate composition; they are not the
// proposed atomic workspace engine. No terminal lifecycle commands belong here.
export function find(root, id) {
  if (root?.id === id) return root;
  for (const child of root?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function validSpan(span) {
  if (Number.isFinite(span?.weight) && span.weight > 0) return { weight: span.weight };
  if (Number.isFinite(span?.px) && span.px > 0) return { px: span.px };
  return { weight: 1 };
}

export function collapseActions(root, sectionId, bodyId, preferred) {
  const section = find(root, sectionId);
  const body = section?.children?.find(node => node.id === bodyId);
  if (!body) return null;
  if (body.hidden) {
    return {
      preferred: validSpan(preferred),
      commands: [
        ["layout.resize", { id: sectionId, ...validSpan(preferred) }],
        ["layout.show", { id: bodyId }]
      ]
    };
  }
  return {
    preferred: validSpan(section.size),
    commands: [
      ["layout.hide", { id: bodyId }],
      ["layout.resize", { id: sectionId, px: 28 }]
    ]
  };
}
