import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npm', ['install', '--prefix', join(root,'.toolchain'), '--no-save',
  'rust-cargo-cli@1.0.2', '@zigc/cli@0.16.0'], {
  env: { ...process.env, RUST_CARGO_CLI_TOOLCHAIN: '1.100.0', RUST_CARGO_CLI_NO_ENV: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
