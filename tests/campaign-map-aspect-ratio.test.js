import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/map/triptych.css',import.meta.url),'utf8');
describe('Campaign map frame follows image dimensions',()=>{
 test('sets ratio from the active map and clears it when no map is active',()=>{
  expect(app).toContain("viewport?.style.setProperty('--campaign-map-aspect-ratio',w+' / '+h)");
  expect(app).toContain("viewport?.style.removeProperty('--campaign-map-aspect-ratio')");
 });
 test('desktop and mobile use the same intrinsic ratio instead of fixed viewport heights',()=>{
  expect(css).toContain('aspect-ratio: var(--campaign-map-aspect-ratio, 16 / 10)');
  expect(css).not.toContain('height: min(76vh, 830px)');
  expect(css).not.toContain('height: 68vh');
  expect(css).toContain('calc(76vh * var(--campaign-map-aspect-ratio-number, 1.6))');
  expect(css).toContain('calc(68vh * var(--campaign-map-aspect-ratio-number, 1.6))');
 });
});
