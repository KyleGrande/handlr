// Generated from main.ts by npm run build:mod.
/** Keep workflow rules in AGENTS.md; the clipboard only supplies the guide and task context. */
export function setupPrompt(options = {}) {
    const guide = options.guide ? JSON.stringify(options.guide) : 'the installed Herdr Rigs AGENTS.md';
    const task = options.demo ? 'set up a disposable Herdr Rigs demo' : options.checkout ? `set up a Herdr rig for ${JSON.stringify(options.checkout)}` : 'set up a Herdr rig for my current project';
    return `Read and follow ${guide} to ${task}.`;
}
