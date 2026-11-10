import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RigError, type Terminal } from './types.js';

export interface CoreAPI { terminals(): Promise<Terminal[]>; start(argv: string[], cwd: string, env: Record<string,string>, labels: Record<string,string>): Promise<Terminal>; stop(address: string): Promise<void>; read(address: string): Promise<string> }
export class Core implements CoreAPI {
  call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env }; delete env.HC_TERMINAL_ID;
      const child = spawn('hc', ['connect'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let done = false;
      const timer = setTimeout(() => finish(new RigError('Core request timed out; reconcile before retrying')), 25000);
      const finish = (error?: Error, value?: T) => {
        if (done) return; done = true; clearTimeout(timer); child.kill();
        if (error) reject(error); else resolve(value as T);
      };
      child.on('error', () => finish(new RigError('Core unavailable; check hc server status')));
      child.on('exit', () => finish(new RigError('Core connection ended; check hc server status')));
      child.stderr.resume();
      createInterface({ input: child.stdout }).on('line', line => {
        try {
          const reply = JSON.parse(line);
          if (reply.id !== 1) return;
          if (reply.error) finish(new RigError(`Core: ${reply.error.data?.kind ?? 'request failed'}`));
          else finish(undefined, reply.result);
        } catch { finish(new RigError('Invalid Core response')); }
      });
      // Keep stdin open until the response. No shell, secrets only in stdin.
      child.stdin.on('error', () => finish(new RigError('Core input unavailable')));
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n');
    });
  }
  async terminals() { return (await this.call<{terminals: Terminal[]}>('terminal.list', { all: true })).terminals.filter(t => !t.address.includes('/')); }
  async start(argv: string[], cwd: string, env: Record<string,string>, labels: Record<string,string>) {
    return (await this.call<Terminal>('terminal.run', { argv, cwd, env: { PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH ?? '/usr/bin:/bin'), ...env }, labels, no_parent: true, no_notify: true, outlive_parent: true, keep: false, wait: false }));
  }
  async stop(terminal: string) { await this.call('terminal.kill', { terminal }); }
  async read(terminal: string) { return (await this.call<{text: string}>('terminal.read', { terminal, lines: 80 })).text; }
}
