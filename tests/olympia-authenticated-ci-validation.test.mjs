import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA DEV CI validation',()=>{
 it('reads exact-SHA public CI through the existing authenticated App token without adding scopes',()=>{
  const start=edge.indexOf('if (data.action === "approve_and_merge_dev")');
  const end=edge.indexOf('stage = "github_merge"',start);
  const section=edge.slice(start,end);
  expect(section).toContain('ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
  expect(section).toContain('ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/status")');
  expect(section).not.toContain('ghPublic');
  expect(section).toContain('ghReadWithRetry(token');
  expect(section).toContain('assessCi(checks, status, data.pullRequestHeadSha)');
  const tokenStart=edge.indexOf('async function githubToken(');
  const tokenEnd=edge.indexOf('async function gh(',tokenStart);
  const tokenProfiles=edge.slice(tokenStart,tokenEnd);
  expect(tokenProfiles).toContain('? { pull_requests: "write", issues: "write", contents: "write" }');
  expect(tokenProfiles).not.toContain('checks: "read"');
  expect(tokenProfiles).not.toContain('statuses: "read"');

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
