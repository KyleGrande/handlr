import { execFile } from 'node:child_process';
export function execute(command: string, args: string[], timeout = 5000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => execFile(command, args, {
    cwd, timeout: Math.max(1, timeout), maxBuffer: 4 * 1024 * 1024, encoding:'utf8',
    env: {...process.env, GH_PROMPT_DISABLED:'1', GIT_TERMINAL_PROMPT:'0', GH_PAGER:'cat', PAGER:'cat'},
  }, (error, stdout, stderr) => error ? reject(Object.assign(error, {stderr})) : resolve(stdout)));
}
