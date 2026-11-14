import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA DEV CI validation',()=>{
 it('reads exact-SHA CI from the public API and keeps the App token for authorized writes',()=>{
  const start=edge.indexOf('if (data.action === "approve_and_merge_dev")');
  const end=edge.indexOf('stage = "github_merge"',start);
  const section=edge.slice(start,end);
  expect(section).toContain('readCi(path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
  expect(section).toContain('readCi(path + "/commits/" + data.pullRequestHeadSha + "/status")');
  expect(section).toContain('ghPublic(endpoint)');
  expect(section).toContain('GITHUB_PUBLIC_REQUEST_FAILED_(?:NETWORK|502|503|504)');
  expect(section).toContain('attempt < 3');
  expect(section).toContain('assessCi(checks, status, data.pullRequestHeadSha)');
  expect(edge).toContain('? { pull_requests: "write", issues: "write", contents: "write" }');
  expect(edge).not.toContain('checks: "read", statuses: "read"');

 });
 it('rechecks the exact PR head immediately before asking Zeus to approve',()=>{
  const approval=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
  const preflight=approval.indexOf("action:'pull_request_status'");
  const confirm=approval.indexOf("confirm('Godkänn PR #",preflight);
  const merge=approval.indexOf("action:'approve_and_merge_dev'",confirm);
  expect(preflight).toBeGreaterThan(-1);
  expect(confirm).toBeGreaterThan(preflight);
  expect(merge).toBeGreaterThan(confirm);
  expect(approval).toContain("assessment.state!=='success'");
  expect(approval).toContain('window.olympiaV2RefreshPrStatus?.(number,sha)');
  expect(approval).toContain("latest.pullRequest?.baseRef!=='development'");
  expect(approval).toContain('latest.pullRequest?.headSha!==sha');
 });
});
