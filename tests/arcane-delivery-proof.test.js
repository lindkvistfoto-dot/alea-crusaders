import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const css=read('features/character/arcane-delivery-proof-20261019.css');
describe('temporary ARCANE delivery signal — can prove HTML vs stylesheet freshness',()=>{
 it('has a uniquely visible red inlined signal scoped to the actual portrait',()=>{
  expect(html).toContain('id="arcane-red-html-delivery-proof-20261019"');
  expect(html).toContain('NY HTML • RÖD SIGNAL');
  expect(html).toContain('#view #grundPanel #portrait::before');
  expect(html).toContain('background:#ed0000!important');
 });
 it('loads a separately named stylesheet with a second yellow signal',()=>{
  expect(html).toContain('arcane-delivery-proof-20261019.css?v=red1810-1');
  expect(css).toContain('NY CSS • GUL SIGNAL');
  expect(css).toContain('.arcane-profile-nameplate::after');
  expect(css).toContain('background:#fff300!important');
  expect(css).toContain('body.character-glowup-active');
 });
 it('does not modify user data or existing live field rendering',()=>{
  expect(html).toContain('arcane-profile-component.js?v=20261019-8');
  expect(html).toContain('arcane-profile-component.css?v=20261019-8c');
  expect(css).not.toContain('setIdentity');
  expect(css).not.toContain('display:none');
 });
});