import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('Presentationsateljén — GM mobile structure',()=>{
 it('loads the atelier stylesheet after existing material styles, with a fresh module version',()=>{
  const version=JSON.parse(read('package.json')).version;
  const html=read('index.html'),lib=read('features/material/library.js');
  expect(html).toContain('material-polish.css?v='+version);
  expect(html).toContain('frodo-atelier.css?v='+version);
  expect(html.indexOf('material-polish.css?v=')).toBeLessThan(html.indexOf('frodo-atelier.css?v='));
  expect(lib).toContain('frodo-ui.js?v='+version);
 });
 it('has a player preview, live status, staged image strip, and actual controls',()=>{
  const ui=read('features/material/frodo-ui.js');
  for(const id of ['frodoGmImage','frodoLiveStatus','frodoSceneName',
   'frodoQueueStrip','frodoShowQueue','frodoPrev','frodoNext','frodoStop']){
   expect(ui).toContain(id);
  }
  expect(ui).toContain('Presentationsateljén');
  expect(ui).toContain('Visa vald bild');
  expect(ui).toContain('data-frodo-id');
  expect(ui).toContain('aria-pressed');
  expect(ui).toContain('legolasSearch');
 });
 it('separates choosing a queued thumbnail from publishing for the players',()=>{
  const ui=read('features/material/frodo-ui.js');
  expect(ui).toContain('stagedId=tile.dataset.frodoId;render();');
  expect(ui).toContain('const result=await frodo.show(row);');
  expect(ui).toContain('await showRow(rows[next]);');
  expect(ui).toContain('frodoShowQueue');
  expect(ui).toContain('frodo.stop()');
 });
 it('fetches only private same-campaign thumbnails and revokes temporary URLs',()=>{
  const ui=read('features/material/frodo-ui.js');
  expect(ui).toContain('legolas.readMedia(row,true)');
  expect(ui).toContain('authenticated()');
  expect(ui).toContain('queueGeneration');
  expect(ui).toContain('revokeObjectURL(url)');
  expect(ui).toContain('clearQueueImages();queueSignature=');
  expect(ui).not.toContain('/storage/v1/object/public/');
 });

 it('removes only the redundant GM mobile archive hero and preserves a real close action',()=>{
  const ui=read('features/material/frodo-ui.js');
  const css=read('features/material/frodo-atelier.css');
  const viewer=read('features/material/viewer.js');
  expect(ui).toContain("el('legolasPanel')?.classList.toggle('legolas-atelier-gm',gm)");
  expect(ui).toContain('id="frodoCloseMobile"');
  expect(ui).toContain("el('frodoCloseMobile').addEventListener('click',()=>el('legolasClosePanel')?.click())");
  expect(viewer).toContain("el('legolasClosePanel').addEventListener('click',closePanel)");
  expect(css).toContain('#legolasPanel.legolas-atelier-gm > .legolas-panel-inner > .legolas-heading');
  expect(css).toContain('display:none!important;');
  expect(css).toContain('.frodo-close-mobile:focus-visible');
  expect(css).toContain('@media(max-width:720px)');
  expect(css).toContain('hyphens:none');
 });
 it('uses full-height bronze frame on GM mobile with an accessible overlay close action',()=>{
  const css=read('features/material/frodo-atelier.css');
  const gm=read('features/material/arcane-gm-preview.js');
  const ui=read('features/material/frodo-ui.js');
  expect(css).toContain('body:has(#legolasPanel.legolas-atelier-gm:not(.hidden)) > .alea-app-header');
  expect(css).toContain('.arcane-gm-gallery .arcane-gallery-machine');
  expect(css).toContain('height:calc(100dvh - 58px - env(safe-area-inset-bottom))');
  expect(css).toContain('border-image-slice:230 0 215 0 fill');
  expect(css).toContain('border-image-width:19.965cqw 0 18.663cqw 0');
  expect(css).toContain('.arcane-gm-gallery .arcane-gallery-picture');
  expect(css).toContain('.arcane-gm-gallery .arcane-gallery-belt');
  expect(css).toContain('.frodo-panel-heading,');
  expect(css).toContain('.arcane-gm-gallery .arcane-gallery-heading');
  expect(gm).toContain('id="arcaneGmClose"');
  expect(ui).toContain("onClose:()=>el('legolasClosePanel')?.click()");
 });
 it('mobile preview never crops original player image and is keyboard accessible',()=>{
  const css=read('features/material/frodo-atelier.css');
  expect(css).toContain('@media(max-width:720px)');
  expect(css).toContain('#legolasPanel .frodo-panel #frodoGmImage');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('focus-visible');
  expect(css).toContain('prefers-reduced-motion:reduce');
 });
});
