import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../features/inn/inn.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
describe('Innkeeper portrait does not become a blurry stretched banner',()=>{
 it('caps the portrait size on desktop and mobile',()=>{
  expect(css).toContain('grid-template-columns:minmax(0,320px) minmax(0,1fr)');
  expect(css).toContain('width:min(100%,320px)');
  expect(css).toContain('max-height:240px');
  expect(css).toContain('min-height:0');
  expect(css).toContain('@media(max-width:820px)');
 });
 it('cache-busts the inn CSS after release',()=>{
  expect(html).toContain('href="./features/inn/inn.css?v=0.35.02"');
 });
});
