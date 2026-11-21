import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceSnapshot, compareBuild, executableId, writeStatusReport } from '../scripts/dev-build-status.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'handlr-build-sync-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/main.rs'), 'first build');
  const source = sourceSnapshot(root);
  const stamp = { schema_version: 1, source_root: root, source,
    packaged_at: '2026-11-14T12:00:00.500Z', executable_id: 'binary-one' };
  const processes = [{ pid: 42, started_at: '2026-11-14T12:00:02Z' }];
  return { root, stamp, processes, compare(overrides = {}) {
    return compareBuild({ root, stamp, processes, source: sourceSnapshot(root), binaryId: 'binary-one', ...overrides });
  }, close() { rmSync(root, { recursive: true, force: true }); } };
}

test('uncommitted edits, additions, deletions, and restored content change source identity', () => {
  const f = fixture();
  try {
    assert.equal(f.compare().state, 'current');
    writeFileSync(join(f.root, 'src/main.rs'), 'dirty source');
    assert.equal(f.compare().state, 'rebuild_required');
    assert.ok(f.compare().changed.includes('src/main.rs'));
    writeFileSync(join(f.root, 'src/main.rs'), 'first build');
    assert.equal(f.compare().state, 'current');
    writeFileSync(join(f.root, 'src/added.rs'), 'new source');
    assert.equal(f.compare().state, 'rebuild_required');
    unlinkSync(join(f.root, 'src/added.rs'));
    assert.equal(f.compare().state, 'current');
    unlinkSync(join(f.root, 'src/main.rs'));
    assert.equal(f.compare().state, 'rebuild_required');
  } finally { f.close(); }
});

test('build outputs and generated runtime declarations do not require rebuilding', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'crates/target'), { recursive: true });
    writeFileSync(join(f.root, 'crates/target/output'), 'compiler output');
    // The new crates directory contributes no files besides excluded output.
    const before = sourceSnapshot(f.root);
    writeFileSync(join(f.root, 'src/generated.d.ts'), 'runtime metadata');
    writeFileSync(join(f.root, 'src/jsconfig.json'), '{}');
    writeFileSync(join(f.root, 'README.md'), 'documentation only');
    assert.equal(sourceSnapshot(f.root).fingerprint, before.fingerprint);
  } finally { f.close(); }
});

test('native dependency and symlink target edits invalidate the snapshot', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'dependency'));
    writeFileSync(join(f.root, 'dependency/build.zig'), 'version 1');
    mkdirSync(join(f.root, 'vendor'));
    symlinkSync('../dependency', join(f.root, 'vendor/native'));
    const before = sourceSnapshot(f.root);
    writeFileSync(join(f.root, 'dependency/build.zig'), 'version 2');
    assert.notEqual(sourceSnapshot(f.root).fingerprint, before.fingerprint);
    assert.notEqual(sourceSnapshot(f.root).files['vendor/native/build.zig'], before.files['vendor/native/build.zig']);
  } finally { f.close(); }
});

test('source match requires reopening an old process, not another rebuild', () => {
  const f = fixture();
  try {
    assert.equal(f.compare({ processes: [{ pid: 9, started_at: '2026-11-14T11:59:59Z' }] }).state, 'restart_required');
    assert.equal(f.compare({ processes: [{ pid: 9, started_at: '2026-11-14T12:00:00Z' }] }).state, 'restart_required');
    assert.equal(f.compare({ processes: [...f.processes, { pid: 9, started_at: '2026-11-14T11:59:59Z' }] }).state, 'restart_required');
    assert.equal(f.compare({ processes: [] }).state, 'not_running');
    assert.equal(f.compare().state, 'current');
  } finally { f.close(); }
});

test('missing, mismatched, invalid, and foreign records never claim in sync', () => {
  const f = fixture();
  try {
    assert.equal(f.compare({ stamp: undefined }).state, 'untracked');
    assert.equal(f.compare({ stamp: {} }).state, 'unknown');
    assert.equal(f.compare({ binaryId: 'some-other-build' }).state, 'unknown');
    assert.equal(f.compare({ root: '/other/worktree' }).state, 'rebuild_required');
  } finally { f.close(); }
});

test('linked executable identity survives signature payload changes', () => {
  const f = fixture();
  try {
    const bytes = Buffer.alloc(96);
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(1, 16);
    bytes.writeUInt32LE(0x1b, 32);
    bytes.writeUInt32LE(24, 36);
    Buffer.from('00112233445566778899aabbccddeeff', 'hex').copy(bytes, 40);
    const binary = join(f.root, 'Herdr');
    writeFileSync(binary, bytes);
    const identity = executableId(binary);
    assert.equal(identity, '00112233445566778899aabbccddeeff');
    bytes[80] = 42;
    writeFileSync(binary, bytes);
    assert.equal(executableId(binary), identity);
    writeFileSync(binary, 'not an executable');
    assert.throws(() => executableId(binary));
  } finally { f.close(); }
});

test('build report publication includes time and process identities and replaces stale results', () => {
  const f = fixture();
  try {
    const file = join(f.root, 'data/build-status.json');
    const result = writeStatusReport(f.compare(), file);
    assert.equal(result.schema_version, 1);
    assert.ok(Number.isFinite(Date.parse(result.observed_at)));
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).processes, f.processes);
    writeFileSync(join(f.root, 'src/main.rs'), 'edited');
    writeStatusReport(f.compare(), file);
    const updated = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(updated.state, 'rebuild_required');
    assert.ok(updated.changed.includes('src/main.rs'));
  } finally { f.close(); }
});


test('bundled mod and frame edits invalidate the app build while optional packages stay independent', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'mods/machines'), { recursive: true });
    mkdirSync(join(f.root, 'mods/frame/settings'), { recursive: true });
    mkdirSync(join(f.root, 'mods/context'), { recursive: true });
    writeFileSync(join(f.root, 'mods/bundled.txt'), 'machines\n');
    writeFileSync(join(f.root, 'mods/machines/main.js'), 'machine v1');
    writeFileSync(join(f.root, 'mods/frame/settings/main.js'), 'settings v1');
    writeFileSync(join(f.root, 'mods/context/main.js'), 'optional v1');
    const before = sourceSnapshot(f.root);
    writeFileSync(join(f.root, 'mods/context/main.js'), 'optional v2');
    assert.equal(sourceSnapshot(f.root).fingerprint, before.fingerprint);
    writeFileSync(join(f.root, 'mods/machines/main.js'), 'machine v2');
    assert.notEqual(sourceSnapshot(f.root).files['mods/machines/main.js'], before.files['mods/machines/main.js']);
    writeFileSync(join(f.root, 'mods/frame/settings/main.js'), 'settings v2');
    assert.notEqual(sourceSnapshot(f.root).files['mods/frame/settings/main.js'], before.files['mods/frame/settings/main.js']);
    writeFileSync(join(f.root, 'mods/bundled.txt'), 'machines\ncontext\n');
    assert.ok(sourceSnapshot(f.root).files['mods/context/main.js']);
  } finally { f.close(); }
});
