# Herdr Toolbox

Read README.md and ~/.config/herdr-app/AGENTS.md. Independent native GPUI mod. Button sits directly beside Context in the tab bar; tray opens ABOVE terminals. Match Context pane styling. Use Space naming, with no Agent/Worktree scope controls. Keep Context and Rigs files untouched; integrate with a personal tab-bar clone and separate layout.

Capture Space owners for edits and launches; qualify IDs by permanent Core identity. Quote parameter values as shell data. Execute only on explicit Run, in a separate terminal. Use versioned shared storage and reject stale saves.

Run npm test and herdr-app check for toolbox and toolbox-tabs. Require passing native checks and live app verification before calling work complete. Do not commit generated declarations or personal runtime state.

## Workspace header compatibility

The mod opts into shared headers with `workspace_header: true` in mod.json.
When `herdr.panel()` returns embedded_header, use one 42px original title row,
the provided panel title and an 82px right gutter for host controls. Keep the
center grip clear of mod-specific buttons. Place mod controls beside the title
on the left and show them only while the header is hovered. Title double-click runs
workspace.rename with the supplied panel ID. Access panel through an optional
namespace property so older Herdr installations keep their original UI.
Never change owner selection, props, storage keys, process lifecycle or layouts
merely to adopt this header. Test standalone and workspace presentations.
