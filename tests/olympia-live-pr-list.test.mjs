import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
describe('OLYMPIA LIVE PR visibility',()=>{
 it('lists DEV and LIVE PRs',()=>{
  expect(html).toContain("['development','main'].includes(p.base?.ref)");
  expect(html).toContain("p.base?.ref==='main'?'LIVE':'DEV'");
 });
 it('keeps LIVE PR cards read-only, before any DEV approval markup',()=>{
  const live=html.indexOf("if(pr.base?.ref==='main')return");
  const dev=html.indexOf("const details=await window.olympiaV2Request",live);
  expect(live).toBeGreaterThan(-1);
  expect(dev).toBeGreaterThan(live);
  expect(html.slice(live,dev)).not.toContain('data-dev-approve');
  expect(html.slice(live,dev)).toContain('Slutgodkännande sker endast via det verifierade LIVE-steget');
 });
});
