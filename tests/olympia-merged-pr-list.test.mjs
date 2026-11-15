import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const code=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const list=code.slice(code.indexOf('if (data.action === "pull_request_list")'),code.indexOf('if (data.action === "pull_request_history")'));
const history=code.slice(code.indexOf('if (data.action === "pull_request_history")'),code.indexOf('if (data.action === "current_refs")'));
describe('OLYMPIA active-first PR list and lazy history',()=>{
 it('normal listing contains paginated open PRs and targeted LIVE parents only',()=>{
  expect(list).toContain('/pulls?state=open&per_page=100&page=');
  expect(list).not.toContain('/pulls?state=closed');
  expect(list).not.toContain('/pulls?state=all');
  expect(list).toContain('activeCandidatePrs');
  expect(list).toContain('repoPath + "/pulls/" + number');
 });
 it('keeps closed PR reads inside the separately invoked history action',()=>{
  expect(history).toContain('/pulls?state=closed&per_page=50&page=');
  expect(history).toContain('/search/issues?');
  expect(page).toContain("historyPanel.addEventListener('toggle'");
  expect(page).toContain("action:'pull_request_history'");
  expect(page).not.toContain("action:'pull_request_list',includeClosed:true");
 });
 it('preserves updated ordering for active PRs and pages historical results',()=>{
  expect(list).toContain('Date.parse(b.updated_at || "") - Date.parse(a.updated_at || "")');
  expect(history).toContain('hasMore: page < 20 && page * 50 < Math.min(totalCount, 1000)');
 });
});
