import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const code=read('features/combat/spell-art.js');
const runtime=read('features/combat/runtime.js');
const admin=read('legacy/app.js');
const css=read('features/combat/spell-art.css');
const html=read('index.html');
const originalMigration=read('supabase/migrations/20261013001000_spell_master_art.sql');
const dualMigration=read('supabase/migrations/20261013012000_spell_dual_art_square_crop.sql');
const cutoutMigration=read('supabase/migrations/20261014000500_spell_cutout_art.sql');
const frameCss=read('features/combat/duel-frames.css');
const SPELL='11111111-1111-4111-8111-111111111111';
const FILE='22222222-2222-4222-8222-222222222222';
const SECOND='33333333-3333-4333-8333-333333333333';
const PATH='spell/'+SPELL+'/'+FILE+'.webp';
const NEXT='spell/'+SPELL+'/'+SECOND+'.webp';

function viewport(size=200){
 const handlers={};
 return {
  handlers,style:{},classList:{add:vi.fn(),remove:vi.fn()},
  getBoundingClientRect:()=>({width:size,height:size}),
  addEventListener:(name,listener)=>{handlers[name]=listener},
  setPointerCapture:vi.fn(),hasPointerCapture:()=>false
 }
}
function pane(kind,row){
 const values=kind==='icon'?{x:row.icon_focus_x,y:row.icon_focus_y,zoom:row.icon_zoom}:
   kind==='cutout'?{x:row.cutout_x,y:row.cutout_y,zoom:row.cutout_scale}:
   {x:row.effect_focus_x,y:row.effect_focus_y,zoom:row.effect_zoom};
 const elements={},outputs={},view=viewport();
 for(const key of ['x','y','zoom']){elements[key]={value:values[key]};outputs[key]={textContent:''}}
 const img={
  naturalWidth:400,naturalHeight:400,style:{},complete:true,isConnected:true,hidden:true,
  dataset:{spellArtPreview:PATH},tagName:'IMG'
 };
 return {
  dataset:{kind,spellId:row.id},image:img,view,elements,outputs,
  querySelector(selector){
   if(selector==='[data-spell-art-preview]')return img;
   if(selector==='.spell-art-viewport'||selector==='.spell-art-cutout-preview'||selector==='.spell-art-cutout-layer')return view;
   const input=selector.match(/^\[data-crop="([^"]+)"\]$/);
   if(input)return elements[input[1]];
   const output=selector.match(/^\[data-output="([^"]+)"\]$/);
   if(output)return outputs[output[1]];
   return null
  }
 }
}
function fixture(){
 const row={id:SPELL,name:'ELDKLOT',image_path:PATH,image_focus_x:72,image_focus_y:88,
  icon_path:PATH,icon_focus_x:50,icon_focus_y:50,icon_zoom:150,
  effect_image_path:PATH,effect_focus_x:75,effect_focus_y:20,effect_zoom:150,
  cutout_path:null,cutout_x:50,cutout_y:90,cutout_scale:160};
 const panes={icon:pane('icon',row),effect:pane('effect',row),cutout:pane('cutout',row)};
 const status={icon:{textContent:''},effect:{textContent:''},cutout:{textContent:''}};
 const host={innerHTML:''};
 const store=vi.fn(async()=>({ok:true,blob:async()=>({type:'image/webp',size:4096})}));
 const db=vi.fn(async()=>null);
 const dom={
  querySelector(query){
   for(const kind of ['icon','effect','cutout']){
    if(query==='.spell-art-pane[data-kind="'+kind+'"]')return panes[kind];
    if(query==='.spell-art-pane[data-kind="'+kind+'"] .spell-art-status')return status[kind];
   }
   return null;
  },
  querySelectorAll:()=>[],
  getElementById:id=>id==='spellArtEditor'?host:null,
  createElement:()=>({
   getContext:()=>({drawImage:vi.fn()}),
   toBlob:callback=>callback({type:'image/webp',size:2048})
  })
 };
 const ctx={
  window:{addEventListener:vi.fn()},document:dom,console,
  ruleSpells:[row],activeUser:()=>({admin:true}),
  dbJson:db,mapStorageFetch:store,
  URL:{createObjectURL:()=> 'blob:spell-art',revokeObjectURL:vi.fn()},
  Image:class{
   naturalWidth=600;naturalHeight=600;
   set src(url){Promise.resolve().then(()=>this.onload?.())}
  },
  crypto:{randomUUID:()=>SECOND},
  confirm:()=>true,renderAdminSpells:vi.fn()
 };
 runInNewContext(code,ctx);
 return {ctx,row,panes,status,host,store,db};
}
describe('Tre oberoende besvärjelsebilder',()=>{
 it('migrates old image into icon and effect without destroying historical source',()=>{
  expect(originalMigration).toContain('alea-spell-art');
  expect(dualMigration).toContain('add column if not exists icon_path');
  expect(dualMigration).toContain('add column if not exists effect_image_path');
  expect(dualMigration).toContain('icon_zoom');
  expect(dualMigration).toContain('effect_zoom');
  expect(dualMigration).toContain('icon_path = coalesce(icon_path, image_path)');
  expect(dualMigration).toContain('effect_image_path = coalesce(effect_image_path, image_path)');
  expect(dualMigration).not.toMatch(/\bdrop column\b/i);
 });
 it('adds nullable cutout columns without copying square images',()=>{
  expect(cutoutMigration).toContain('add column if not exists cutout_path');
  expect(cutoutMigration).toContain('cutout_scale');
  expect(cutoutMigration).toContain('cutout_y between 0 and 100');
  expect(cutoutMigration).not.toContain('set cutout_path =');
 });
 it('accepts only private immutable WebP paths',()=>{
  const {ctx}=fixture();
  expect(ctx.window.aleaSpellArt.validPath(PATH)).toBe(true);
  for(const bad of ['https://example.com/pic.webp','../secret',
   'spell/'+SPELL+'/../../secrets.webp','spell/'+SPELL+'/'+FILE+'.png','round/'+FILE+'.webp'])
   expect(ctx.window.aleaSpellArt.validPath(bad)).toBe(false);
 });
 it('provides three independent editors with a transparent cutout preview',()=>{
  const {ctx,row}=fixture();
  const markup=ctx.window.aleaSpellArt.editorHtml(row);
  expect(markup).toContain('Besvärjelseikon');
  expect(markup).toContain('Effektbild · magiruta');
  expect(markup).toContain('Besvärjelse-cutout');
  expect((markup.match(/class="spell-art-viewport"/g)||[])).toHaveLength(2);
  expect((markup.match(/class="spell-art-cutout-preview"/g)||[])).toHaveLength(1);
  expect((markup.match(/data-crop="zoom"/g)||[])).toHaveLength(3);
  expect(markup).toContain("aleaSpellArt.upload(event,'"+SPELL+"','icon')");
  expect(markup).toContain("aleaSpellArt.upload(event,'"+SPELL+"','effect')");
  expect(markup).toContain("aleaSpellArt.upload(event,'"+SPELL+"','cutout')");
  expect(markup).toContain("aleaSpellArt.saveFocus('"+SPELL+"','icon')");
  expect(markup).toContain("aleaSpellArt.saveFocus('"+SPELL+"','effect')");
  expect(markup).toContain("aleaSpellArt.saveFocus('"+SPELL+"','cutout')");
  expect(css).toContain('aspect-ratio:1/1');
  expect(css).toContain('touch-action:none');
  expect(ctx.window.aleaSpellArt.editorHtml(null)).toContain('Spara den nya besvärjelsen först');
 });
 it('drags a square image with pointer events and updates X/Y sliders',async()=>{
  const {ctx,panes}=fixture();
  await ctx.window.aleaSpellArt.hydrateEditor();
  const {view,image,elements}=panes.icon;
  expect(view.handlers.pointerdown).toBeTypeOf('function');
  const makeEvent=(x,y)=>({pointerId:9,pointerType:'mouse',button:0,clientX:x,clientY:y,preventDefault:vi.fn()});
  view.handlers.pointerdown(makeEvent(100,100));
  view.handlers.pointermove(makeEvent(80,110));
  expect(Number(elements.x.value)).toBe(70);
  expect(Number(elements.y.value)).toBe(40);
  expect(image.style.left).toBe('-70px');
  expect(image.style.top).toBe('-40px');
  view.handlers.pointerup(makeEvent(80,110));
  expect(view.classList.remove).toHaveBeenCalledWith('is-dragging');
 });
 it('persists effect and icon crop separately with zoom',async()=>{
  const {ctx,row,panes,db}=fixture();
  panes.effect.elements.x.value='95';
  panes.effect.elements.y.value='30';
  panes.effect.elements.zoom.value='180';
  await ctx.window.aleaSpellArt.saveFocus(SPELL,'effect');
  expect(JSON.parse(db.mock.calls[0][1].body)).toEqual({
   effect_focus_x:95,effect_focus_y:30,effect_zoom:180
  });
  expect(row.icon_focus_x).toBe(50);
  expect(row.icon_zoom).toBe(150);
  panes.icon.elements.x.value='12';
  await ctx.window.aleaSpellArt.saveFocus(SPELL,'icon');
  expect(JSON.parse(db.mock.calls[1][1].body)).toEqual({
   icon_focus_x:12,icon_focus_y:50,icon_zoom:150
  });
 });
 it('supports transparent cutout positioning independently of square crops',async()=>{
  const {ctx,row,panes,db}=fixture();
  expect(ctx.window.aleaSpellArt.artFor(row,'cutout').path).toBe('');
  const view=viewport(200),img={naturalWidth:400,naturalHeight:200,style:{}};
  ctx.window.aleaSpellArt.positionCutout(img,view,{x:60,y:90,zoom:150});
  expect(img.style.width).toBe('300px');
  expect(img.style.height).toBe('150px');
  expect(img.style.left).toBe('-30px');
  expect(img.style.top).toBe('30px');
  panes.cutout.elements.x.value='68';
  panes.cutout.elements.y.value='82';
  panes.cutout.elements.zoom.value='175';
  await ctx.window.aleaSpellArt.saveFocus(SPELL,'cutout');
  expect(JSON.parse(db.mock.calls[0][1].body)).toEqual({cutout_x:68,cutout_y:82,cutout_scale:175});
  expect(row.icon_path).toBe(PATH);
  expect(row.effect_image_path).toBe(PATH);
 });
 it('uploads icon separately and leaves effect image untouched',async()=>{
  const {ctx,row,store,db,host}=fixture();
  const input={value:'picture.png',files:[{type:'image/png',size:1000}]};
  await ctx.window.aleaSpellArt.upload({target:input},SPELL,'icon');
  expect(input.value).toBe('');
  expect(store.mock.calls[0][0]).toContain('object/alea-spell-art/spell/');
  expect(store.mock.calls[0][1].method).toBe('POST');
  expect(store.mock.calls[0][1].headers['x-upsert']).toBe('false');
  expect(JSON.parse(db.mock.calls[0][1].body)).toEqual({
   icon_path:NEXT,icon_focus_x:50,icon_focus_y:50,icon_zoom:120
  });
  expect(row.icon_path).toBe(NEXT);
  expect(row.effect_image_path).toBe(PATH);
  expect(host.innerHTML).toContain('Besvärjelseikon');
 });
 it('removing the icon does not restore the legacy image or remove the effect',async()=>{
  const {ctx,row,db}=fixture();
  await ctx.window.aleaSpellArt.remove(SPELL,'icon');
  expect(JSON.parse(db.mock.calls[0][1].body)).toEqual({icon_path:null});
  expect(row.effect_image_path).toBe(PATH);
  expect(ctx.window.aleaSpellArt.artFor(row,'icon').path).toBe('');
  expect(ctx.window.aleaSpellArt.artFor(row,'effect').path).toBe(PATH);
 });
 it('hydrates square combat artwork at exactly the saved focus/zoom',async()=>{
  const {ctx,store}=fixture();
  const view=viewport(200);
  const img={tagName:'IMG',naturalWidth:400,naturalHeight:400,
   hidden:true,isConnected:true,complete:true,style:{}};
  const effect={
   tagName:'DIV',isConnected:true,dataset:{focusX:'75',focusY:'25',zoom:'150'},
   getAttribute:key=>key==='data-spell-art-path'?PATH:'',
   querySelector:selector=>selector==='img'?img:null,
   getBoundingClientRect:view.getBoundingClientRect
  };
  await ctx.window.aleaSpellArt.hydrateCombat({querySelectorAll:()=>[effect]});
  expect(img.hidden).toBe(false);
  expect(img.style.width).toBe('300px');
  expect(img.style.left).toBe('-75px');
  expect(img.style.top).toBe('-25px');
  expect(store).toHaveBeenCalledTimes(1);
 });
 it('snapshots three images and uses cutout only inside the center frame',()=>{
  expect(runtime).toContain('spell_icon_path:');
  expect(runtime).toContain('spell_icon_zoom:');
  expect(runtime).toContain('spell_effect_image_path:');
  expect(runtime).toContain('spell_effect_zoom:');
  expect(runtime).toContain('spell_cutout_path:');
  expect(runtime).toContain('spell_cutout_scale:');
  expect(runtime).toContain("combatDuelCenterHtml('spell',data.spell_name||'Besvärjelse',cutout||artwork)");
  expect(runtime).toContain('combat-duel-spell-cutout');
  expect(frameCss).toContain('.combat-duel-center.is-spell.has-spell-cutout');
  expect(css).toContain('.spell-art-cutout-preview');
  expect(runtime).toContain('spell_image_path:');
  expect(runtime).toContain('data.spell_effect_image_path');
  expect(runtime).toContain('combat-spell-effect-artwork');
  // The compact native dropdown no longer renders thumbnails; artwork snapshots remain.
  expect(runtime).not.toContain('combat-spell-thumb');
  expect(runtime).toContain('combat-spell-choice--compact');
  expect(runtime).toContain('aleaSpellArt?.hydrateCombat?.(body)');
  expect(css).toContain('.combat-spell-effect-artwork');
 });
 it('wires all three editors into the existing Expert spell master',()=>{
  expect(admin).toContain('id="spellArtEditor"');
  expect(admin).toContain('window.aleaSpellArt?.editorHtml');
  expect(admin).toContain('window.aleaSpellArt?.hydrateEditor');
  expect(html).toContain('features/combat/spell-art.js?v=');
  expect(html).toContain('features/combat/spell-art.css?v=');
 });
});
