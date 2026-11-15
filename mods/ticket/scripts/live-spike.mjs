// Explicit read-only verification against a supplied PR. Private responses stay in memory.
import { emptyStore } from '../dist/src/store.js';
import { createTicket, addURL } from '../dist/src/model.js';
import { refreshItems } from '../dist/src/providers.js';
import { mergeRefresh, ticketContext } from '../dist/src/context.js';
const url=process.argv[2];if(!url)throw new Error('Pass an authorized GitHub PR URL.');
const s=emptyStore(),t=createTicket(s,'Live verification');addURL(s,t.id,url);
mergeRefresh(s,await refreshItems(s,s.items,20));
const c=await ticketContext(s,t.id);
console.log(JSON.stringify({schema_version:1,completeness:c.completeness,sources:c.prs[0].sources.map(o=>({source:o.source,freshness:o.freshness,error:o.error,omitted:o.omitted,head_verified:!!o.head_sha,checks:o.data.checks?.length,reviews:o.data.reviews?.length,threads:o.data.threads?.length}))},null,2));
if(c.prs[0].sources.some(o=>o.error))process.exitCode=1;
