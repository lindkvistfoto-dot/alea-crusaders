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
  expect(js).not.toContain("decision:'final_approval'");
 });
 it('displays four intended decisions without wiring them prematurely',()=>{
  for(const name of ['Godkänn LIVE · Pandoras ask','Lägg i releasepaket','Omarbeta','Kasta'])expect(js).toContain(name);
 });
});
