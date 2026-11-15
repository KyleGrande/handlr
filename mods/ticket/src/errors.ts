import type { Issue } from './types.js';
export class TicketError extends Error {
  constructor(public code: string, message: string, public exit = 2, public details?: unknown) { super(message); }
}
export function connectionIssue(error: unknown): Issue {
  const e = error as {code?: string; message?: string; stderr?: string; killed?: boolean};
  const raw = `${e.message ?? ''} ${e.stderr ?? ''}`.toLowerCase();
  // Only fixed diagnostics cross the boundary; provider stderr can contain secrets and private content.
  if (e.code === 'ENOENT') return {code:'tool_missing',message:'Provider CLI is not installed.',hint:'Install and connect the CLI in your own terminal.'};
  if (e.killed || raw.includes('timeout') || e.code === 'ABORT_ERR') return {code:'timeout',message:'Provider refresh exceeded its deadline.'};
  if (/rate limit|429/.test(raw)) return {code:'rate_limited',message:'Provider rate limit reached. Retry later.'};
  if (/login|auth|credential|401|403|permission|forbidden/.test(raw)) return {code:'connection_required',message:'Provider authentication or permission is required.',hint:'Check the provider CLI authentication in your terminal. Ticket reuses gh’s active account.'};
  if (/404|not found|could not resolve/.test(raw)) return {code:'unavailable',message:'The source is missing, private, or inaccessible.'};
  return {code:'provider_unavailable',message:'Provider read failed; cached data retains its original observation time.'};
}
