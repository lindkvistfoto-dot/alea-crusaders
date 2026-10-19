import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
describe('finished ARCANE profile delivery',()=>{
 it('retires both temporary delivery overlays and their extra CSS layer',()=>{
  expect(html).not.toContain('arcane-red-html-delivery-proof-20261019');
  expect(html).not.toContain('NY HTML • RÖD SIGNAL');
  expect(html).not.toContain('arcane-delivery-proof-20261019.css');
  expect(existsSync(new URL('../features/character/arcane-delivery-proof-20261019.css',import.meta.url))).toBe(false);
 });
 it('cache busts the existing v8 component without changing its script',()=>{
  expect(html).toContain('arcane-profile-component.js?v=20261019-8');
  expect(html).toContain('arcane-profile-component.css?v=20261019-8d');
 });
});
