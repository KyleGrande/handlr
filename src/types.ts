/** Machine is a permanent Core ID, never its display name. */
export type ContextTarget =
  | { kind: 'space'; machine: string; id: string }
  | { kind: 'checkout' | 'folder'; machine: string; path: string }
  | { kind: 'agent'; machine: string; id: string };

export interface ContextContent {
  tags: string[];
  notes: string;
  instructions: string;
  handoff: string;
}

export interface ContextRecord extends ContextContent {
  schema_version: 1;
  target: ContextTarget;
  revision: number;
  created_at: string | null;
  updated_at: string | null;
}

export type ContextPatch = Partial<ContextContent>;
export type Request =
  | { op: 'open'; space: string; agent?: string; on?: string | null }
  | { op: 'resolve'; space?: string; on?: string | null }
  | { op: 'resolve-agent'; space: string; agent: string; on?: string | null }
  | { op: 'read'; target: ContextTarget; inherited?: ContextTarget }
  | { op: 'write'; target: ContextTarget; expected_revision: number; patch: ContextPatch }
  | { op: 'new-agent'; machine: string };
export interface AgentLifetime {
  machine: string;
  terminal: string;
  terminal_created_ms: number;
  process_pid: number;
  process_started_at: string;
}
export type Response<T = unknown> =
  | { schema_version: 1; ok: true; data: T }
  | { schema_version: 1; ok: false; error: { code: string; message: string; current_revision?: number } };
