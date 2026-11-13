import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA DEV CI validation',()=>{
 it('uses the authorized GitHub App token for both status endpoints',()=>{
  const start=edge.indexOf('if (data.action === "approve_and_merge_dev")');
  const end=edge.indexOf('stage = "github_merge"',start);
  const section=edge.slice(start,end);
  expect(section).toContain('readCi(path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
  expect(section).toContain('readCi(path + "/commits/" + data.pullRequestHeadSha + "/status")');
  expect(section).not.toContain('ghPublic(');
  expect(section).toContain('GITHUB_REQUEST_FAILED_(502|503|504)');
  expect(section).toContain('attempt < 3');
  expect(section).toContain('assessCi(checks, status, data.pullRequestHeadSha)');
  expect(edge).toContain('contents: "write", checks: "read", statuses: "read"');

 });
});
