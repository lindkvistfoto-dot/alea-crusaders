import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const start=edge.indexOf('if (data.action === "auto_candidate_diagnostics")');
const end=edge.indexOf('if (data.action === "pull_request_list")',start);
const diagnostics=edge.slice(start,end);
describe('OLYMPIA automatic candidate read-only diagnostics',()=>{
 it('requires a valid PR and full SHA, under the existing Zeus auth gate',()=>{
  expect(start).toBeGreaterThan(edge.indexOf('user.email_confirmed_at'));
  expect(diagnostics).toContain('Number.isSafeInteger(data.pullRequestNumber)');
  expect(diagnostics).toContain('/^[a-f0-9]{40}$/i.test(data.testedDevSha)');
 });
 it('reads lock and paginated journal, but never mutates GitHub',()=>{
  expect(diagnostics).toContain('olympia/auto-candidates/pr-');
  expect(diagnostics).toContain('page <= 20');
  expect(diagnostics).toContain('requestPresent = true');
  expect(diagnostics).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
 });
 it('fails closed for incomplete history and stuck locks',()=>{
  expect(diagnostics).toContain('state: "unknown"');
  expect(diagnostics).toContain('"needs_review"');
  expect(diagnostics).toContain('Ingen återställning tillåten');
 });
 it('uses only read permissions and never calls final approval',()=>{
  expect(edge).toContain('decision === "candidate_check" || decision === "auto_candidate_diagnostics"');
  expect(diagnostics).not.toContain('final_approval');
  expect(diagnostics).toContain('code.startsWith("GITHUB_RATE_LIMITED_")');
 });
});
