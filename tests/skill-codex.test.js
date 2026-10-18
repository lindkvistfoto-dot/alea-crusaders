import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../features/skills/skill-codex.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/skills/skill-codex.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function harness(){
 const classes=new Set(['hidden']);
 const modal={
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
  querySelector:s=>s==='[data-skill-codex-icon]'?icon:
   s==='[data-skill-codex-hero]'?hero:null
 };
 let icon=null,hero=null;
 const header={insertBefore:node=>{icon=node}};
 const title={textContent:'',closest:()=>header};
 const body={
  _html:'',
  set innerHTML(v){
   this._html=v;
   hero={
    classList:{add:vi.fn(),remove:vi.fn()},
    querySelector:()=>null,
    replaceChildren:vi.fn()
   };
  },
  get innerHTML(){return this._html}
 };
 const artPaths=[];
 const win={
  aleaSkillArt:{validPath:(p,id,kind)=>{
   artPaths.push([p,id,kind]);
   return p.startsWith('skill/'+id+'/'+kind+'/')||p.startsWith('hermes/skill/'+id+'/');
  }},
  showRuleSkillById:vi.fn(()=>{modal.classList.remove('hidden')}),
  showSkillInfo:vi.fn(async()=>{modal.classList.remove('hidden')}),
  closeSkillInfo:vi.fn(()=>{modal.classList.add('hidden')}),
  showWeaponInfo:vi.fn(()=>{modal.classList.remove('hidden')})
 };
 const rules=[{id:'fiska',name:'Fiska',type:'VIL',grundegenskap:'',cost:1,bc:'INT',
  description:'Fånga fisk med lämpliga redskap och metoder samt bedöma lämpliga fiskeplatser.'}];
 const ctx={
  window:win,document:{
   getElementById:id=>({'skillModal':modal,'skillModalTitle':title,'skillModalBody':body}[id]),
   createElement:()=>({
    dataset:{},className:'',textContent:'',setAttribute:vi.fn(),
    remove:()=>{icon=null},replaceChildren:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}
   })
  },
  ruleSkills:rules,current:{skills:[{name:'Fiska',skillId:'fiska'}]},
  findRuleSkill:s=>rules.find(x=>x.id===s.skillId),
  URL:{createObjectURL:vi.fn(()=>'blob:art'),revokeObjectURL:vi.fn()},
  mapStorageFetch:vi.fn(async()=>({ok:true,blob:async()=>({size:125,type:'image/webp'})})),
  console:{warn:vi.fn()}
 };
 runInNewContext(script,ctx);
 return {win,modal,classes,title,body,rules,ctx,artPaths,getIcon:()=>icon,getHero:()=>hero};
}

describe('ARCANE SKILL CODEX',()=>{
 it('loads after the skill art helper without replacing weapon UI',()=>{
  expect(html).toContain('features/skills/skill-codex.css');
  expect(html).toContain('features/skills/skill-codex.js');
  expect(html.indexOf('features/skills/admin-art.js')).toBeLessThan(html.indexOf('features/skills/skill-codex.js'));
  expect(css).toContain('#skillModal.skill-codex-active');
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(css).toContain('.skill-codex-icon{width:52px');
 });
 it('renders all fields and safely escapes registry content',()=>{
  const h=harness();
  h.rules[0].description='Fiska <script>alert(1)</script>';
  h.win.showRuleSkillById('fiska');
  expect(h.classes.has('skill-codex-active')).toBe(true);
  expect(h.title.textContent).toBe('Fiska');
  expect(h.body.innerHTML).toContain('Grundegenskap');
  expect(h.body.innerHTML).toContain('Kostnad');
  expect(h.body.innerHTML).toContain('INT');
  expect(h.body.innerHTML).toContain('Beskrivning');
  expect(h.body.innerHTML).toContain('&lt;script&gt;');
  expect(h.body.innerHTML).not.toContain('<script>');
  expect(h.getIcon().className).toContain('skill-codex-icon');
 });
 it('opens the same read-only card directly from admin without an active character',()=>{
  const h=harness();
  h.ctx.current=null;
  expect(h.win.aleaSkillCodex.openFromAdmin('fiska')).toBe(true);
  expect(h.title.textContent).toBe('Fiska');
  expect(h.body.innerHTML).toContain('Beskrivning');
  expect(h.classes.has('hidden')).toBe(false);
  expect(h.classes.has('skill-codex-active')).toBe(true);
  h.win.closeSkillInfo();
  expect(h.classes.has('hidden')).toBe(true);
  expect(h.classes.has('skill-codex-active')).toBe(false);
  expect(h.win.aleaSkillCodex.openFromAdmin('unknown')).toBe(false);
  expect(h.classes.has('hidden')).toBe(true);
 });
  it('also works for a player skill, and closing removes the scoped appearance',async()=>{
  const h=harness();
  await h.win.showSkillInfo(0);
  expect(h.title.textContent).toBe('Fiska');
  expect(h.classes.has('skill-codex-active')).toBe(true);
  h.win.closeSkillInfo();
  expect(h.classes.has('skill-codex-active')).toBe(false);
  expect(h.classes.has('hidden')).toBe(true);
  expect(h.getIcon()).toBe(null);
 });
 it('leaves normal weapon detail popup intact',()=>{
  const h=harness();
  h.win.showRuleSkillById('fiska');
  h.win.showWeaponInfo(0);
  expect(h.classes.has('skill-codex-active')).toBe(false);
  expect(h.win.showWeaponInfo).toBeTypeOf('function');
 });
 it('fetches private illustration and icon through authenticated storage buckets',async()=>{
  const h=harness();
  h.rules[0].icon_path='skill/fiska/icon/abc.webp';
  h.rules[0].illustration_path='skill/fiska/illustration/old-square.webp';
  h.rules[0].illustration_wide_path='skill/fiska/illustration_wide/abc.webp';
  h.win.showRuleSkillById('fiska');
  await new Promise(resolve=>setImmediate(resolve));
  const paths=h.ctx.mapStorageFetch.mock.calls.map(args=>args[0]);
  expect(paths).toContain('object/alea-skill-art/skill/fiska/icon/abc.webp');
  expect(paths).toContain('object/alea-skill-art/skill/fiska/illustration_wide/abc.webp');
  expect(paths).not.toContain('object/alea-skill-art/skill/fiska/illustration/old-square.webp');
  expect(h.getHero().replaceChildren).toHaveBeenCalled();
  h.win.closeSkillInfo();
  expect(h.ctx.URL.revokeObjectURL).toHaveBeenCalled();
 });
 it('does not silently substitute the old square illustration when WIDE is missing',async()=>{
  const h=harness();
  h.rules[0].illustration_path='skill/fiska/illustration/old-square.webp';
  h.win.showRuleSkillById('fiska');
  await new Promise(resolve=>setImmediate(resolve));
  expect(h.body.innerHTML).toContain('FÄRDIGHET ILLUSTRATION WIDE saknas');
  expect(h.ctx.mapStorageFetch).not.toHaveBeenCalled();
 });
 it('rejects a foreign/unverified image path before making any request',()=>{
  const h=harness();
  h.rules[0].icon_path='../../someone-else.png';
  h.rules[0].illustration_wide_path='https://example.com/unsafe.jpg';
  h.win.showRuleSkillById('fiska');
  expect(h.ctx.mapStorageFetch).not.toHaveBeenCalled();
 });
});
