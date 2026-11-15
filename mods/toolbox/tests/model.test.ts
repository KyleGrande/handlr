import test from 'node:test';
import assert from 'node:assert/strict';
import { expand, parameters, saveEntry } from '../mods/toolbox/model.js';
import { execFileSync } from 'node:child_process';
test('parameters are shell data, including quotes and command substitutions', () => {
  const value = "hello'; $(touch /tmp/toolbox-should-never-exist)\n世界";
  const cmd = expand("printf '%s' {{value}}", { value });
  assert.equal(execFileSync('sh', ['-c', cmd], { encoding: 'utf8' }), value);
  assert.deepEqual(parameters('{{mode}} {{mode}} {{port}}'), ['mode', 'port']);
  assert.throws(() => expand('{{mode}}', {}), /mode/);
});
test('scope isolation and revision checks preserve concurrent edits', () => {
  const entry = { id: 'one', label: 'Build', command: 'npm run build' };
  const first = saveEntry(null, 'workspace-a', entry, 0);
  const second = saveEntry(first, 'workspace-b', entry, 0);
  assert.equal(second.owners['workspace-a'].entries.length, 1);
  assert.throws(() => saveEntry(second, 'workspace-a', entry, 0), /another view/);
  assert.equal(saveEntry(second, 'workspace-a', { ...entry, command: 'pnpm build' }, 1).owners['workspace-a'].entries.length, 1);
});

test('repo tools reject malformed records and preserve commands as data', async () => {
  const { repoTools } = await import('../mods/toolbox/model.js');
  assert.deepEqual(repoTools(null), []);
  for (const invalid of [null, {}, { version: 2, tools: [] }, { version: 1, tools: [null] }, { version: 1, tools: [{ label: 'Build', command: '' }] }]) assert.throws(() => repoTools(JSON.stringify(invalid)));
  const tools = repoTools(JSON.stringify({ version: 1, tools: [{ label: 'Build', command: 'pnpm run build' }] }));
  assert.equal(tools[0].command, 'pnpm run build');
  assert.equal(tools[0].id, 'repo:pnpm run build');
});

 test('repo folder follows live terminals only within the captured Space', async () => {
  const { spaceFolder } = await import('../mods/toolbox/model.js');
  const space = { folder: '/home/user', tabs: [{ id: 'own-tab' }] };
  const panes = [
    { tab: 'other-tab', terminal: 't1', cwd: '/other-repo' },
    { tab: 'own-tab', terminal: null, cwd: '/mod-pane' },
    { tab: 'own-tab', terminal: 't2', cwd: '/toolbox-repo' },
  ];
  assert.equal(spaceFolder(space, panes), '/toolbox-repo');
  assert.equal(spaceFolder(space, []), '/home/user');
});
