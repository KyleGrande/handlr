/** Starter data model. Bind stable Herdr identities before implementing storage or UI. */
export interface ContextTarget {
  kind: 'space' | 'agent';
  /** Durable context binding identity, not a display name, PID or reusable terminal address. */
  id: string;
  /** Null denotes this computer; remote targets need their machine identity. */
  machine: string | null;
}

export interface ContextRecord {
  schema_version: 1;
  target: ContextTarget;
  tags: string[];
  notes: string;
  instructions: string;
  handoff: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
