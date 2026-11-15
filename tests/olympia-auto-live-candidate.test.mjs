import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA safe automatic LIVE candidate staging',()=>{
 it('is DEV-only with emergency stop',()=>{
  expect(edge).toContain('Deno.env.get("OLYMPIA_AUTO_LIVE_CANDIDATE") === "disabled"');
  expect(edge).toContain("https://wkiuyklzzroavclnsxna.supabase.co");
  expect(edge).toContain('return { state: "disabled" }');
 });
 it('starts only after confirmed DEV merge and acceptance',()=>{
  expect(edge.indexOf('stage = "dev_acceptance_record"')).toBeLessThan(edge.indexOf('await autoPrepareLiveCandidate(token, data.pullRequestNumber'));
  expect(edge).toContain('if (acceptance && !acceptanceWarning)');
  expect(edge).toContain('verifyReleaseSources(token, item, testedDevSha)');
 });
 it('recovers safely for a previously merged DEV PR',()=>{
  expect(edge).toContain('data.action === "prepare_merged_dev_candidate"');
  expect(edge).toContain('const writeToken = await githubToken("prepare_merged_dev_candidate_write")');
  expect(edge).toContain('const token = await githubToken("pull_request_list")');
  expect(edge).toContain('recordDevAcceptance(writeToken, data.pullRequestNumber');
  expect(edge).toContain('verifyPublishedManifest("development", testedDevSha)');
  expect(edge).toContain('PR-CI är inte helt godkänd');
  expect(edge).toContain('recordDevAcceptance(token, data.pullRequestNumber');
  expect(edge).toContain('autoPrepareLiveCandidate(token, data.pullRequestNumber');
  expect(edge).toContain('laterChangesOverlapAcceptedPatch(token, item, changedSourceFiles)');
  expect(edge).toContain('Överlappande ändringar har ändrats efter DEV-mergen');
  expect(edge).toContain('LIVE är oförändrat.');
 });
 it('reuses existing candidate bridge and avoids LIVE publication',()=>{
  expect(edge).toContain('await startCandidateRequest(token, issue.number, item');
  expect(edge).toContain('body.includes("- Beslut: PANDORAS ASK")');
  expect(edge).toContain('DEV-merge lyckades, men LIVE-kandidaten kunde inte förberedas');
 });
});
