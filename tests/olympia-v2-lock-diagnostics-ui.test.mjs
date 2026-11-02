import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA V2 read-only candidate lock UI',()=>{
 it('offers diagnostics on merged DEV PR cards',()=>{
  expect(html.indexOf('data-candidate-diagnostics')).toBeGreaterThan(html.indexOf('if(pr.merged_at)'));
  expect(html).toContain('Kontrollera kandidatlås');
 });
 it('requires Zeus and uses existing authenticated bridge',()=>{
  expect(js).toContain("event.target.closest('[data-candidate-diagnostics]')");
  expect(js).toContain("if(!verified)");
  expect(js).toContain("action:'auto_candidate_diagnostics'");
  expect(js).toContain('testedDevSha:sha');
 });
 it('reports read-only results and never publishes LIVE',()=>{
  expect(js).toContain('Ingen automatisk kandidat startad');
  expect(js).toContain('Låset behöver granskas');
  expect(js).toContain('Ingen ändring gjordes');
 });
});
