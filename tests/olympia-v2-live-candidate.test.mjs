import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA 2.0 LIVE candidate safety',()=>{
 it('shows automatic read-only status for merged DEV PR',()=>{
  expect(html).toContain('if(pr.merged_at)');
  expect(html).toContain('data-candidate-status');
  expect(html).not.toContain('data-live-accept');
  expect(html).not.toContain('data-live-pandora');
  expect(html).toContain('LIVE-publicering kräver separat verifiering');
 });
 it('uses authenticated read-only candidate status',()=>{
  expect(js).toContain("action:'auto_candidate_diagnostics'");
 });
 it('offers candidate rebuild only when LIVE baseline changed',()=>{
  expect(edge).toContain('reasonCode: code || "CANDIDATE_VERIFICATION_FAILED"');
  expect(js).toContain("candidate.reasonCode==='LIVE_BASELINE_CHANGED'");
  expect(js).toContain("decision:'pandoras_ask'");
  expect(js).toContain('Skapa ny LIVE-kandidat från aktuell LIVE');
  expect(js).toContain('Ingen ändring publiceras till LIVE.');
 });
 it('keeps final LIVE approval bound to a separate explicit action',()=>{
  expect(js).toContain("decision:'final_approval'");
  expect(js).toContain('LIVE-beslut är låsta.');
  expect(html).not.toContain('data-live-accept');
 });
 it('keeps SHA compact on mobile',()=>{
  expect(html).toContain('slice(0,12)');
  expect(html).toContain('overflow-wrap:anywhere');
 });
});
