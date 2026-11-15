// Read-only inventory. Paths are passed as data, never interpolated into sh.
const HANDLR = ["toolbox", "context", "rigs", "ticket"];
const ABOUT = {
  toolbox: "Command shortcuts for your Space.",
  context: "Space and agent notes and tags.",
  rigs: "Development stacks, processes and endpoints.",
  ticket: "Tasks, pull requests and related checkouts.",
};
const object = value => value && typeof value === "object" && !Array.isArray(value);

export async function readMods({ home, platform, exec, readTextFile }) {
  const root = `${home}/mods`;
  let result;
  if (platform === "windows") {
    const path = root.replace(/['‘’‚‛]/g, "$&$&");
    result = await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $ErrorActionPreference = 'Stop'; $root = '${path}'; $names = @(Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object { -not $_.Name.StartsWith('.') -and (Test-Path -LiteralPath (Join-Path $_.FullName 'main.js') -PathType Leaf) } | ForEach-Object Name); [Console]::Write(($names -join [char]0))`], { timeout: 5000 });
  } else {
    result = await exec("sh", ["-c", 'test -d "$1" && test -r "$1" && test -x "$1" || exit 1; for f in "$1"/*/main.js; do [ -f "$f" ] || continue; dir=${f%/main.js}; printf "%s\\0" "${dir##*/}"; done', "settings-mods", root], { timeout: 5000 });
  }
  if (result.code !== 0) throw new Error(result.stderr || "Cannot read the installed mods folder. Try Refresh.");
  const readObject = async path => {
    const text = await readTextFile(`${home}/${path}`);
    const value = text === null ? {} : JSON.parse(text);
    if (!object(value)) throw new Error(`${path} must contain a JSON object.`);
    return value;
  };
  const [bundled, ownership] = await Promise.all([readObject("installed.json"), readObject("mod-ownership.json")]);
  const names = [...new Set(result.stdout.split("\0").filter(name => name && !name.startsWith(".") && !/[\/\\\x00-\x1f]/.test(name)))];
  const mods = await Promise.all(names.map(async id => {
    let manifest = {}, error = null;
    try { manifest = await readObject(`mods/${id}/mod.json`); }
    catch (e) { error = String(e?.message ?? e); }
    const panel = manifest.workspace_header === true || manifest.button?.opens === "panel" || ["left", "right", "top", "bottom", "top_center", "bottom_center"].includes(manifest.place);
    const title = [manifest.title, manifest.button?.label, manifest.name].find(value => typeof value === "string" && value.trim()) ?? id.charAt(0).toUpperCase() + id.slice(1);
    return { id, title, panel, openable: !error && (panel || object(manifest.overlay)),
      kind: ownership[id]?.user_owned ? "Customized" : Object.hasOwn(bundled, id) ? "Bundled" : "Personal",
      pending: ownership[id]?.pending === true, handlr: HANDLR.includes(id),
      about: error ? "Manifest needs attention." : ABOUT[id] ?? (typeof manifest.description === "string" ? manifest.description : panel ? "Workspace panel." : object(manifest.overlay) ? "Popup or dialog." : "Layout component."), error };
  }));
  return mods.sort((a, b) => Number(b.handlr) - Number(a.handlr) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export async function modCommand(exec, name, args) {
  const result = await exec("herdr-app", ["do", name, ...(args ? [JSON.stringify(args)] : [])], { timeout: 8000 });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "The app did not accept the change.");
  const value = JSON.parse(result.stdout);
  if (value.error) throw new Error(value.error);
  return value;
}

export function modPanels(document, name) {
  const shown = new Set((document.groups ?? []).flatMap(group => group.views ?? []).flatMap(view => view.sections ?? []).map(section => section.panel_id));
  return Object.values(document.panels ?? {}).filter(panel => panel.content?.kind === "mod" && panel.content.name === name && shown.has(panel.id)).map(panel => panel.id);
}
