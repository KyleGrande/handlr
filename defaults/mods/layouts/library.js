// Mod-owned, side-effect-free preset library.
const copy = value => JSON.parse(JSON.stringify(value));
const require = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.length > 0;
const positive = value => Number.isFinite(value) && value > 0;
const edges = ["left", "right", "top", "bottom", "top_center", "bottom_center"];

export function presetName(value) {
  require(typeof value === "string", "Enter a layout name");
  const name = value.trim();
  require(name.length > 0 && [...name].length <= 120 && !/[\u0000-\u001f\u007f]/.test(name), "Use a single-line name of 1–120 characters");
  return name;
}

// Deliberately whitelist composition. Props, bindings, storage namespaces,
// terminal addresses, focus, maximize, themes and unknown extensions stay local.
export function capture(document) {
  require(document?.version === 1 && object(document.panels), "Unsupported workspace document");
  const snapshot = {
    version: 1,
    panels: Object.values(document.panels).map(panel => {
      require(panel.content?.kind === "mod", "Terminal panels cannot be saved in a preset");
      return { id: panel.id, mod: panel.content.name };
    }),
    groups: document.groups.map(group => ({
      id: group.id, active_view_id: group.active_view_id,
      views: group.views.map(view => ({ id: view.id, title: view.title,
        sections: view.sections.map(section => ({ id: section.id, panel_id: section.panel_id,
          collapsed: section.collapsed, weight: section.weight, min_extent: section.min_extent })),
      })),
    })),
    zones: document.zones.map(zone => ({ edge: zone.edge, extent: zone.extent, hidden: zone.hidden,
      groups: zone.groups.map(ref => ({ group_id: ref.group_id, weight: ref.weight })),
    })),
    floating: (document.floating ?? []).map(float => ({ group_id: float.group_id,
      x: float.x, y: float.y, width: float.width, height: float.height })),
  };
  validateSnapshot(snapshot);
  return copy(snapshot);
}

export function validateSnapshot(snapshot) {
  require(object(snapshot) && snapshot.version === 1, "Unsupported preset version");
  const keys = (value, allowed) => require(object(value) && Object.keys(value).every(key => allowed.includes(key)), "Unexpected preset field");
  keys(snapshot, ["version", "panels", "groups", "zones", "floating"]);
  for (const key of ["panels", "groups", "zones", "floating"]) require(Array.isArray(snapshot[key]), `Invalid preset ${key}`);
  const ids = new Set(), panelIds = new Set(), placedPanels = new Set(), groupIds = new Set(), placedGroups = new Set();
  const identity = id => { require(text(id) && !ids.has(id), "Empty or duplicate preset identity"); ids.add(id); };
  for (const panel of snapshot.panels) {
    keys(panel, ["id", "mod"]); identity(panel.id);
    require(text(panel.mod) && /^[a-zA-Z0-9_-]+$/.test(panel.mod), "Invalid panel mod name"); panelIds.add(panel.id);
  }
  for (const group of snapshot.groups) {
    keys(group, ["id", "active_view_id", "views"]); identity(group.id); groupIds.add(group.id);
    require(Array.isArray(group.views) && group.views.length > 0, "Empty preset group");
    require(group.views.some(view => view?.id === group.active_view_id), "Missing selected view");
    for (const view of group.views) {
      keys(view, ["id", "title", "sections"]); identity(view.id);
      require(typeof view.title === "string" && Array.isArray(view.sections) && view.sections.length > 0, "Invalid preset view");
      for (const section of view.sections) {
        keys(section, ["id", "panel_id", "collapsed", "weight", "min_extent"]); identity(section.id);
        require(panelIds.has(section.panel_id) && !placedPanels.has(section.panel_id), "Missing or repeated preset panel");
        require(typeof section.collapsed === "boolean" && positive(section.weight) && Number.isFinite(section.min_extent) && section.min_extent >= 0, "Invalid panel dimensions");
        placedPanels.add(section.panel_id);
      }
    }
  }
  const placement = id => {
    require(groupIds.has(id) && !placedGroups.has(id), "Missing or repeated preset group"); placedGroups.add(id);
  };
  const seenEdges = new Set();
  for (const zone of snapshot.zones) {
    keys(zone, ["edge", "extent", "hidden", "groups"]);
    require(edges.includes(zone.edge) && !seenEdges.has(zone.edge) && positive(zone.extent) && typeof zone.hidden === "boolean" && Array.isArray(zone.groups), "Invalid preset zone");
    seenEdges.add(zone.edge);
    for (const ref of zone.groups) {
      keys(ref, ["group_id", "weight"]); require(positive(ref.weight), "Invalid group weight"); placement(ref.group_id);
    }
  }
  require(edges.slice(0, 4).every(edge => seenEdges.has(edge)), "Missing outer preset zone");
  for (const float of snapshot.floating) {
    keys(float, ["group_id", "x", "y", "width", "height"]);
    require(Number.isFinite(float.x) && Number.isFinite(float.y) && positive(float.width) && positive(float.height), "Invalid floating bounds");
    placement(float.group_id);
  }
  require(placedGroups.size === groupIds.size, "Unplaced preset group");
}

