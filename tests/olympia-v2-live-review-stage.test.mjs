import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA LIVE review stage fail-closed',()=>{
 it('shows review only after server-verified candidate',()=>{
  expect(js.indexOf('candidate?.ready===true')).toBeLessThan(js.indexOf("heading.textContent='LIVE · Förhandsgranskning'"));
 });
 it('does not fabricate preview URL or allow premature publishing',()=>{
  expect(js).toContain("preview.disabled=true");
  expect(js).toContain("control.disabled=true");
  expect(js).toContain('versionsbunden förhandsvisning saknas ännu');
  expect(js).toContain('Number.isInteger(number)&&number>0&&Number.isInteger(candidate.releasePr)&&candidate.releasePr>0');
  expect(js).toContain('approve.disabled=!candidateReady');
  expect(js).toContain("decision:'final_approval',itemId:'PR-'+number");
  expect(js).not.toContain("decision:'final_approval',itemId:'PR-524'");
 });
 it('enables LIVE approval and leaves other decisions disabled',()=>{
  for(const name of ['Godkänn LIVE','Lägg i releasepaket','Omarbeta','Kasta'])expect(js).toContain(name);
 });
});
