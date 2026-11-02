import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA LIVE mobile acceptance',()=>{
 it('renders tappable control regardless of async session verification',()=>{
  expect(html).toContain('data-live-prepare');
  expect(html).not.toContain("(!window.olympiaV2ZeusVerified?'disabled':'')");
  expect(html).toContain('touch-action:manipulation');
 });
 it('provides immediate feedback and blocks unauthenticated requests',()=>{
  expect(js).toContain('Tryck registrerat · kontrollerar LIVE-förberedelse');
  expect(js).toContain('Inget beslut har skickats');
  expect(js).toContain('if(!verified)');
  expect(js).toContain('Avbrutet. Inget beslut skickades.');
 });
});
