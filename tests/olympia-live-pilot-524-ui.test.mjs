import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const ui=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA generic verified LIVE approval',()=>{
 it('enables a candidate only with verified PR, issue, SHAs and preview',()=>{
  expect(ui).toContain('Number.isInteger(number)&&number>0&&Number.isInteger(candidate.releasePr)&&candidate.releasePr>0');
  expect(ui).toContain('result.issue?.number>0');
  expect(ui).toContain('candidate.candidateTreeSha');
  expect(ui).toContain('candidate.releasePrSha');
  expect(ui).toContain('Boolean(candidate.previewUrl)');
  expect(ui).toContain('approve.disabled=!candidateReady');
  expect(ui).not.toContain('number===524&&candidate.releasePr===528');
 });
 it('confirms the actual candidate and sends the matching OLYMPIA item ID',()=>{
  expect(ui).toContain("button.dataset.candidateDecision");
  expect(ui).toContain("Godkänn LIVE-kandidat för PR #'+number+'?");
  expect(ui).toContain("decision:'final_approval',itemId:'PR-'+number");
  expect(ui).toContain('candidateIssue:result.issue.number');
  expect(ui).toContain('testedDevSha:result.testedDevSha');
  expect(ui).toContain('candidateTreeSha:candidate.candidateTreeSha');
  expect(edge).toContain('const previewUrl = await verifiedCandidatePreview(token, candidate.pr.head.sha)');
 });
 it('keeps other LIVE decisions disabled and blocks blind retry',()=>{
  expect(ui).toContain("for(const label of ['Lägg i releasepaket','Omarbeta','Kasta'])");
  expect(ui).toContain('control.disabled=true');
  expect(ui).toContain("approve.disabled=!candidateReady");
  expect(ui).toContain('button.disabled=true');
  expect(ui).toContain('Timeout – kontrollera status innan nytt försök');
 });
});
