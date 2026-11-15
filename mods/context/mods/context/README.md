# Native Context panel

`native/panel.ts` builds one `context` native entry point with a single Context
button beside Files/Changes. The panel uses their rounded border/header styling.
A Space/Agent segmented radio control selects the owner; editable tags precede
one Herdr native Markdown editor, with debounced autosave and no preview.

Shared context belongs to the selected Space's persistent ID plus permanent Core
ID. Agent context follows Herdr's highlighted agent and resolves a random stored
binding after checking its process lifetime. It shows only the selected owner; inherited Space context remains separate in
CLI reads. Drafts remain per owner and saves capture revisions.
The CLI and panel share validation, atomic writes and stale-write rejection.
Autosave captures each owner, retries failures and merges independent changes;
conflicting text stays in a retained draft. The panel hides machine/revision
metadata and has no Refresh, Save or Review buttons. It reacts to live selection
like Files/Changes, batches opening into one request and caches revisited drafts.
Notes are not automatically sent to agents; the panel copies an exact CLI read
command. See `../../docs/AGENT_GUIDE.md` and `../../README.md`.

No browser framework or Node APIs run in the mod. The external Node CLI runs via
host exec, off the render path, with private consumed request files. Preparation
and sync preserve personal layouts, Rigs and shipped files. The two-panel upgrade
preserves old records/drafts and combines only its managed header/panel blocks.
