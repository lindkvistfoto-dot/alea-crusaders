import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'');
const schema=readFileSync(new URL('../supabase/migrations/20261008_bilbo_archive_guard.sql',import.meta.url),'utf8');
const campaign='123e4567-e89b-42d3-a456-426614174000';
const material='123e4567-e89b-42d3-a456-426614174001';
const row={id:material,campaign_id:campaign,title:'Skelettbyn',description:'En by i dimma',category:'location',
 asset_kind:'document',storage_bucket:'campaign-materials',storage_path:campaign+'/'+material+'/brevet.pdf',
 mime_type:'application/pdf',file_size_bytes:3600,created_at:'2026-10-08T10:00:00Z',updated_at:'2026-10-08T12:00:00Z',archived_at:null};
function harness(overrides={}){
 const elems={
  bilboGrid:{innerHTML:'',classList:{toggle(){}}},
  bilboDetails:{innerHTML:'',querySelector:()=>null},
  bilboPrevious:{disabled:false},bilboNext:{disabled:false},
  bilboPageCount:{textContent:''},bilboNotice:{textContent:'',classList:{toggle(){}}}
 };
 const calls=[],storage={canManage:()=>true,read:async()=>new Blob(['abc']),categories:{
  location:'Platser',npc:'SLP',monster:'Monster',item:'Föremål',map:'Kartor',document:'Dokument',other:'Övrigt'}};
 const ctx={
  window:{gimliMaterialApi:storage,confirm:()=>true},
  createAragorn:()=>({html:()=>'',clear:()=>{},loadDetails:async()=>{},sync:async()=>{},setType:()=>{},searchTargets:()=>{},link:async()=>{},unlink:async()=>{}}),
  centralCampaignId:campaign,clearTimeout,setTimeout,
  URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL:()=>{}},
  document:{getElementById:id=>elems[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
  dbJson:async(path,options)=>{
   calls.push({path,options});
   return path.startsWith('campaign_materials?')&&options?.method!=='PATCH'?[row]:[{...row,updated_at:'2026-10-08T12:10:00Z'}]
  },
  escAttr:x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
  mapStorageFetch:async()=>({ok:true,blob:async()=>new Blob(['abc'])}),encodeStoragePath:String,
  Blob,console, ...overrides
 };
 runInNewContext(code+'\nthis.bilbo={state:bilboState,params:bilboRequestParams,card:bilboCardHtml,load:bilboLoadPage,save:bilboSaveMetadata,note:bilboSaveNote,archive:bilboToggleArchive,fetch:bilboFetchBlob,filter:bilboSetFilter,mount:bilboMountLibrary};',ctx);
 return {api:ctx.bilbo,ctx,calls,elems,storage}
}
describe('Bilbo – kampanjens materialbibliotek',()=>{
 it('söker och paginerar server-side med kampanjfilter',()=>{
  const {api}=harness();
  const initial=api.params();
  expect(initial).toContain('campaign_id=eq.'+campaign);
  expect(initial).toContain('archived_at=is.null');
  expect(initial).toContain('limit=25');
  api.state.category='npc';api.state.status='archived';api.state.page=2;api.state.search='Skelettbyn*),id.eq.annat';
  const url=api.params();
  expect(url).toContain('category=eq.npc');
  expect(url).toContain('archived_at=not.is.null');
  expect(url).toContain('offset=48');
  expect(url).not.toContain('id.eq.annat');
  expect(url).toContain('title.ilike.')
 });
 it('renderar säker text och arkivmarkering i miniatyrkort',()=>{
  const {api}=harness();
  expect(api.card({...row,title:'<img src=x onerror=alert(1)>'})).not.toContain('<img src=x onerror');
  expect(api.card({...row,archived_at:'2026-10-08T13:00:00Z'})).toContain('Arkiverad')
 });
 it('visar en paginerad materialsida och säkerställer att fler sidor finns',async()=>{
  const {api,ctx,calls,elems}=harness();
  const rows=Array.from({length:25},(_,n)=>({...row,id:'item-'+n,asset_kind:'document'}));
  ctx.dbJson=async path=>{calls.push({path});return rows};
  await api.load();
  expect(api.state.rows).toHaveLength(24);
  expect(api.state.hasNext).toBe(true);
  expect(elems.bilboGrid.innerHTML).toContain('Skelettbyn');
  expect(elems.bilboNext.disabled).toBe(false);
  expect(api.state.campaign).toBe(campaign)
 });
 it('redigerar endast metadata, med kampanjfilter och optimistic-lock',async()=>{
  const {api,ctx,calls,elems}=harness();
  api.state.rows=[{...row}];api.state.selected=row.id;
  elems.bilboMetadata={elements:{namedItem:k=>({value:{title:'Korpen',category:'npc',description:'En gammal bekant'}[k]})}};
  elems.bilboSaveButton={disabled:false};
  ctx.dbJson=async(path,options)=>{calls.push({path,options});return[{...row,title:'Korpen',category:'npc',updated_at:'2026-10-08T12:10:00Z'}]};
  await api.save({preventDefault(){}});
  const update=calls[0];
  expect(update.path).toContain('campaign_id=eq.'+campaign);
  expect(update.path).toContain('updated_at=eq.');
  expect(JSON.parse(update.options.body)).toMatchObject({title:'Korpen',category:'npc'});
  expect(JSON.parse(update.options.body)).not.toHaveProperty('storage_path');
 });
 it('sparar SL-anteckningar i separat, skyddad tabell',async()=>{
  const {api,ctx,calls,elems}=harness();
  api.state.rows=[{...row}];api.state.selected=row.id;
  elems.bilboGmNote={value:'Hemlig ledtråd'};
  elems.bilboNoteSave={disabled:false};
  ctx.dbJson=async(path,options)=>{calls.push({path,options});return[]};
  await api.note();
  expect(calls[0].path).toContain('campaign_material_gm_notes');
  expect(JSON.parse(calls[0].options.body).notes).toBe('Hemlig ledtråd');
  expect(calls[0].path).not.toContain('campaign_materials?')
 });
 it('spärrar åtkomst till material från annan kampanj samt en icke-SL',async()=>{
  const x=harness();
  await expect(x.api.fetch({...row,campaign_id:'another'},false)).rejects.toThrow(/tillgång/);
  x.storage.canManage=()=>false;
  await expect(x.api.fetch(row,false)).rejects.toThrow(/tillgång/);
  expect(x.calls).toHaveLength(0)
 });
 it('arkivering använder PATCH och behåller lagrade filer',async()=>{
  const {api,ctx,calls,elems}=harness();
  api.state.rows=[{...row}];api.state.selected=row.id;
  elems.bilboArchiveButton={disabled:false};
  ctx.dbJson=async(path,options)=>{calls.push({path,options});return options?.method==='PATCH'?[{id:row.id}]:[{...row,archived_at:'2026-10-08T13:00:00Z'}]};
  await api.archive();
  expect(calls[0].path).toContain('campaign_materials?');
  expect(calls[0].options.method).toBe('PATCH');
  expect(JSON.parse(calls[0].options.body).archived_at).toBeTruthy();
  expect(calls.some(c=>c.path.includes('/storage/'))).toBe(false)
 });
 it('databastriggern förhindrar arkivering av aktivt visad och delad bild',()=>{
  expect(schema).toContain('campaign_material_shares');
  expect(schema).toContain('s.revoked_at is null');
  expect(schema).toContain('campaign_material_presentations');
  expect(schema).toContain('before update of archived_at');
 })
});