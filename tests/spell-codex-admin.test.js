import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=read('features/combat/spell-codex.js');
const KEY='11111111-1111-4111-8111-111111111111';
function harness(){
 let mounted=false,keydown=null;
 const classes=new Set(['hidden']);
 const icon={replaceChildren:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}};
 const hero={replaceChildren:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}};
 const titleText={textContent:'',scrollWidth:80},titleViewport={clientWidth:130};
 const titleClasses=new Set();
 const title={
  get textContent(){return titleText.textContent},
  querySelector:s=>({'[data-spell-codex-title-text]':titleText,'[data-spell-codex-title-viewport]':titleViewport}[s]||null),
  classList:{add:v=>titleClasses.add(v),remove:v=>titleClasses.delete(v),contains:v=>titleClasses.has(v)},
  style:{setProperty:vi.fn()}
 };
 const body={innerHTML:''},closeButton={focus:vi.fn()};
 const root={
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
  addEventListener:vi.fn(),querySelector:s=>({
   '[data-spell-codex-icon]':icon,'[data-spell-codex-hero]':hero,
   '[data-spell-codex-title]':title,'[data-spell-codex-body]':body,
   '[data-spell-codex-close]':closeButton
  }[s]||null)
 };
 const origin={isConnected:true,focus:vi.fn()},resolved=[];
 const document={
  body:{appendChild:node=>{expect(node).toBe(root);mounted=true}},
  getElementById:id=>id==='spellCodexModal'&&mounted?root:null,
  activeElement:origin,
  createElement:tag=>tag==='div'?root:{tagName:tag},
  createTextNode:text=>({textContent:text}),
  addEventListener:(name,callback)=>{if(name==='keydown')keydown=callback}
 };
 const spell={id:KEY,name:'Eldklot',school_id:'eld',school_value:5,
  range_text:'30 meter',duration_text:'Omedelbar',psy_cost_text:'1 PSY per EG',
  target_text:'En varelse',description:'Magisk eld',icon_path:'assets/spells/arcane-ivory/eldklot.webp',
  illustration_wide_path:'spell/'+KEY+'/'+KEY+'.webp',
  illustration_path:'spell/'+KEY+'/22222222-2222-4222-8222-222222222222.webp'};
 const art={
  artFor:vi.fn((row,kind)=>({path:row[kind==='wide'?'illustration_wide_path':'icon_path']||''})),
  resolveUrl:vi.fn(async path=>{resolved.push(path);return 'blob:'+path})
 };
 const window={aleaSpellArt:art};
 runInNewContext(script,{document,window,ruleSpells:[spell],ruleMagicSchools:[{id:'eld',name:'Elementarmagi'}],console});
 return {root,classes,icon,hero,title,titleText,titleViewport,titleClasses,body,spell,window,origin,art,resolved,keyDown:e=>keydown?.(e)};
}
describe('Admin spell name opens the ARCANE SPELL CODEX',()=>{
 it('loads the dedicated stylesheet/script after spell art and makes the master name a keyboard-accessible button',()=>{
  const html=read('index.html'),app=read('legacy/app.js'),css=read('features/combat/spell-codex.css');
  const start=app.indexOf('function renderAdminSpells(){'),end=app.indexOf('async function setRuleSpellPlaytested(',start);
  const render=app.slice(start,end);
  expect(html).toContain('features/combat/spell-codex.css');
  expect(html).toContain('features/combat/spell-codex.js');
  expect(html.indexOf('features/combat/spell-art.js')).toBeLessThan(html.indexOf('features/combat/spell-codex.js'));
  expect(render).toContain('class="rule-name spell-codex-open"');
  expect(render).toContain('data-spell-codex-id=');
  expect(render).toContain('window.aleaSpellCodex.openFromAdmin(this.dataset.spellCodexId)');
  expect(render).toContain('editRuleSpell');
  expect(render).toContain('deleteRuleSpell');
  expect(css).toContain('.spell-codex-open:focus-visible');
  expect(css).toContain('@media(max-width:560px)');
 });
 it('renders a click-target that opens the read-only card and keeps edit actions distinct',()=>{
  const app=read('legacy/app.js');
  const start=app.indexOf('function renderAdminSpells(){'),end=app.indexOf('async function setRuleSpellPlaytested(',start);
  const table={innerHTML:''},status={textContent:''};
  const ctx={
   $:id=>id==='adminSpellTable'?table:status,ruleSpellsLoaded:true,
   ruleSpells:[{id:KEY,name:'Eldklot'}],ruleMagicSchools:[],
   window:{aleaSpellArt:{adminIconHtml:()=>'<div>✧</div>',artFor:()=>({path:''}),hydrateAdminList:vi.fn()}},
   escAttr:v=>String(v??''),combatMagicBinding:()=>({supported:false,reason:'Ej stödd'})
  };
  runInNewContext(app.slice(start,end)+'\nrenderAdminSpells();',ctx);
  expect(table.innerHTML).toContain('aria-label="Visa besvärjelsekort för Eldklot"');
  expect(table.innerHTML).toContain('data-spell-codex-id="'+KEY+'"');
  expect(table.innerHTML).toContain("editRuleSpell('"+KEY+"')");
  expect(table.innerHTML).toContain("deleteRuleSpell('"+KEY+"')");
  expect(table.innerHTML).not.toContain("onclick=\"showRuleSpell('"+KEY+"')");
 });
 it('opens directly from master without an active character and loads icon/WIDE, never square art',async()=>{
  const h=harness();
  expect(h.window.aleaSpellCodex.openFromAdmin(KEY)).toBe(true);
  expect(h.title.textContent).toBe('Eldklot');
  expect(h.classes.has('hidden')).toBe(false);
  expect(h.body.innerHTML).toContain('Elementarmagi');
  expect(h.body.innerHTML).toContain('Magisk eld');
  expect(h.body.innerHTML).toContain('BESVÄRJELSE ILLUSTRATION WIDE saknas');
  await new Promise(resolve=>setImmediate(resolve));
  expect(h.art.artFor).toHaveBeenCalledWith(h.spell,'icon');
  expect(h.art.artFor).toHaveBeenCalledWith(h.spell,'wide');
  expect(h.icon.replaceChildren).toHaveBeenCalledTimes(2);
  expect(h.hero.replaceChildren).toHaveBeenCalledTimes(1);
  expect(h.resolved).toContain(h.spell.icon_path);
  expect(h.resolved).toContain(h.spell.illustration_wide_path);
  expect(h.resolved).not.toContain(h.spell.illustration_path);
  h.window.aleaSpellCodex.close();
  expect(h.classes.has('hidden')).toBe(true);
  expect(h.origin.focus).toHaveBeenCalled();
 });
 it('pans only overflowing names inside the title slot, keeping short titles centered',()=>{
  const h=harness();
  h.window.aleaSpellCodex.openFromAdmin(KEY);
  expect(h.titleClasses.has('is-scrolling')).toBe(false);
  h.titleText.scrollWidth=290;
  h.spell.name='Återuppväckelsens magnifika besvärjelse';
  h.window.aleaSpellCodex.openFromAdmin(KEY);
  expect(h.titleClasses.has('is-scrolling')).toBe(true);
  expect(h.title.textContent).toBe(h.spell.name);
  expect(h.title.style.setProperty).toHaveBeenCalledWith('--spell-title-shift','-160px');
  h.titleText.scrollWidth=90;
  h.spell.name='Ljus';
  h.window.aleaSpellCodex.openFromAdmin(KEY);
  expect(h.titleClasses.has('is-scrolling')).toBe(false);
 });
 it('keeps descriptions and spell effects but omits notes and rulebook citation',()=>{
  const h=harness();
  h.spell.notes='Privat notering';
  h.spell.source_label='Drakar och Demoner Expert regelbok';
  h.spell.effect_per_eg='En extra ruta';
  h.spell.resistance_text='Motstånd med PSY';
  h.window.aleaSpellCodex.openFromAdmin(KEY);
  expect(h.body.innerHTML).toContain('Beskrivning');
  expect(h.body.innerHTML).toContain('Effekt per effektgrad');
  expect(h.body.innerHTML).toContain('Motstånd med PSY');
  expect(h.body.innerHTML).not.toContain('Noteringar');
  expect(h.body.innerHTML).not.toContain('Privat notering');
  expect(h.body.innerHTML).not.toContain('Källa:');
  expect(h.body.innerHTML).not.toContain('Drakar och Demoner Expert regelbok');
 });
 it('styles smaller text and an overflow-only marquee, with reduced-motion alternative',()=>{
  const css=read('features/combat/spell-codex.css');
  expect(css).toContain('@keyframes spell-codex-title-pan');
  expect(css).toContain('#spellCodexTitle.is-scrolling .spell-codex-title-text');
  expect(css).toContain('font-size:clamp(16px,4.3vw,21px)');
  expect(css).toContain('font:700 16px/1.18 Georgia');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).not.toContain('.spell-codex-source');
 });
  it('escapes registry text, refuses missing IDs and closes on Escape',()=>{
  const h=harness();
  expect(h.window.aleaSpellCodex.openFromAdmin('unknown')).toBe(false);
  expect(h.classes.has('hidden')).toBe(true);
  h.spell.description='<script>alert(1)</script>';
  expect(h.window.aleaSpellCodex.openFromAdmin(KEY)).toBe(true);
  expect(h.body.innerHTML).toContain('&lt;script&gt;');
  expect(h.body.innerHTML).not.toContain('<script>');
  const e={key:'Escape',preventDefault:vi.fn()};
  h.keyDown(e);
  expect(e.preventDefault).toHaveBeenCalled();
  expect(h.classes.has('hidden')).toBe(true);
 });
 it('keeps a dedicated WIDE placeholder and does not substitute the square illustration',async()=>{
  const h=harness();
  h.spell.illustration_wide_path=null;
  h.window.aleaSpellCodex.openFromAdmin(KEY);
  await new Promise(resolve=>setImmediate(resolve));
  expect(h.body.innerHTML).toContain('BESVÄRJELSE ILLUSTRATION WIDE saknas');
  expect(h.art.resolveUrl).toHaveBeenCalledTimes(1);
  expect(h.resolved).not.toContain(h.spell.illustration_path);
 });
});
