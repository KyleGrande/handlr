export type Kind = 'task' | 'pr' | 'link';
export interface Issue { code: string; message: string; hint?: string }
export interface Checkout {
  id: string; machine_id: string; repository_id: string; path: string; git_dir: string;
  fingerprint: string; branch: string; verified_at: string;
}
export interface Mapping { id: string; name: string; checkout_id: string }
export interface Ticket {
  id: string; name: string; archived: boolean; mappings: Mapping[]; item_ids: string[];
  created_at: string; updated_at: string;
}
export interface Item {
  id: string; kind: Kind; provider: 'github' | 'jira' | 'url'; host: string;
  remote_id?: string; repository_id?: string; repository_locator?: string; url: string; title: string; key?: string;
}
export interface Edge {
  id: string; ticket_id: string; from: string; to: string;
  relation: 'task_pr' | 'task_checkout' | 'pr_checkout' | 'related';
  origin: 'manual' | 'discovered'; confirmed: boolean; evidence: string; created_at: string;
}
export interface Check { name: string; state: string; url: string | null }
export interface Review { state: string; commit: string | null; url: string | null }
export interface Thread { resolved: boolean; path: string; line: number | null; url: string | null }
export interface Observation {
  item_id: string; source: string; observed_at: string | null; attempted_at: string | null;
  error: Issue | null; head_sha?: string; data: {
    title?: string; state?: string; native_status?: string; head_sha?: string;
    checks?: Check[]; reviews?: Review[]; review_decision?: string;
    threads?: Thread[]; unresolved_threads?: number; mergeable?: string;
  }; omitted: string[];
}
export interface Connection { provider: 'github' | 'jira'; host: string; account: string; projects: string[] }
export interface Store {
  schema_version: 1; revision: number; tickets: Ticket[]; checkouts: Checkout[];
  items: Item[]; edges: Edge[]; watches: string[]; observations: Observation[];
  connections: Connection[];
}
export type Freshness = 'fresh' | 'stale' | 'unknown' | 'unavailable';
export interface SourceView extends Observation { freshness: Freshness }
export interface ContextItem extends Item { sources: SourceView[] }
export interface Context {
  ticket: Ticket; revision: number; generated_at: string;
  mappings: (Mapping & {checkout: Checkout; availability: 'verified' | 'unavailable'; identity_issue: Issue | null})[];
  tasks: ContextItem[]; prs: ContextItem[]; links: ContextItem[]; associations: Edge[];
  watches: string[]; connections: Connection[]; completeness: 'complete' | 'partial';
  omitted: string[]; freshness_policy: { max_age_seconds: number; current_head_required: boolean };
}
