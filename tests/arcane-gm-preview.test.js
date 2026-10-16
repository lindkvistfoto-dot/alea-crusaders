import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {arcaneGmPreviewRows} from '../features/material/arcane-gm-preview.js';
const campaign='846e8089-24da-4825-af34-32903117152a';
const other='cc6b82ea-040e-4b15-9a84-f38311199999';
const image=(n,overrides={})=>({
 id:'123e4567-e89b-42d3-a456-'+String(426614174000+n),
 campaign_id:campaign,title:'Skelettbyn '+n,
 asset_kind:'image',storage_bucket:'campaign-materials',
 storage_path:campaign+'/'+n+'/picture.webp',...overrides
});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('Arcane Gallery — GM private staging',()=>{
 it('shows an active image followed by queued images without duplicates',()=>{
  const live=image(1),queue=[image(2),image(3)];
  expect(arcaneGmPreviewRows(queue,live,campaign).map(x=>x.id))
   .toEqual([live.id,...queue.map(x=>x.id)]);
  expect(arcaneGmPreviewRows([live,...queue],live,campaign)).toHaveLength(3);
 });
 it('does not show foreign, archived, document, public-bucket or traversed media',()=>{
  const good=image(1);
  expect(arcaneGmPreviewRows([good,
   image(2,{campaign_id:other}),
   image(3,{archived_at:'2026-10-16'}),
   image(4,{asset_kind:'document'}),
   image(5,{storage_bucket:'public'}),
   image(6,{storage_path:campaign+'/../private.png'}),
   image(7,{id:'not-a-uuid'})],null,campaign)).toEqual([good]);
  expect(arcaneGmPreviewRows([good],null,'not-a-campaign')).toEqual([]);
 });
 it('retains the original thumbnail and main-image private readers and never writes data',()=>{
  const source=read('features/material/arcane-gm-preview.js');
  const ui=read('features/material/frodo-ui.js');
  expect(source).toContain('legolas.readMedia(row,true)');
  expect(source).toContain('legolas.readMedia(row,false)');
  expect(source).toContain('win().URL.revokeObjectURL');
  expect(source).toContain('arcane-gallery-overlay.webp');
  expect(source).not.toContain('frodo_set_presentation');
  expect(source).not.toContain('/object/public/');
  expect(ui).toContain('gmGallery.sync(rows,stagedId,activeRow');
  expect(ui).toContain('gmGallery.mount()');
  expect(ui).toContain('stagedId=id;render();');
  expect(ui).toContain('const result=await frodo.show(row);');
 });
 it('hides the obsolete giant GM player-screen panel, keeps a compact add-to-queue action',()=>{
  const css=read('features/material/frodo-atelier.css');
  expect(css).toContain('.frodo-panel.frodo-is-gm .frodo-gm-preview{display:none!important}');
  expect(css).toContain('.arcane-gm-gallery:not(.hidden)');
  expect(css).toContain('.frodo-queue-add');
  expect(css).toContain('@media(max-width:720px)');
 });
});
