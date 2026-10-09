import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createLivePreview} from '../features/material/live-preview.js';
const campaign='846e8089-24da-4825-af34-32903117152a';
const a={id:'a',campaign_id:campaign,title:'Kyrkan',asset_kind:'image',
 storage_bucket:'campaign-location-assets',storage_path:campaign+'/kyrka.webp'};
const b={...a,id:'b',title:'Torget',storage_path:campaign+'/torget.webp'};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function harness(read=vi.fn(async()=>new Blob(['bild']))){
 let made=0;const revoked=[],updates=[];
 const preview=createLivePreview({read,makeUrl:vi.fn(()=> 'blob:private-'+(++made)),
  revokeUrl:url=>revoked.push(url),onChange:s=>updates.push(s)});
 return {preview,read,revoked,updates};
}
describe('Frodo — GM preview of currently shared material',()=>{
 it('loads the original image once, never just a thumbnail',async()=>{
  const h=harness();h.preview.set(a,campaign);await flush();
  expect(h.read).toHaveBeenCalledWith(a,false);
  expect(h.preview.getState()).toMatchObject({phase:'ready',url:'blob:private-1',title:'Kyrkan'});
  h.preview.set(a,campaign);await flush();expect(h.read).toHaveBeenCalledTimes(1);
 });
 it('revokes the old private blob on image switch and when presentation ends',async()=>{
  const h=harness();h.preview.set(a,campaign);await flush();
  h.preview.set(b,campaign);await flush();
  expect(h.revoked).toEqual(['blob:private-1']);
  expect(h.preview.getState().title).toBe('Torget');
  h.preview.set(null,campaign);
  expect(h.revoked).toEqual(['blob:private-1','blob:private-2']);
  expect(h.preview.getState().phase).toBe('empty');
 });
 it('ignores stale asynchronous results after changing images',async()=>{
  let doneA,doneB;
  const read=vi.fn(row=>new Promise(resolve=>{if(row.id==='a')doneA=resolve;else doneB=resolve;}));
  const h=harness(read);
  h.preview.set(a,campaign);h.preview.set(b,campaign);
  doneB(new Blob(['new']));await flush();
  doneA(new Blob(['old']));await flush();
  expect(h.preview.getState()).toMatchObject({phase:'ready',url:'blob:private-1',title:'Torget'});
  expect(h.revoked).toEqual([]);
 });
 it('invalidates an unfinished fetch when the view is cleared',async()=>{
  let resolve;const h=harness(vi.fn(()=>new Promise(r=>{resolve=r})));
  h.preview.set(a,campaign);h.preview.clear();
  resolve(new Blob(['stale']));await flush();
  expect(h.preview.getState()).toMatchObject({phase:'empty',url:''});
  expect(h.revoked).toEqual([]);
 });
 it('never fetches cross-campaign, non-image or invalid storage paths',async()=>{
  const h=harness();
  h.preview.set({...a,campaign_id:'other'},campaign);
  h.preview.set({...a,asset_kind:'document'},campaign);
  h.preview.set({...a,storage_path:'other/image.png'},campaign);
  await flush();expect(h.read).not.toHaveBeenCalled();
 });
 it('reports a failed private image read without leaving a previous URL',async()=>{
  const h=harness(vi.fn(async()=>{throw Error('Access denied')}));
  h.preview.set(a,campaign);await flush();
  expect(h.preview.getState()).toMatchObject({phase:'error',url:''});
 });
 it('mount code authorizes SL before selecting an active picture and offers full-size viewer',()=>{
  const ui=readFileSync(new URL('../features/material/frodo-ui.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../features/material/material-polish.css',import.meta.url),'utf8');
  expect(ui).toContain('gm&&authenticated()&&state.loaded');
  expect(ui).toContain("preview.set(activeRow?.asset_kind==='image'?activeRow:null,scope())");
  expect(ui).toContain("legolas.readMedia(row,thumbnail)");
  expect(ui).toContain('frodoGmOpenLarge');
  expect(ui).toContain('legolas.previewMaterial(row)');
  expect(css).toContain('object-fit:contain');
 });
});
