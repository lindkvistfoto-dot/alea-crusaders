import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('Materialatelier redesign',()=>{
 it('loads new style after the existing styles and uses current cache version',()=>{
  const v=JSON.parse(read('package.json')).version,h=read('index.html'),lib=read('features/material/library.js');
  expect(h).toContain('material-polish.css?v='+v);
  expect(h).toContain('material/library.js?v='+v);
  for(const m of ['viewer.js','frodo-ui.js','player-folder-ui.js'])expect(lib).toContain(m+'?v='+v);
 });
 it('preserves material controls and adds gallery headings',()=>{
  const viewer=read('features/material/viewer.js');
  expect(viewer).toContain('legolasResults');
  expect(viewer).toContain('legolas-card-kind');
  expect(viewer).toContain('legolasGmQueue');
  expect(viewer).toContain('legolasGrid');
  expect(read('features/material/frodo-ui.js')).toContain('frodoStop');
 });
 it('supports mobile and reduced-motion presentation',()=>{
  const css=read('features/material/material-polish.css');
  expect(css).toContain('@media(max-width:720px)');
  expect(css).toContain('prefers-reduced-motion');
  expect(css).toContain('object-fit:cover');
 });
});
