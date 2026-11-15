# Set up Herdr Toolbox

Use the exact repo folder and optional Herdr machine in the user's copied prompt. Read that repo's applicable AGENTS.md and development docs. Inspect package.json scripts, packageManager/lockfiles, and scripts/ files. Discover existing useful commands without installing dependencies or running builds, scripts, or services. Do not invent commands.

Create or update `<repo>/.herdr/toolbox.json` with this shape:

```json
{"version":1,"tools":[{"label":"Build","icon":"▶","command":"pnpm run build"}]}
```

Use the package manager supported by the repo. Provide a concise label and a distinct, recognizable single icon or glyph for every tool. The tray shows icons with optional faint labels underneath, toggled with Aa in the header; labels also appear on hover. Do not put words, command names, or label text in the icon field. Prefer different icons for different commands so they can be distinguished without labels. Run starts in a background terminal; a later icon click opens its output. Status uses the command’s exit code: 0 is green, nonzero is red, running has a blue activity ring. Use foreground commands that return their actual status; do not add `&`, swallow failures, or invent success checks. Run again, Edit, and Variant are available through right-click. Commands run in this repo folder through `sh -lc`. Preserve existing tools and merge by command instead of duplicating them. Keep secrets out of the file. Never overwrite invalid existing content; report it. Do not commit the file unless asked.

For optional user-entered values use unquoted placeholders such as `pnpm run build -- --mode {{mode}}`. Toolbox prompts when launched and quotes each value as one shell argument. Prefer concrete saved variants for common configurations. Include only useful runnable package scripts and actual scripts evidenced by the repo; skip destructive cleanup/deploy commands unless explicitly requested.

Toolbox reads this file automatically within five seconds for each Space using this folder. It displays tools without executing them. Summarize which tools you added. Do not start any commands or services merely to add shortcuts.

For a remote repo, inspect and write on the machine named in the copied prompt using Herdr's machine-aware commands (`hc exec --on <machine> ...`); do not create a local substitute.
