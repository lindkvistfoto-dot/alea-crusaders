import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const ui=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA pilot #524 LIVE approval',()=>{
 it('enables only verified pilot #524 and release #528',()=>{
  expect(ui).toContain('number===524&&candidate.releasePr===528');
  expect(ui).toContain('candidate.candidateTreeSha');
  expect(ui).toContain('candidate.releasePrSha');
  expect(ui).toContain('Boolean(candidate.previewUrl)');
  expect(ui).toContain('approve.disabled=!pilotReady');
 });
 it('requires explicit user confirmation and sends final approval to server',()=>{
  expect(ui).toContain("confirm('Godkänn LIVE-kandidat #528");
  expect(ui).toContain("decision:'final_approval',itemId:'PR-524'");
  expect(ui).toContain('candidateIssue:result.issue.number');
  expect(ui).toContain('candidateTreeSha:candidate.candidateTreeSha');
  expect(edge).toContain('const previewUrl = await verifiedCandidatePreview(token, candidate.pr.head.sha)');
 });
 it('keeps all other LIVE decisions disabled and blocks blind retry',()=>{
  expect(ui).toContain("for(const label of ['Lägg i releasepaket','Omarbeta','Kasta'])");
  expect(ui).toContain('control.disabled=true');
  expect(ui).toContain('approve.disabled=true');
  expect(ui).toContain('Timeout – kontrollera status innan nytt försök');
 });
});
