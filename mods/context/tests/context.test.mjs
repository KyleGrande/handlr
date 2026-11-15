import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../dist/storage.js';
import { scratchpad, targetKey, emptyRecord, target, patch } from '../dist/model.js';
import { resolveSpace, agentLifetime } from '../dist/identity.js';
import { dispatch } from '../dist/service.js';
import { Autosave, Drafts, highlightedAgent } from '../dist/drafts.js';
import { main } from '../dist/cli.js';

const execute = promisify(execFile), machine = '0123456789abcdef0123456789abcdef';
const owner = { kind: 'space', machine, id: 'sp0123456789abcdef0123456789abcdef' };
const other = { ...owner, id: 'spfedcba9876543210fedcba9876543210' };
const agent = { kind: 'agent', machine, id: '7bd8d233-88a9-4250-9266-fcaa747c5bbc' };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'herdr-context-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const runner = async () => ({ code: 0, stdout: JSON.stringify({ core: { id: machine } }), stderr: '' });

test('persistent content survives a new Store, partial updates preserve other fields, private files', async t => {
  const root = await fixture(t), s = new Store(root);
  assert.equal((await s.read(owner)).revision, 0);
  const first = await s.write(owner, 0, { notes: 'Purpose', tags: ['active'], instructions: 'Review', handoff: 'Next step' });
  assert.equal(first.revision, 1);
  const next = await new Store(root).write(owner, 1, { tags: ['ready'] });
  assert.equal(next.notes, 'Purpose'); assert.equal(next.created_at, first.created_at);
  assert.equal((await new Store(root).read(owner)).revision, 2);
  assert.equal((await stat(s.file(owner))).mode & 0o777, 0o600);
});
test('stale writes preserve the accepted record', async t => {
  const s = new Store(await fixture(t));
  await s.write(owner, 0, { notes: 'winner' });
  await assert.rejects(s.write(owner, 0, { notes: 'loser' }), e => e.code === 'conflict' && e.current_revision === 1);
  assert.equal((await s.read(owner)).notes, 'winner');
});
test('independent CLI processes cannot both accept one revision', async t => {
  const root = await fixture(t), home = join(root, 'state');
  const files = await Promise.all(['a', 'b'].map(async name => {
    const path = join(root, `${name}.json`);
    await writeFile(path, JSON.stringify({ target: owner, expected_revision: 0, patch: { notes: name } })); return path;
  }));
  const results = await Promise.all(files.map(async path => {
    try { const r = await execute(process.execPath, ['dist/cli.js', 'write', '--input', path], { env: { ...process.env, CONTEXT_HOME: home } }); return JSON.parse(r.stdout); }
    catch (e) { assert.equal(e.code, 2); return JSON.parse(e.stdout); }
  }));
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.find(r => !r.ok).error.code, 'conflict');
  assert.equal((await new Store(home).read(owner)).revision, 1);
  assert.equal((await readdir(join(home, 'records'))).length, 1);
});
test('invalid and future-version records are preserved and never overwritten', async t => {
  const root = await fixture(t), s = new Store(root); await mkdir(join(root, 'records'));
  const raw = JSON.stringify({ schema_version: 99 }); await writeFile(s.file(owner), raw);
  await assert.rejects(s.write(owner, 0, { notes: 'new' }), e => e.code === 'unsupported_version');
  assert.equal(await readFile(s.file(owner), 'utf8'), raw);
  await writeFile(s.file(owner), '{broken');
  await assert.rejects(s.read(owner), e => e.code === 'corrupt_record');
});
test('Space, machine and agent owners stay separate; legacy checkout records remain readable', async t => {
  const s = new Store(await fixture(t));
  const legacy = { kind: 'checkout', machine, path: '/example/project' };
  for (const target of [owner, other, { ...owner, machine: 'fedcba9876543210fedcba9876543210' }, legacy, agent]) await s.write(target, 0, { notes: targetKey(target) });
  assert.equal((await s.read(owner)).notes, targetKey(owner));
  assert.equal((await s.read(legacy)).notes, targetKey(legacy));
  assert.throws(() => target({ kind: 'agent', machine, id: 't7' }));
  assert.throws(() => target({ ...owner, machine: null }));
  assert.throws(() => target({ ...owner, id: 'Project Name' }));
  assert.throws(() => target({ ...owner, path: '/same/checkout' }));
});
test('inheritance is read separately and cannot write through an agent update', async t => {
  const s = new Store(await fixture(t)); await s.write(owner, 0, { notes: 'Shared', tags: ['shared'] });
  await s.write(agent, 0, { notes: 'Assignment', tags: ['own'] });
  const read = await dispatch({ op: 'read', target: agent, inherited: owner }, s);
  assert.equal(read.inherited.notes, 'Shared'); assert.equal(read.record.notes, 'Assignment');
  await dispatch({ op: 'write', target: agent, expected_revision: 1, patch: { notes: 'Progress' } }, s);
  assert.equal((await s.read(owner)).revision, 1);
  await assert.rejects(dispatch({ op: 'read', target: agent, inherited: { ...owner, machine: 'other-machine-id-1234' } }, s));
  await assert.rejects(dispatch({ op: 'write', target: agent, inherited: owner, expected_revision: 2, patch: { notes: 'x' } }, s));
});
test('Space resolution uses stable IDs without consulting CWD, Git, names or order', async () => {
  const calls = [];
  const r = async (p, a) => { calls.push([p, a]); return runner(); };
  assert.deepEqual(await resolveSpace(owner.id, null, r), owner);
  assert.deepEqual(await resolveSpace(other.id, null, r), other);
  assert.ok(calls.every(([p, a]) => p === 'hc' && a[0] === 'server'));
  await assert.rejects(resolveSpace('friendly name', null, r), e => e.code === 'invalid_input');
  await assert.rejects(resolveSpace(owner.id, null, async () => ({ code: 1, stdout: '{}', stderr: '' })), e => e.code === 'identity_unavailable');
});
test('remote Space strips connection prefixes and survives machine rename; offline never falls back', async () => {
  const r = async () => ({ code: 0, stdout: JSON.stringify({ machines: [{ name: 'renamed', id: machine, state: 'connected' }] }), stderr: '' });
  assert.deepEqual(await resolveSpace(`renamed/${owner.id}`, 'renamed', r), owner);
  assert.deepEqual(await resolveSpace(owner.id, 'renamed', r), owner);
  await assert.rejects(resolveSpace(owner.id, 'offline', r), e => e.code === 'identity_unavailable');
  await assert.rejects(resolveSpace(`old/${owner.id}`, 'renamed', r), e => e.code === 'invalid_input');
});
test('agents can resolve their current live terminal Space; stale and unlabelled terminals fail closed', async () => {
  const r = async (p, a) => a[0] === 'server' ? runner() : { code: 0, stdout: JSON.stringify({ address: 't7', state: 'live', labels: { 'herdr.space': owner.id } }), stderr: '' };
  assert.deepEqual(await resolveSpace(undefined, null, r, 't7'), owner);
  await assert.rejects(resolveSpace(undefined, null, r, 't8'), e => e.code === 'identity_unavailable');
  await assert.rejects(resolveSpace(undefined, null, r, ''), e => e.code === 'identity_unavailable');
  const finished = async (p, a) => a[0] === 'server' ? runner() : { code: 0, stdout: JSON.stringify({ address: 't7', state: 'finished', labels: { 'herdr.space': owner.id } }), stderr: '' };
  await assert.rejects(resolveSpace(undefined, null, finished, 't7'), e => e.code === 'identity_unavailable');
});
test('one Markdown scratchpad preserves legacy categorized text without changing a record on read', () => {
  const legacy = { ...emptyRecord(owner), notes: '# Work\n\n- A', instructions: 'Review first', handoff: 'Continue here' };
  assert.equal(scratchpad(legacy), '# Work\n\n- A\n\n## Instructions\n\nReview first\n\n## Handoff\n\nContinue here');
  assert.equal(legacy.instructions, 'Review first');
  const normalized = { ...legacy, notes: scratchpad(legacy), instructions: '', handoff: '' };
  assert.equal(scratchpad(normalized), normalized.notes);
  assert.equal(scratchpad(emptyRecord(owner)), '');
});
test('late loads are rejected and saves capture their displayed owner across focus changes', () => {
  const drafts = new Drafts(); const old = drafts.select(owner), current = drafts.select(other);
  assert.equal(drafts.accept(old, emptyRecord(owner)), false);
  assert.equal(drafts.accept(current, emptyRecord(other)), true);
  drafts.edit(other, { notes: 'other draft' }); const save = drafts.snapshot(other);
  const next = drafts.select(owner); drafts.accept(next, emptyRecord(owner)); drafts.edit(owner, { notes: 'owner draft' });
  assert.deepEqual(save.target, other);
  drafts.saved({ ...emptyRecord(other), notes: 'other draft', revision: 1 }, save.generation);
  assert.equal(drafts.entries.get(targetKey(owner)).patch.notes, 'owner draft');
  assert.equal(drafts.entries.get(targetKey(other)).record.notes, 'other draft');
  const restored = new Drafts(); restored.entries = new Map(JSON.parse(JSON.stringify([...drafts.entries])));
  assert.equal(restored.entries.get(targetKey(owner)).patch.notes, 'owner draft');
});
test('typing while save is in flight keeps newer draft; conflicts retain original revision', () => {
  const d = new Drafts(), e = d.select(owner); d.accept(e, emptyRecord(owner));
  d.edit(owner, { notes: 'first' }); const s = d.snapshot(owner); d.edit(owner, { notes: 'second' });
  d.saved({ ...emptyRecord(owner), revision: 1, notes: 'first' }, s.generation);
  assert.equal(d.snapshot(owner).patch.notes, 'second'); assert.equal(d.snapshot(owner).expected_revision, 1);
});
test('CLI help and all failures are versioned JSON, content is read from files', async t => {
  for (const args of [[], ['bogus'], ['write'], ['resolve', '--wat', 'x'], ['read', '--cwd'], ['help', '--cwd', 'x']]) {
    const r = await main(args); assert.equal(r.response.schema_version, 1); assert.equal(typeof r.response.ok, 'boolean');
  }
  const root = await fixture(t), input = join(root, 'invalid.json'); await writeFile(input, 'not json');
  const result = await main(['write', '--input', input]); assert.equal(result.response.error.code, 'invalid_json');
  const consumed = join(root, 'request-test.json'); await writeFile(consumed, '{broken');
  await main(['request', '--input', consumed, '--consume-from', root]);
  await assert.rejects(readFile(consumed), e => e.code === 'ENOENT');
  assert.throws(() => patch({ tags: ['a', 'a'] })); assert.throws(() => patch({ secret: 'value' }));
});

