import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createArcaneGallery} from '../features/material/arcane-gallery.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url));

function fakeNode(){
 const classes=new Set();
 return {dataset:{},innerHTML:'',textContent:'',src:'',clientWidth:100,clientHeight:100,
  classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),
   toggle:(s,on)=>on?classes.add(s):classes.delete(s),contains:s=>classes.has(s)},
  addEventListener(){},removeAttribute(s){delete this[s]},setAttribute(){},
  replaceChildren(){},querySelector(){return null},querySelectorAll(){return []},
  scrollTo(){},scrollIntoView(){}};
}
const campaign='846e8089-24da-4825-af34-32903117152a';
const other='cc6b82ea-040e-4b15-9a84-f38311199999';
const row={id:'123e4567-e89b-42d3-a456-426614174001',campaign_id:campaign,
 title:'Skelettbyns kyrka',description:'Ruiner',asset_kind:'image',category:'location',
 storage_bucket:'campaign-materials',storage_path:campaign+'/test/picture.webp'};
function harness({logged=true,gm=false,history=[],materials=[]}={}){
 const auth={logged,gm},reads=[],requests=[],revoked=[],nodes={};
 for(const id of ['arcaneGalleryCount','arcaneGalleryEmpty','arcaneGalleryStrip',
   'arcaneGalleryStatus','arcaneGalleryImage','arcaneGalleryPicture'])nodes[id]=fakeNode();
 const document={createElement:()=>fakeNode(),getElementById:id=>nodes[id]||null};
 let seq=0;
 const win={URL:{createObjectURL:()=>('blob:test-'+(++seq)),
   revokeObjectURL:u=>revoked.push(u)}};
 const gallery=createArcaneGallery({
  legolas:{readMedia:async(r,small)=>{reads.push({id:r.id,small});return new Blob(['private']);},
   previewMaterial:()=>{}},
  request:async path=>{
   requests.push(path);
   return path.startsWith('campaign_material_presentation_history?')?history:materials;
  },getCampaign:()=>campaign,isLoggedIn:()=>auth.logged,isGM:()=>auth.gm,
  doc:()=>document,win:()=>win
 });
 return {gallery,auth,reads,requests,revoked,nodes};
}
describe('Arcane Gallery release smoke',()=>{
 it('retains verified WebP and historical provenance without a GitHub original dependency',()=>{
  const m=JSON.parse(read('features/material/arcane-gallery-overlay.json').toString());
  const app=read(m.app_path);
  expect(m.source_sha256).toBe('180de8fde27bd0070903692ebb78ce813a03de9d49bc36ee65f6a462d9c45868');
  expect(m.source_path).toBe('assets/hermes/originals/ui/arcane-gallery-overlay/'+m.source_sha256+'.png');
  expect(existsSync(new URL('../'+m.source_path,import.meta.url))).toBe(false);
  expect(m.app_sha256).toBe('a56709bd59bd78508ff4609523deb8194fa8936e9b20ae5e2c96b828a75b92e0');
  expect(createHash('sha256').update(app).digest('hex')).toBe(m.app_sha256);
  expect(app.subarray(0,4).toString('ascii')).toBe('RIFF');
  expect(app.subarray(8,12).toString('ascii')).toBe('WEBP');
  expect([m.width,m.height]).toEqual([1152,768]);
  expect(m.alpha_preserved).toBe(true);
  expect(m.supabase_activation).toBe(false);
  expect(app.length).toBeLessThanOrEqual(300000);
 });
 it('uses the existing Frodo private image delivery and real gallery stylesheet',()=>{
  const code=read('features/material/arcane-gallery.js').toString();
  const frodo=read('features/material/frodo-ui.js').toString();
  const css=read('features/material/arcane-gallery.css').toString();
  const html=read('index.html').toString();
  expect(frodo).toContain('gallery.mount()');
  expect(frodo).toContain('gallery.sync(state.row,state.revision)');
  expect(frodo).toContain('if(changedPicture&&legolas.state.viewerOpen)');
  expect(frodo).toContain('legolas.closeViewer({restoreFocus:false})');
  expect(html).toContain('features/material/arcane-gallery.css');
  expect(code).toContain('arcane-gallery-overlay.webp');
  expect(code).toContain('legolas.readMedia(row,false)');
  expect(code).toContain('campaign_material_presentation_history?');
  expect(css).toContain('flex:0 0 20%');
  expect(css).toContain('touch-action:pan-x');
  const morph=read('features/material/arcane-morphing-frame.css').toString();
  const gear=read('features/material/arcane-morph-gear.svg').toString();
  const morphMarkup=read('features/material/arcane-morph-markup.js').toString();
  const gmPreview=read('features/material/arcane-gm-preview.js').toString();
  expect(code).toContain('arcaneMorphMarkup()');
  expect(gmPreview).toContain('arcaneMorphMarkup()');
  expect(morphMarkup).toContain('arcane-gallery-gear--left');
  expect(morphMarkup).toContain('arcane-gallery-piston--right');
  expect(css).toContain('arcane-morphing-frame.css');
  expect(morph).toContain('prefers-reduced-motion:reduce');
  expect(morph).toContain('transition:transform 460ms');
  expect(morph).toContain('arcane-gallery-piston-collar--bottom');
  expect(gear).toContain('<svg');
 });
 it('only reads RLS-visible image records within active campaign',async()=>{
  const h=harness({history:[{revision:2,material_id:row.id},
   {revision:1,material_id:'123e4567-e89b-42d3-a456-426614174002'}],
   materials:[row,{...row,id:'123e4567-e89b-42d3-a456-426614174002',campaign_id:other}]});
  h.gallery.sync(row,2);
  await h.gallery.refresh();
  await Promise.resolve();
  expect(h.gallery.state.rows.map(x=>x.id)).toEqual([row.id]);
  expect(h.requests.every(p=>p.includes('campaign_id=eq.'+campaign))).toBe(true);
  expect(h.requests.every(p=>p.startsWith('campaign_materials?')||p.startsWith('campaign_material_presentation_history?'))).toBe(true);
  expect(h.reads.every(r=>r.id===row.id)).toBe(true);
 });
 it('wipes a revoked or archived image instead of displaying the last cached private blob',async()=>{
  const history=[{revision:1,material_id:row.id}],materials=[row];
  const h=harness({history,materials});
  h.gallery.sync(row,1);
  await h.gallery.refresh();await Promise.resolve();
  expect(h.gallery.state.selected).toBe(row.id);
  history.splice(0);materials.splice(0);
  await h.gallery.refresh();
  expect(h.gallery.state.rows).toEqual([]);
  expect(h.gallery.state.selected).toBe('');
  expect(h.gallery.state.original).toBe('');
  expect(h.nodes.arcaneGalleryImage.classList.contains('hidden')).toBe(true);
 });
 it('keeps anonymous visitors out but lets GMs see the exact published history',async()=>{
  const h=harness({logged:false,history:[{revision:1,material_id:row.id}],materials:[row]});
  h.gallery.sync(row,1);
  expect(h.requests).toHaveLength(0);
  h.auth.logged=true;h.auth.gm=true;h.gallery.sync(row,2);
  await h.gallery.refresh();
  expect(h.requests.some(path=>path.startsWith('campaign_material_presentation_history?'))).toBe(true);
  expect(h.gallery.state.rows.map(x=>x.id)).toEqual([row.id]);
  expect(h.requests.every(path=>path.includes('campaign_id=eq.'+campaign))).toBe(true);
  h.auth.logged=false;h.gallery.sync(null,3);
  expect(h.gallery.state.rows).toEqual([]);
  expect(h.gallery.state.original).toBe('');
 });
});
