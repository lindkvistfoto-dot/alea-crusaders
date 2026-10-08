import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {LEGOLAS_PAGE_SIZE,LEGOLAS_BUCKETS,legolasQuery,legolasEscape,
 legolasClampScale,legolasPanLimit,createLegolas} from '../features/material/viewer.js';

const campaign='846e8089-24da-4825-af34-32903117152a';
const otherCampaign='cc6b82ea-040e-4b15-9a84-f38311199999';
const image={id:'123e4567-e89b-42d3-a456-426614174001',campaign_id:campaign,
 title:'Skelettbyns kyrka',description:'Ruiner',asset_kind:'image',category:'location',
 storage_bucket:'campaign-location-assets',storage_path:campaign+'/a/picture.webp'};
const docRow={...image,id:'123e4567-e89b-42d3-a456-426614174002',asset_kind:'document',
 storage_bucket:'campaign-materials',storage_path:campaign+'/a/schrift.pdf'};
function harness({gm=true,logged=true,other=false,rows=[]}={}){
 const notifications=[],requests=[],reads=[];
 const nodes={
  legolasNotice:{textContent:'',classList:{toggle(){}}},
  legolasGrid:{innerHTML:'',querySelectorAll:()=>[]},
  legolasPageNumber:{textContent:''},
  legolasPrevious:{disabled:false},legolasNext:{disabled:false},
  legolasGmQueue:{classList:{toggle(){}}},
  legolasQueueCount:{textContent:''},legolasQueueItems:{innerHTML:''},
  legolasPreviewQueue:{disabled:false},legolasClearQueue:{disabled:false}
 };
 const api=createLegolas({
  doc:()=>({getElementById:id=>nodes[id]||null}),
  win:()=>({URL:{revokeObjectURL(){},createObjectURL(){return 'blob:fake'}}}),
  getCampaign:()=>other?otherCampaign:campaign,
  isLoggedIn:()=>logged,isGM:()=>gm,
  query:async path=>{requests.push(path);return rows;},
  read:async(bucket,path)=>{reads.push({bucket,path});return new Blob(['private'])},
  onError:s=>notifications.push(s)
 });
 return {api,nodes,requests,reads,notifications};
}
describe('Legolas Greenleaf — private material panel and zoomable viewer',()=>{
 it('requests 24+1 campaign-scoped active rows, without private GM notes',()=>{
  const uri=legolasQuery(campaign,{page:2,category:'monster',search:'Eldsalamander'});
  expect(uri).toContain('campaign_id=eq.'+campaign);
  expect(uri).toContain('archived_at=is.null');
  expect(uri).toContain('limit='+(LEGOLAS_PAGE_SIZE+1));
  expect(uri).toContain('offset=48');
  expect(uri).toContain('category=eq.monster');
  expect(uri).toContain('title.ilike.');
  expect(uri).not.toContain('gm_notes');
  expect(uri).not.toContain('select=*');
 });
 it('removes PostgREST punctuation from searching, and prevents malformed campaigns',()=>{
  const uri=legolasQuery(campaign,{search:'ruin*),id.eq.attack'});
  expect(uri).not.toContain('id.eq.attack');
  expect(uri).not.toContain('*),');
  expect(()=>legolasQuery('',{})).toThrow('Ogiltig kampanj');
 });
 it('escapes titles and text before inserting markup',()=>{
  expect(legolasEscape('<img src=x onerror="a()">')).not.toContain('<img');
  expect(legolasEscape('A & B')).toContain('&amp;');
 });
 it('clamps zoom to 100–600 percent and pan to visible overflow',()=>{
  expect(legolasClampScale(-1)).toBe(1);
  expect(legolasClampScale(900)).toBe(6);
  expect(legolasClampScale(2.25)).toBe(2.25);
  expect(legolasPanLimit(1000,500,1)).toBe(0);
  expect(legolasPanLimit(1000,800,2)).toBe(300);
 });
 it('prevents player from staging images but allows SL to select multiple images',()=>{
  const h=harness();
  h.api.state.rows=[image,{...image,id:'123e4567-e89b-42d3-a456-426614174003'}];
  h.api.toggleSelection(image.id);
  h.api.toggleSelection(h.api.state.rows[1].id);
  expect(h.api.getStagedIds()).toHaveLength(2);
  h.api.toggleSelection(image.id);
  expect(h.api.getStagedIds()).toHaveLength(1);
  const p=harness({gm:false});p.api.state.rows=[image];p.api.toggleSelection(image.id);
  expect(p.api.getStagedIds()).toEqual([]);
 });
 it('only stages images, not text/PDF documents',()=>{
  const h=harness();
  h.api.state.rows=[docRow];
  h.api.toggleSelection(docRow.id);
  expect(h.api.getStagedIds()).toEqual([]);
 });
 it('rejects cross-campaign Storage references, unsafe paths and unknown buckets',async()=>{
  const h=harness();
  await expect(h.api.readMedia({...image,campaign_id:otherCampaign})).rejects.toThrow('kampanj');
  await expect(h.api.readMedia({...image,storage_bucket:'public'})).rejects.toThrow('kampanj');
  await expect(h.api.readMedia({...image,storage_path:otherCampaign+'/img.png'})).rejects.toThrow('filreferens');
  await expect(h.api.readMedia({...image,storage_path:campaign+'/../image.png'})).rejects.toThrow('filreferens');
  expect(h.reads).toHaveLength(0);
 });
 it('reads only approved private paths through injected authenticated Storage reader',async()=>{
  const h=harness();
  expect(LEGOLAS_BUCKETS.has('campaign-location-assets')).toBe(true);
  await h.api.readMedia(image);
  expect(h.reads).toEqual([{bucket:image.storage_bucket,path:image.storage_path}]);
 });
 it('loads only material metadata already RLS-visible; no material writes',async()=>{
  const h=harness({gm:false,rows:[docRow]});
  h.api.state.campaign=campaign;h.api.state.panelOpen=true;
  await h.api.loadPage();
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0]).toContain('campaign_id=eq.'+campaign);
  expect(h.api.state.rows).toHaveLength(1);
  expect(h.nodes.legolasGrid.innerHTML).not.toContain('data-legolas-pick');
  expect(h.nodes.legolasGrid.innerHTML).toContain('Skelettbyns kyrka');
  expect(h.requests.every(path=>path.startsWith('campaign_materials?'))).toBe(true);
 });
 it('clears queued material after logout/reset, with no database mutation',()=>{
  const h=harness();
  h.api.state.rows=[image];h.api.toggleSelection(image.id);
  expect(h.api.getStagedIds()).toHaveLength(1);
  h.api.reset();
  expect(h.api.getStagedIds()).toHaveLength(0);
  expect(h.api.state.rows).toEqual([]);
 });
 it('mounts a fullscreen modal, swipe/pinch handlers and logout wipe; never publishes shares',()=>{
  const js=readFileSync(new URL('../features/material/viewer.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../features/material/viewer.css',import.meta.url),'utf8');
  expect(js).toContain("nav.id='materialNavBtn'");
  expect(js).toContain("viewer.setAttribute('aria-modal','true')");
  expect(js).toContain("state.pointers.size>=2");
  expect(js).toContain('MutationObserver');
  expect(js).toContain('requestFullscreen');
  expect(js).toContain('getStagedIds');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('@media(max-width:720px)');
  expect(js).not.toContain('campaign_material_shares?');
  expect(js).not.toContain('campaign_material_presentations?');
 });
});
