export interface RunRecord {
  token: string;
  started: number;
  terminal?: string;
  error?: string;
}
export interface RunState { version: 1; runs: Record<string, RunRecord> }
export interface TerminalRecord {
  address: string;
  state: string;
  exit_code?: number | null;
  labels?: Record<string, string>;
}
export type RunStatus = { kind: 'starting' | 'running' | 'passed' | 'failed' | 'unknown'; label: string };
export const runKey = (owner: string, tool: string) => JSON.stringify([owner, tool]);

export function findRunTerminal(record: RunRecord, terminals: TerminalRecord[]): TerminalRecord | undefined {
  return terminals.find(t => t.labels?.['toolbox.run'] === record.token);
}

export function runStatus(record: RunRecord, terminal?: TerminalRecord): RunStatus {
  if (record.error) return { kind: 'failed', label: record.error };
  if (!record.terminal && !terminal) return Date.now() - record.started < 30000
    ? { kind: 'starting', label: 'Starting…' }
    : { kind: 'unknown', label: 'Launch result unavailable' };
  if (!terminal) return { kind: 'unknown', label: 'Terminal unavailable' };
  const reported = terminal.labels?.['toolbox.exit'];
  const code = reported !== undefined && /^\d+$/.test(reported) ? Number(reported) : terminal.state === 'finished' ? terminal.exit_code : undefined;
  if (code !== null && code !== undefined) return code === 0
    ? { kind: 'passed', label: 'Passed · exit 0' }
    : { kind: 'failed', label: `Failed · exit ${code}` };
  if (terminal.state === 'live') return { kind: 'running', label: 'Running…' };
  return { kind: 'unknown', label: 'Stopped without an exit result' };
}

// The command runs in an inner shell so `exit` or `exec` cannot skip reporting.
// Pass it as an argv value, never interpolate it into the reporting shell.
export function runArgv(command: string): string[] {
  return ['sh', '-c', `sh -lc "$1"
_toolbox_status=$?
hc label "$HC_TERMINAL_ID" "toolbox.exit=$_toolbox_status" >/dev/null || printf '\\n[Toolbox could not report status]\\n'
printf '\\n[Toolbox exit %s]\\nPress Enter to close…' "$_toolbox_status"
read -r _toolbox_done
exit "$_toolbox_status"`, 'toolbox', command];
}

// Load the same user environment as an interactive terminal, then run the
// command through sh. Arguments stay separate from the profile loader code.
export function loginArgv(shell: string, command: string): string[] {
  const name = shell.split('/').pop();
  if (name === 'fish') return [shell, '-ilc', 'exec $argv', ...runArgv(command)];
  if (name === 'zsh' || name === 'bash') return [shell, '-ilc', 'exec "$@"', 'toolbox', ...runArgv(command)];
  return runArgv(command);
}
