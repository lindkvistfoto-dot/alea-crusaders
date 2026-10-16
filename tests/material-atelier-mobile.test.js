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
 it('mobile preview never crops original player image and is keyboard accessible',()=>{
  const css=read('features/material/frodo-atelier.css');
  expect(css).toContain('@media(max-width:720px)');
  expect(css).toContain('#legolasPanel .frodo-panel #frodoGmImage');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('focus-visible');
  expect(css).toContain('prefers-reduced-motion:reduce');
 });
});