test('Agent selection follows the highlighted row within the active Space, never a global assignment', () => {
  const a = { address: 't7', space: owner.id, focused: true };
  const b = { address: 't8', space: owner.id, focused: false };
  assert.equal(highlightedAgent(owner.id, [a, b], 't8')?.address, 't7');
  assert.equal(highlightedAgent(owner.id, [{ ...a, focused: false }, { ...b, focused: true }], 't7')?.address, 't8');
  assert.equal(highlightedAgent(owner.id, [{ ...a, focused: false }, b], 't8')?.address, 't8');
  assert.equal(highlightedAgent(other.id, [a, b], 't7'), undefined);
});
const lifetime = { machine, terminal: 't7', terminal_created_ms: 1000, process_pid: 777, process_started_at: 'Tue Nov 10 22:00:00 2026' };
test('concurrent views share one agent binding; switching agents and process replacement select distinct notes', async t => {
  const s = new Store(await fixture(t));
  const [a, same] = await Promise.all([s.agentForLifetime(lifetime), new Store(s.home).agentForLifetime(lifetime)]);
  assert.deepEqual(a, same);
  const b = await s.agentForLifetime({ ...lifetime, terminal: 't8' });
  const replacement = await s.agentForLifetime({ ...lifetime, process_started_at: 'Tue Nov 10 22:01:00 2026' });
  const newPid = await s.agentForLifetime({ ...lifetime, process_pid: 778 });
  assert.equal(new Set([a, b, replacement, newPid].map(targetKey)).size, 4);
  await s.write(a, 0, { notes: 'A draft', tags: ['A'] }); await s.write(b, 0, { notes: 'B draft' });
  assert.equal((await s.read(await new Store(s.home).agentForLifetime(lifetime))).notes, 'A draft');
  assert.equal((await s.read(b)).notes, 'B draft'); assert.equal((await s.read(replacement)).revision, 0);
});
test('process binding verifies creation, process birth and Space, and rejects replacement during resolution', async () => {
  const facts = { address: 't7', state: 'live', created_ms: 1000, foreground: { pid: 777 }, labels: { 'herdr.space': owner.id } };
  const r = async (p, a) => ({ code: 0, stdout: p === 'ps' ? 'Tue Nov 10 22:00:00 2026\n' : JSON.stringify(facts), stderr: '' });
  assert.deepEqual(await agentLifetime(owner, 't7', null, r), lifetime);
  await assert.rejects(agentLifetime(other, 't7', null, r), e => e.code === 'identity_unavailable');
  let inspections = 0;
  const replaced = async (p, a) => p === 'ps' ? r(p, a) : { code: 0, stdout: JSON.stringify({ ...facts, foreground: { pid: ++inspections === 1 ? 777 : 778 } }), stderr: '' };
  await assert.rejects(agentLifetime(owner, 't7', null, replaced), e => e.code === 'identity_unavailable');
  await assert.rejects(agentLifetime(owner, 't7', null, async () => ({ code: 1, stdout: '', stderr: '' })), e => e.code === 'identity_unavailable');
});

