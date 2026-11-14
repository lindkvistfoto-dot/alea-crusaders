import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const code=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA merged DEV PR recovery',()=>{
 it('uses merged_at from GitHub list response instead of absent merged boolean',()=>{
  expect(code).toContain('Boolean(pr.merged_at) && pr.base?.ref === "development"');
  const start=code.indexOf('if (data.action === "pull_request_list")');
  const end=code.indexOf('if (data.action === "current_refs")',start);
  expect(code.slice(start,end)).not.toContain('pr.merged === true && pr.base?.ref === "development"');
 });
 it('preserves open and merged PRs and sorts by updated activity',()=>{
  expect(code).toContain('for (const pr of [...open, ...closed])');
  expect(code).toContain('Date.parse(b.updated_at || "") - Date.parse(a.updated_at || "")');
 });
});
