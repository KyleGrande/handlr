import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ExternalCheck } from './types.js';

/** An observation only. A successful probe never confers lifecycle ownership. */
export async function probeURL(url: string, kind: 'http' | 'tcp', timeout = 1000): Promise<boolean> {
  if (kind === 'tcp') return new Promise(resolve => {
    const target = new URL(url);
    const socket = net.connect(Number(target.port || (target.protocol === 'https:' ? 443 : 80)), target.hostname);
    const finish = (ready: boolean) => { socket.destroy(); resolve(ready); };
    socket.setTimeout(Math.max(1, timeout), () => finish(false));
    socket.on('connect', () => finish(true)); socket.on('error', () => finish(false));
  });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeout))), redirect: 'error' });
    await response.body?.cancel(); return response.status >= 200 && response.status < 300;
  } catch { return false; }
}
export async function waitExternal(check: ExternalCheck): Promise<void> {
  const deadline = Date.now() + check.timeout * 1000;
  do {
    if (await probeURL(check.url, check.kind, Math.min(1000, deadline - Date.now()))) return;
    await sleep(Math.max(0, Math.min(150, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error(`External dependency ${check.key}: readiness deadline exceeded; check its provider (not owned by this rig)`);
}
