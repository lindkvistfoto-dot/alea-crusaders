import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const artSource=read('features/combat/spell-art.js');
const runtime=read('features/combat/runtime.js');
const admin=read('legacy/app.js');
const css=read('features/combat/spell-art.css');
const html=read('index.html');
const migration=read('supabase/migrations/20261013001000_spell_master_art.sql');
const SPELL='11111111-1111-4111-8111-111111111111';
const IMAGE='22222222-2222-4222-8222-222222222222';
const PATH='spell/'+SPELL+'/'+IMAGE+'.webp';
function setup(){
 const row={id:SPELL,name:'ELDKLOT',image_path:PATH,image_focus_x:72,image_focus_y:88};
 const fields={spellArtFocusX:{value:'95'},spellArtFocusY:{value:'20'},spellArtStatus:{textContent:''}};
 const storage=vi.fn(async()=>({ok:true,blob:async()=>({type:'image/webp',size:111})}));
 const dbJson=vi.fn(async()=>null);
 const style={setProperty:vi.fn()};
 const ctx={
  window:{},console,ruleSpells:[row],activeUser:()=>({admin:true}),dbJson,mapStorageFetch:storage,
  URL:{createObjectURL:()=> 'blob:spell-art',revokeObjectURL:vi.fn()},
  renderAdminSpells:vi.fn(),confirm:()=>true,
  document:{getElementById:id=>fields[id]||null,querySelector:()=>null}
 };
 runInNewContext(artSource,ctx);
 return {ctx,row,fields,storage,dbJson,style};
}
describe('Expert spell master image register',()=>{
 it('adds scoped private image fields and admin-only upload policy',()=>{
  expect(migration).toContain('alter table public.rule_spells');
  expect(migration).toContain('image_focus_x');
  expect(migration).toContain('image_focus_y');
  expect(migration).toContain("values ('alea-spell-art','alea-spell-art',false");
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain('split_part(image_path');
  expect(migration).not.toMatch(/for delete to authenticated/);
 });
 it('accepts immutable scoped WebP paths only',()=>{
  const {ctx}=setup();
  expect(ctx.window.aleaSpellArt.validPath(PATH)).toBe(true);
  for(const bad of [
   'https://evil.example/art.webp','../secret',
   'spell/'+SPELL+'/../../secret.webp',
   'spell/'+SPELL+'/'+IMAGE+'.png',
   'round/'+IMAGE+'.webp'
  ])expect(ctx.window.aleaSpellArt.validPath(bad)).toBe(false);
 });
 it('renders upload/remove and two interactive crop coordinates in an existing spell',()=>{
  const {ctx,row}=setup();
  const markup=ctx.window.aleaSpellArt.editorHtml(row);
  expect(markup).toContain('Ladda upp');
  expect(markup).toContain('Ta bort bild');
  expect(markup).toContain('spellArtFocusX');
  expect(markup).toContain('spellArtFocusY');
  expect(markup).toContain('spellArtPreview');
  expect(markup).toContain('72% 88%');
  expect(ctx.window.aleaSpellArt.editorHtml(null)).toContain('Spara den nya besvärjelsen först');
 });
 it('persists clamped crop focus in the master without reupload',async()=>{
  const {ctx,row,dbJson}=setup();
  await ctx.window.aleaSpellArt.saveFocus(SPELL);
  expect(dbJson).toHaveBeenCalledTimes(1);
  expect(dbJson.mock.calls[0][0]).toContain('rule_spells?id=eq.');
  expect(JSON.parse(dbJson.mock.calls[0][1].body)).toEqual({image_focus_x:95,image_focus_y:20});
  expect(row.image_focus_x).toBe(95);
  expect(row.image_focus_y).toBe(20);
 });
 it('reuses private blob URLs and sets combat effect background on matching element',async()=>{
  const {ctx,storage,style}=setup();
  expect(await ctx.window.aleaSpellArt.resolveUrl(PATH)).toBe('blob:spell-art');
  expect(await ctx.window.aleaSpellArt.resolveUrl(PATH)).toBe('blob:spell-art');
  expect(storage).toHaveBeenCalledTimes(1);
  const effect={isConnected:true,tagName:'DIV',style,
   getAttribute:key=>key==='data-spell-art-path'?PATH:''};
  ctx.window.aleaSpellArt.hydrateCombat({querySelectorAll:()=>[effect]});
  await Promise.resolve();await Promise.resolve();
  expect(style.setProperty).toHaveBeenCalledWith('--alea-spell-effect-art','url("blob:spell-art")');
 });
 it('snapshots master art in prepared combat actions and renders it in the spell result',()=>{
  expect(runtime).toContain('image_path:rule.image_path||null');
  expect(runtime).toContain('spell_image_path:');
  expect(runtime).toContain('spell_image_focus_x:');
  expect(runtime).toContain('spell_image_focus_y:');
  expect(runtime).toContain('data.spell_image_path');
  expect(runtime).toContain('data-spell-art-path=');
  expect(runtime).toContain('combat-spell-thumb');
  expect(runtime).toContain('aleaSpellArt?.hydrateCombat?.(body)');
  expect(css).toContain('var(--alea-spell-effect-focus-x');
 });
 it('wires upload controls to the real spell editor and loads image modules',()=>{
  expect(admin).toContain('id="spellArtEditor"');
  expect(admin).toContain('window.aleaSpellArt?.editorHtml');
  expect(admin).toContain('window.aleaSpellArt?.hydrateEditor');
  expect(html).toContain('features/combat/spell-art.js?v=');
  expect(html).toContain('features/combat/spell-art.css?v=');
 });
});
