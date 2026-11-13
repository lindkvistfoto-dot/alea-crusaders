import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA GitHub installation token permission compatibility',()=>{
 it('keeps candidate diagnostics on previously granted read permissions',()=>{
  expect(edge).toContain('decision === "auto_candidate_diagnostics"');
  expect(edge).toContain('? { contents: "read", issues: "read", pull_requests: "read" }');
  expect(edge).not.toContain('deployments: "read"');
 });
 it('keeps direct Cloudflare preview verification independent',()=>{
  expect(edge).toContain('CLOUDFLARE_API_TOKEN');
  expect(edge).toContain('verifiedCandidatePreview');
 });
 it('grants blocked-candidate recovery write access only where required',()=>{
  const recovery = edge.match(/decision === "resume_stale_candidate"\\s*\\?\\s*\\{([^}]+)\\}/);
  expect(recovery).not.toBeNull();
  expect(recovery[1]).toContain('contents: "write"');
  expect(recovery[1]).toContain('issues: "write"');
  expect(recovery[1]).toContain('pull_requests: "read"');
  expect(recovery[1]).not.toContain('pull_requests: "write"');
 });
});