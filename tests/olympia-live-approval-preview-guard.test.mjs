import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA LIVE approval preview gate',()=>{
 it('verifies the exact release PR head SHA before creating approval or merging',()=>{
  const start=edge.indexOf('if (data.decision === "final_approval") {');
  const block=edge.slice(start);
  const gate=block.indexOf('const previewUrl = await verifiedCandidatePreview(token, candidate.pr.head.sha)');
  const issue=block.indexOf('const approvalIssue = await gh(');
  const merge=block.indexOf('merge_method: "squash"');
  expect(start).toBeGreaterThan(0);
  expect(gate).toBeGreaterThan(0);
  expect(issue).toBeGreaterThan(gate);
  expect(merge).toBeGreaterThan(issue);
  expect(block).toContain('if (!previewUrl) return fail(');
 });
});
