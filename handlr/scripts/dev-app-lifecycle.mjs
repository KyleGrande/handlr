// Sequencing for explicit development actions. Never signals a PID.
export async function performDevAction({ action, run, observe, executable, app, home, node,
  installed, wait = ms => new Promise(done => setTimeout(done, ms)), now = () => Date.now() }) {
  if (!['rebuild','relaunch'].includes(action)) throw new Error('Use rebuild or relaunch');
  if (action === 'rebuild') run(node, ['scripts/release-macos.mjs', '--install']);
  if (!installed()) throw new Error('Handlr Dev is not installed. Rebuild and install it first.');
  if (observe().length) {
    run(executable, ['do','app.quit'], { env: { ...process.env, HERDR_APP_HOME: home } });
    const deadline = now() + 20000;
    while (observe().length && now() < deadline) await wait(250);
    if (observe().length) throw new Error('Handlr Dev did not finish quitting; no second copy was opened.');
  }
  run('/usr/bin/open', ['-a',app]);
}
