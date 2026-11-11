# Planned native Context mod

The native entry point is not implemented yet. Maintain it as TypeScript and emit the `main.js` Herdr requires when implementation begins.

Provide separate Notes and Tags entry points over the same shared implementation, with always-present top-right buttons beside Files/Changes opening the existing right-side panel. Each view defaults to the checkout selected by the focused terminal's CWD and offers Checkout/Agent scope (Folder/Agent outside Git). Two spaces using the same checkout share context. See `../../PLAN.md` for the agreed mod-buttons integration and ownership rules.

The Notes view edits descriptive notes, explicit instructions and handoff text; Tags edits tag chips. Persistence and conflict handling belong in the shared CLI/storage layer, not the views. Preserve the user's current personal layout and shipped mods. Do not put these entries behind + or require right-click to open them.
