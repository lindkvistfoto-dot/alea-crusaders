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
  expect(edge).toMatch(/decision === "resume_stale_candidate"\s*\?\s*\{[^}]*pull_requests: "read"/);
 });
 it('separates candidate write scopes from CI read scopes',()=>{
  expect(edge).toMatch(/decision === "prepare_merged_dev_candidate_write"\s*\?\s*\{[^}]*contents: "write"[^}]*issues: "write"[^}]*pull_requests: "read"/);
  expect(edge).toContain('const writeToken = await githubToken("prepare_merged_dev_candidate_write")');
  expect(edge).toContain('const token = await githubToken("pull_request_list")');
  expect(edge).not.toContain('const writeToken = await githubToken("approve_and_merge_dev")');
 });
});

describe('OLYMPIA release candidate source SHA resolution',()=>{
 it('uses the PR merge SHA only to verify the source PR',()=>{
  expect(edge).toContain('String(item.dev_sha || "").toLowerCase() !== sourceMergeSha');
 });
 it('resolves candidate locks and reports using the journaled DEV test SHA',()=>{
  expect(edge).toContain('const testedDevSha = entry.testedDevSha;');
  expect(edge).toContain('"olympia/auto-candidates/pr-" + number + "-" + testedDevSha');
  expect(edge).toContain('inspectCandidate(token, item, issue.number, testedDevSha)');
  expect(edge).toContain('testedDevSha,');
 });
});