test('autosave debounces edits and keeps captured owners when selection changes', async () => {
  let now = 0;
  const drafts = new Drafts(), q = new Autosave(drafts, () => now);
  drafts.accept(drafts.select(owner), emptyRecord(owner)); drafts.edit(owner, { notes: 'A' }); q.schedule(owner);
  const written = [];
  const io = { read: async () => { throw new Error('unexpected read'); }, write: async s => { written.push(s); return { ...emptyRecord(s.target), ...s.patch, revision: 1 }; } };
  now = 649; await q.flush(io); assert.equal(written.length, 0);
  drafts.accept(drafts.select(other), emptyRecord(other)); drafts.edit(other, { notes: 'B' }); q.schedule(other);
  now = 650; await q.flush(io);
  assert.deepEqual(written[0].target, owner); assert.equal(written[0].patch.notes, 'A');
  assert.equal(drafts.entries.get(targetKey(other)).patch.notes, 'B');
  now = 1299; await q.flush(io); assert.deepEqual(written[1].target, other);
});
test('autosave keeps typing during an in-flight write and then saves the newer edit', async () => {
  let now = 650, release;
  const drafts = new Drafts(), q = new Autosave(drafts, () => now);
  drafts.accept(drafts.select(owner), emptyRecord(owner)); drafts.edit(owner, { notes: 'first', tags: ['same'] }); q.schedule(owner, 0);
  const pending = q.flush({ read: async () => emptyRecord(owner), write: s => new Promise(resolve => { release = () => resolve({ ...emptyRecord(owner), ...s.patch, revision: 1 }); }) });
  drafts.edit(owner, { notes: 'second' }); q.schedule(owner); release(); await pending;
  assert.deepEqual(drafts.entries.get(targetKey(owner)).patch, { notes: 'second' });
  now = 1300;
  await q.flush({ read: async () => emptyRecord(owner), write: async s => { assert.equal(s.expected_revision, 1); assert.equal(s.patch.notes, 'second'); return { ...drafts.entries.get(targetKey(owner)).record, ...s.patch, revision: 2 }; } });
  assert.deepEqual(drafts.entries.get(targetKey(owner)).patch, {});
});
test('autosave rebases independent CLI updates without overwriting them', async t => {
  let now = 0;
  const store = new Store(await fixture(t)), drafts = new Drafts(), q = new Autosave(drafts, () => now);
  drafts.accept(drafts.select(owner), await store.read(owner)); drafts.edit(owner, { notes: 'local' }); q.schedule(owner);
  await store.write(owner, 0, { tags: ['from-cli'] });
  const io = { read: t => store.read(t), write: s => store.write(s.target, s.expected_revision, s.patch) };
  now = 650; await q.flush(io); assert.equal(drafts.entries.get(targetKey(owner)).record.revision, 1);
  now = 1300; await q.flush(io);
  assert.equal((await store.read(owner)).notes, 'local'); assert.deepEqual((await store.read(owner)).tags, ['from-cli']);
});
test('autosave pauses overlapping Markdown conflicts, retains the draft and requires a choice', async t => {
  let now = 0;
  const store = new Store(await fixture(t)), drafts = new Drafts(), q = new Autosave(drafts, () => now);
  drafts.accept(drafts.select(owner), await store.read(owner)); drafts.edit(owner, { notes: 'local' }); q.schedule(owner);
  await store.write(owner, 0, { notes: 'remote' });
  const io = { read: t => store.read(t), write: s => store.write(s.target, s.expected_revision, s.patch) };
  now = 650; await q.flush(io);
  const d = drafts.entries.get(targetKey(owner));
  assert.equal(d.patch.notes, 'local'); assert.equal(d.conflict.notes, 'remote'); assert.equal(q.hasDue(), false);
  const restored = new Drafts(); restored.entries = new Map(JSON.parse(JSON.stringify([...drafts.entries])));
  assert.equal(restored.entries.get(targetKey(owner)).conflict.notes, 'remote');
  drafts.resolveConflict(owner, true); q.schedule(owner, 0); await q.flush(io);
  assert.equal((await store.read(owner)).notes, 'local'); assert.equal((await store.read(owner)).revision, 2);
  drafts.edit(owner, { notes: 'pending' }); drafts.reconcile(owner, { ...d.record, notes: 'new remote', revision: 3 });
  drafts.resolveConflict(owner, false); assert.deepEqual(d.patch, {}); assert.equal(d.record.notes, 'new remote');
});
test('autosave retries IO failures without losing drafts or changing their owner', async () => {
  let now = 0;
  const drafts = new Drafts(), q = new Autosave(drafts, () => now);
  drafts.accept(drafts.select(owner), emptyRecord(owner)); drafts.edit(owner, { notes: 'keep' }); q.schedule(owner, 0);
  await q.flush({ read: async () => emptyRecord(owner), write: async () => { throw new Error('offline'); } });
  assert.equal(drafts.entries.get(targetKey(owner)).patch.notes, 'keep'); assert.equal(q.errors.size, 1);
  now = 4999; assert.equal(q.hasDue(), false); now = 5000; assert.equal(q.hasDue(), true);
  await q.flush({ read: async () => emptyRecord(owner), write: async s => ({ ...emptyRecord(s.target), ...s.patch, revision: 1 }) });
  assert.equal(q.errors.size, 0); assert.deepEqual(drafts.entries.get(targetKey(owner)).patch, {});
});
test('background loads ignore stale revisions and merge independent tag additions/removals', () => {
  const drafts = new Drafts(), base = { ...emptyRecord(owner), tags: ['a', 'b'], revision: 1 };
  drafts.accept(drafts.select(owner), base); drafts.edit(owner, { tags: ['b', 'c'] });
  assert.equal(drafts.reconcile(owner, { ...base, tags: ['a', 'b', 'd'], revision: 2 }), true);
  assert.deepEqual(drafts.entries.get(targetKey(owner)).patch.tags, ['b', 'd', 'c']);
  drafts.reconcile(owner, base); assert.equal(drafts.entries.get(targetKey(owner)).record.revision, 2);
});
