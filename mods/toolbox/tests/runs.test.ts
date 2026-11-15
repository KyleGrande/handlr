import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runArgv, runKey, runStatus, findRunTerminal } from '../mods/toolbox/runs.js';

test('background shell reports actual exit status even for exit and exec commands', () => {
  const folder = mkdtempSync(join(tmpdir(), 'toolbox-run-'));
  try {
    const report = join(folder, 'report');
    // A test double for status reporting, never the user's Core.
    const fake = join(folder, 'hc');
    writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@" > "$TOOLBOX_TEST_REPORT"\n', { mode: 0o755 });
    for (const [command, code] of [['printf "hello"; exit 0', 0], ['exit 7', 7], ['exec sh -c "exit 3"', 3]] as const) {
      // Override only the outer shell PATH: login shells may reset it.
      const argv = runArgv(command);
      const result = spawnSync(argv[0], argv.slice(1), {
        input: '\n', encoding: 'utf8',
        env: { ...process.env, PATH: folder + ':' + process.env.PATH, HC_TERMINAL_ID: 'test-terminal', TOOLBOX_TEST_REPORT: report },
      });
      assert.equal(result.status, code, result.stderr);
      assert.equal(readFileSync(report, 'utf8'), `label\ntest-terminal\ntoolbox.exit=${code}\n`);
      assert.match(result.stdout, new RegExp(`Toolbox exit ${code}`));
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('run feedback distinguishes starting, running, pass, failure and unknown', () => {
  const record = { token: 'run-1', started: Date.now(), terminal: 't1' };
  const terminal = { address: 't1', state: 'live', labels: { 'toolbox.run': 'run-1' } };
  assert.equal(runStatus({ token: 'new', started: Date.now() }).kind, 'starting');
  assert.equal(runStatus({ token: 'lost', started: 0 }).kind, 'unknown');
  assert.equal(runStatus(record, terminal).kind, 'running');
  assert.equal(runStatus(record, { ...terminal, labels: { 'toolbox.exit': '0' } }).kind, 'passed');
  assert.equal(runStatus(record, { ...terminal, labels: { 'toolbox.exit': '2' } }).kind, 'failed');
  assert.equal(runStatus(record, { ...terminal, state: 'finished', exit_code: 4 }).kind, 'failed');
  assert.equal(runStatus(record, { ...terminal, state: 'finished' }).kind, 'unknown');
  assert.equal(runStatus(record).kind, 'unknown');
  assert.equal(findRunTerminal(record, [{ ...terminal, labels: { 'toolbox.run': 'another-run' } }]), undefined);
  assert.equal(findRunTerminal({ token: 'run-1', started: 0 }, [terminal]), terminal);
  assert.notEqual(runKey('core-a/space', 'build'), runKey('core-b/space', 'build'));
});
