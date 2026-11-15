import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...args] = process.argv.slice(2);
if (!['cargo', 'rustc', 'rustfmt', 'rustup', 'zig'].includes(tool)) {
  throw new Error('Usage: node scripts/toolchain.mjs cargo|rustc|rustfmt|rustup|zig [arguments]');
}
const bin = join(root, '.toolchain/node_modules/.bin');
const rust = join(root, '.toolchain/node_modules/rust-cargo-cli/dist');
const zig = join(root, `.toolchain/node_modules/@zigc/${process.platform}-${process.arch}/bin/zig${process.platform === 'win32' ? '.exe' : ''}`);
const env = { ...process.env,
  CARGO_HOME: join(rust, 'cargo'), RUSTUP_HOME: join(rust, 'rustup'),
  PATH: [join(rust, 'cargo/bin'), bin, process.env.PATH ?? ''].join(delimiter),
  ZIG: zig,
  ZIG_LIB_DIR: join(root,'.toolchain/node_modules/@zigc/lib'),
  ZIG_GLOBAL_CACHE_DIR: join(root, '.toolchain/zig-cache'),
  ZIG_LOCAL_CACHE_DIR: join(root, '.toolchain/zig-local-cache')
};
const sdk = '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
if (process.platform === 'darwin' && !env.SDKROOT && existsSync(sdk)) env.SDKROOT = sdk;
const result = spawnSync(tool === 'zig' ? zig : join(bin, tool), args, { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
