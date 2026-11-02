import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const auto=edge.slice(edge.indexOf('async function autoPrepareLiveCandidate('),edge.indexOf('async function appBotLogin()'));
describe('OLYMPIA automatic candidate concurrency safeguards',()=>{
 it('remains off by default',()=>expect(auto).toContain('OLYMPIA_AUTO_LIVE_CANDIDATE'));
 it('uses a deterministic atomic ref per PR and SHA',()=>{
  expect(auto).toContain('"olympia/auto-candidates/pr-" + number + "-" + testedDevSha.toLowerCase()');
  expect(auto).toContain('"refs/heads/" + lockBranch');
  expect(auto).toContain('GITHUB_REQUEST_FAILED_422');
  expect(auto).toContain('state: "already_requested"');
 });
 it('never creates an issue after detecting existing lock',()=>{
  expect(auto.indexOf('await gh(token, lockPath)')).toBeLessThan(auto.indexOf('body: JSON.stringify({ title: title(item, "pandoras_ask")'));
  expect(auto).not.toContain('force: true');
 });
 it('fails closed if issue scan cannot be completed',()=>{
  expect(auto).toContain('AUTO_CANDIDATE_ISSUE_SCAN_INCOMPLETE');
  expect(auto).toContain('AUTO_CANDIDATE_ISSUE_LIST_INVALID');
 });
 it('does not publish LIVE',()=>expect(auto).not.toContain('final_approval'));
});