// Use existing panel records verbatim: applying composition must not repoint a
// panel's data or pin it to the space where the preset was originally captured.
// The host must still preflight and commit with the inspected revision.
export function compose(snapshot, current) {
  validateSnapshot(snapshot);
  require(current?.version === 1 && object(current.panels), "Unsupported workspace document");
  for (const panel of snapshot.panels) {
    const existing = current.panels[panel.id];
    require(existing?.content?.kind === "mod" && existing.content.name === panel.mod,
      `Panel ${panel.id} (${panel.mod}) is unavailable in this workspace`);
  }
  const result = copy(current), composition = copy(snapshot);
  // A composition ID cannot take ownership of a retained, hidden panel ID.
  for (const group of composition.groups) {
    for (const id of [group.id, ...group.views.flatMap(view => [view.id, ...view.sections.map(section => section.id)])]) {
      require(!Object.hasOwn(result.panels, id), "Preset identity conflicts with an existing panel");
    }
  }
  result.groups = composition.groups;
  result.zones = composition.zones;
  result.floating = composition.floating;
  // Registry-only panels retain data but are hidden. Old close placements can
  // reference containers no longer in this composition, so do not replay them.
  result.closed_panels = {};
  result.focused_panel_id = null;
  delete result.maximized_group_id;
  return result;
}

export function emptyLibrary() { return { version: 1, revision: 0, presets: [] }; }

export function validateLibrary(library) {
  require(object(library) && library.version === 1 && Number.isSafeInteger(library.revision) && library.revision >= 0 && Array.isArray(library.presets), "Invalid layout library");
  const ids = new Set(), names = new Set();
  for (const preset of library.presets) {
    require(object(preset) && text(preset.id) && !ids.has(preset.id), "Invalid preset identity");
    require(presetName(preset.name) === preset.name, "Invalid preset name");
    const name = preset.name.toLowerCase();
    require(!names.has(name), "A saved layout already has that name");
    ids.add(preset.id); names.add(name); validateSnapshot(preset.snapshot);
  }
}

// Pure transaction: the caller persists the candidate atomically before
// publishing it. Invalid input never mutates the current or last-good library.
export function editLibrary(library, expectedRevision, action) {
  validateLibrary(library);
  require(library.revision === expectedRevision, "Layout library changed; reload before saving");
  require(library.revision < Number.MAX_SAFE_INTEGER, "Layout library revision exhausted");
  const candidate = copy(library);
  const preset = candidate.presets.find(preset => preset.id === action.id);
  if (action.op === "save") {
    require(text(action.id) && !preset, "Choose a new preset identity");
    candidate.presets.push({ id: action.id, name: presetName(action.name), snapshot: copy(action.snapshot) });
  } else {
    require(preset, "Saved layout no longer exists");
    if (action.op === "update") preset.snapshot = copy(action.snapshot);
    else if (action.op === "rename") preset.name = presetName(action.name);
    else if (action.op === "duplicate") {
      require(text(action.newId) && !candidate.presets.some(preset => preset.id === action.newId), "Choose a new preset identity");
      candidate.presets.push({ id: action.newId, name: presetName(action.name), snapshot: copy(preset.snapshot) });
    } else if (action.op === "delete") candidate.presets = candidate.presets.filter(preset => preset.id !== action.id);
    else throw new Error("Unknown preset action");
  }
  candidate.revision++;
  validateLibrary(candidate);
  return candidate;
}
