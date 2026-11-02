import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA safe automatic LIVE candidate staging',()=>{
 it('is disabled by default and requires explicit server flag',()=>{
  expect(edge).toContain('Deno.env.get("OLYMPIA_AUTO_LIVE_CANDIDATE") !== "enabled"');
  expect(edge).toContain('return { state: "disabled" }');
 });
 it('starts only after confirmed DEV merge and acceptance',()=>{
  expect(edge.indexOf('stage = "dev_acceptance_record"')).toBeLessThan(edge.indexOf('await autoPrepareLiveCandidate(token, data.pullRequestNumber'));
  expect(edge).toContain('if (acceptance && !acceptanceWarning)');
  expect(edge).toContain('verifyReleaseSources(token, item, testedDevSha)');
 });
 it('reuses existing candidate bridge and avoids LIVE publication',()=>{
  expect(edge).toContain('await startCandidateRequest(token, issue.number, item');
  expect(edge).toContain('body.includes("- Beslut: PANDORAS ASK")');
  expect(edge).toContain('DEV-merge lyckades, men LIVE-kandidaten kunde inte förberedas');
 });
});
