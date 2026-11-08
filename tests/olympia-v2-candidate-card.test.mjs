import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA candidate attached to original PR',()=>{
 it('uses each PR merge SHA rather than the latest development SHA',()=>{
  expect(html).toContain('data-merge-sha=');
  expect(html).toContain('p.liveCandidateActive');
  expect(js).toContain('sha=node.dataset.mergeSha');
  expect(js).not.toContain('const sha=await currentDevSha();');
 });
 it('verifies release readiness on server before presenting candidate',()=>{
  expect(edge).toContain('candidate = await inspectCandidate(token, item, issue.number, sha)');
  expect(js).toContain('candidate?.ready===true');
  expect(js).toContain('candidate.releasePr');
  expect(js).toContain('candidate.releaseUrl');
 });
 it('revalidates the mutable release PR HEAD and binds approval to the exact SHA',()=>{
  expect(edge).toContain('const reportTreeMatch = body.match(/- Candidate tree SHA: ([0-9a-f]{40})/i)');
  expect(edge).toContain('currentTreeSha !== data.candidateTreeSha');
  expect(edge).toContain('pr.head.sha !== data.releasePrSha');
  expect(edge).toContain('verifiedCandidatePreview(token, verified.pr.head.sha)');
  expect(edge).toContain('const requiredChecks = [/^check$/i, /^guard$/i, /^preview$/i]');
  expect(edge).toContain('releaseBeforeMerge.head?.sha !== data.releasePrSha');
  expect(edge).toContain('body: JSON.stringify({ sha: data.releasePrSha, merge_method: "squash" })');
  expect(js).toContain('releasePrSha:candidate.releasePrSha');
  expect(js).toContain('setInterval(()=>{if(!document.hidden&&verified)window.olympiaV2CheckCandidateStatuses?.()},180000)');
  expect(js).toContain('candidateCacheUntil.get(requestKey)');
  expect(js).toContain('Math.min(2,targets.length)');
 });
 it('exposes approval only for verified candidates',()=>{
  expect(js).toContain('LIVE-beslut är låsta.');
  expect(js).toContain('Number.isInteger(number)&&number>0&&Number.isInteger(candidate.releasePr)&&candidate.releasePr>0');
  expect(js).toContain('approve.disabled=!candidateReady');
  expect(js).toContain("decision:'final_approval',itemId:'PR-'+number");
  expect(html).not.toContain('data-live-accept');
 });
});
