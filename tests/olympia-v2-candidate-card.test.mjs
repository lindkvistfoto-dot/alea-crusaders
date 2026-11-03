import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA candidate attached to original PR',()=>{
 it('uses each PR merge SHA rather than the latest development SHA',()=>{
  expect(html).toContain('data-merge-sha=');
  expect(js).toContain('sha=node.dataset.mergeSha');
  expect(js).not.toContain('const sha=await currentDevSha();');
 });
 it('verifies release readiness on server before presenting candidate',()=>{
  expect(edge).toContain('candidate = await inspectCandidate(token, item, issue.number, sha)');
  expect(js).toContain('candidate?.ready===true');
  expect(js).toContain('candidate.releasePr');
  expect(js).toContain('candidate.releaseUrl');
 });
 it('never exposes premature LIVE approval or unverified preview',()=>{
  expect(js).toContain('LIVE-beslut är låsta.');
  expect(js).not.toContain("decision:'final_approval'");
  expect(html).not.toContain('data-live-accept');
 });
});
