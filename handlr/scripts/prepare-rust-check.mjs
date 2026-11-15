// Offline check of the actual engine sources. GitHub source checkouts at the
// versions in ../Cargo.lock are used when Cargo cannot reach the registries.
// Only the features used by the engine are enabled in these test manifests.
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const specs = {
  serde: ['serde/serde', { serde_core: ['serde_core', ['result']], serde_derive: ['serde_derive', [], true] },
    { default: ['std'], std: ['serde_core/std'], derive: ['serde_derive'], alloc: ['serde_core/alloc'], rc: ['serde_core/rc'], unstable: ['serde_core/unstable'] }],
  serde_core: ['serde/serde_core', {}, { default: ['std', 'result'], std: [], alloc: [], rc: [], result: [], unstable: [] }],
  serde_derive: ['serde/serde_derive', { 'proc-macro2': ['proc-macro2'], quote: ['quote'], syn: ['syn', ['clone-impls','derive','parsing','printing','proc-macro']] }, { default: [], deserialize_in_place: [] }],
  serde_json: ['json', { serde_core: ['serde_core'], itoa: ['itoa'], memchr: ['memchr'], zmij: ['zmij'] },
    { default: ['std'], std: ['memchr/std','serde_core/std'], alloc: ['serde_core/alloc'], raw_value: [], float_roundtrip: [], arbitrary_precision: [], unbounded_depth: [] }],
  syn: ['syn3', { 'proc-macro2': ['proc-macro2'], quote: ['quote'], 'unicode-ident': ['unicode-ident'] },
    { default: ['derive','parsing','printing','clone-impls','proc-macro'], derive: [], parsing: [], printing: [], 'clone-impls': [], 'proc-macro': ['proc-macro2/proc-macro','quote/proc-macro'], full: [], fold: [], visit: [], 'visit-mut': [], 'extra-traits': [] }],
  quote: ['quote', { 'proc-macro2': ['proc-macro2'] }, { default: ['proc-macro'], 'proc-macro': ['proc-macro2/proc-macro'] }],
  'proc-macro2': ['proc-macro2', { 'unicode-ident': ['unicode-ident'] }, { default: ['proc-macro'], 'proc-macro': [], 'span-locations': [], nightly: [] }],
  'unicode-ident': ['unicode-ident', {}, {}],
  itoa: ['itoa', {}, {}],
  memchr: ['memchr', {}, { default: ['std'], std: ['alloc'], alloc: [], 'use_std': ['std'] }],
  zmij: ['zmij', {}, {}]
};
const destination = resolve('.checks/rust');
for (const [name, [directory, dependencies, features]] of Object.entries(specs)) {
  const original = resolve('.tools/vendor', directory);
  const source = await readFile(join(original, 'Cargo.toml'), 'utf8');
  const version = source.match(/^version = "([^"]+)"/m)[1];
  const edition = source.match(/^edition = "([^"]+)"/m)?.[1] ?? '2021';
  const dir = join(destination, name);
  await mkdir(dir, { recursive: true });
  let manifest = `[package]\nname = ${JSON.stringify(name)}\nversion = ${JSON.stringify(version)}\nedition = ${JSON.stringify(edition)}\n`;
  try { await access(join(original,'build.rs')); manifest += `build = ${JSON.stringify(join(original,'build.rs'))}\n`; } catch {}
  manifest += `\n[lib]\npath = ${JSON.stringify(join(original, 'src/lib.rs'))}\n`;
  if (name === 'serde_derive') manifest += 'proc-macro = true\n';
  manifest += '\n[dependencies]\n';
  for (const [dependency, [target, flags = [], optional = false]] of Object.entries(dependencies)) {
    manifest += `${JSON.stringify(dependency)} = { path = ${JSON.stringify(join(destination,target))}, default-features = false, features = ${JSON.stringify(flags)}, optional = ${optional} }\n`;
  }
  manifest += '\n[features]\n';
  for (const [feature, flags] of Object.entries(features)) manifest += `${JSON.stringify(feature)} = ${JSON.stringify(flags)}\n`;
  manifest += '\n[lints.rust]\nunexpected_cfgs = "allow"\n';
  await writeFile(join(dir,'Cargo.toml'),manifest);
}
const engine = join(destination,'engine');
await mkdir(engine,{recursive:true});
await writeFile(join(engine,'Cargo.toml'), `[package]
name = "panel-workspace"
version = "0.1.0"
edition = "2024"
[workspace]
[lib]
path = ${JSON.stringify(resolve('../crates/panel-workspace/src/lib.rs'))}
[[test]]
name = "composition"
path = ${JSON.stringify(resolve('../crates/panel-workspace/tests/composition.rs'))}
[[test]]
name = "native_layout"
path = ${JSON.stringify(resolve('../crates/panel-workspace/tests/native_layout.rs'))}
[dependencies]
serde = { path = "../serde", features = ["derive"] }
serde_json = { path = "../serde_json" }
`);
console.log('Prepared .checks/rust/engine/Cargo.toml (actual engine sources, offline source dependencies)');
