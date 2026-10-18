import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../features/skills/admin-art.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/skills/admin-art.css',import.meta.url),'utf8');
const uuid='a3729cc1-a80d-48d3-b162-d8a196d78054';
const icon='skill/spara/icon/'+uuid+'.png';
const illustration='skill/spara/illustration/'+uuid+'.webp';

function fixture({lazy=false}={}){
 const urls=[],revoked=[],requests=[],images=[],observed=[],instances=[];
 let root=null;
 const mockDocument={
  getElementById:id=>id==='adminSkillTable'?root:null,
  createElement:tag=>{expect(tag).toBe('img');const img={};images.push(img);return img}
 };
 const mapStorageFetch=async(path,options)=>{
  requests.push({path,options});
  return {ok:true,blob:async()=>({size:500,type:'image/png'})};
 };
 const ctx={
  window:{},document:mockDocument,mapStorageFetch,
  URL:{
   createObjectURL:()=>{const url='blob:skill-'+urls.length;urls.push(url);return url},
   revokeObjectURL:url=>revoked.push(url)
  },
 };
 if(lazy)ctx.IntersectionObserver=class{
  constructor(callback,options){this.callback=callback;this.options=options;instances.push(this)}
  observe(el){observed.push(el)}
  unobserve(el){this.lastUnobserved=el}
  disconnect(){this.disconnected=true}
 };
 runInNewContext(code,ctx);
 const el={
  dataset:{skillId:'spara',iconPath:icon},
  children:[],
  classList:{added:[],add(name){this.added.push(name)}},
  replaceChildren(...nodes){this.children=nodes},
  title:''
 };
 root={
  querySelectorAll:()=>[el],
  contains:item=>item===el
 };
 return {art:ctx.window.aleaSkillArt,ctx,el,root,requests,images,urls,revoked,observed,instances,setRoot:r=>{root=r}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

describe('Master skill table artwork',()=>{
 it('inserts one icon slot before each name and retains existing edit actions and columns',()=>{
  const render=app.split('\n').find(s=>s.startsWith('function renderAdminSkills()'));
  expect(render).toContain('window.aleaSkillArt?.listIconHtml?.(r)');
  expect(render).toContain('window.aleaSkillArt?.hydrateList?.()');
  expect(render.indexOf('listIconHtml')).toBeLessThan(render.indexOf('skill-codex-open'));
  expect(render).toContain('window.aleaSkillCodex.openFromAdmin(this.dataset.skillCodexId)');
  expect(render).toContain('data-skill-codex-id');
  expect(render).toContain('editRuleSkill');
  expect(render).toContain('deleteRuleSkill');
  expect(render).toContain('● Illustration');
  expect(css).toContain('.adminskilltable .skill-art-row');
  expect(css).toContain('.adminskilltable .skill-codex-open:focus-visible');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('@media(max-width:700px)');
 });
 it('renders an accessible name button that opens the Codex from the admin registry',()=>{
  const render=app.split('\n').find(s=>s.startsWith('function renderAdminSkills()'));
  const nodes={adminSkillTable:{innerHTML:''},adminSkillStatus:{textContent:''}};
  const ctx={
   $:id=>nodes[id],ruleSkillsLoaded:true,
   ruleSkills:[{id:'fiska',name:'Fiska',type:'VIL',base_attribute:'INT',cost:1,bc:'0'}],
   escAttr:value=>String(value),
   window:{aleaSkillArt:{listIconHtml:()=>'<span class="skill-art-row-thumb">✦</span>',hydrateList:()=>{}}}
  };
  runInNewContext(render,ctx);
  ctx.renderAdminSkills();
  expect(nodes.adminSkillTable.innerHTML).toContain('<button type="button" class="rule-name skill-codex-open"');
  expect(nodes.adminSkillTable.innerHTML).toContain('data-skill-codex-id="fiska"');
  expect(nodes.adminSkillTable.innerHTML).toContain('onclick="window.aleaSkillCodex.openFromAdmin(this.dataset.skillCodexId)"');
  expect(nodes.adminSkillTable.innerHTML).toContain('aria-label="Visa färdighetskort för Fiska"');
  expect(nodes.adminSkillTable.innerHTML).toContain("editRuleSkill('fiska')");
  expect(nodes.adminSkillTable.innerHTML).toContain("deleteRuleSkill('fiska')");
 });
  it('shows a compact placeholder when icon is missing, never uses illustration as the thumbnail',()=>{
  const {art}=fixture();
  const missing=art.listIconHtml({id:'spara',name:'Spåra',icon_path:null,illustration_path:illustration});
  expect(missing).toContain('skill-art-row-fallback');
  expect(missing).toContain('Ingen ikon uppladdad');
  expect(missing).not.toContain(illustration);
  const supplied=art.listIconHtml({id:'spara',name:'Spåra',icon_path:icon,illustration_path:illustration});
  expect(supplied).toContain('data-icon-path="'+icon+'"');
  expect(supplied).not.toContain(illustration);
  expect(art.listIconHtml({id:'spara',name:'Risk',icon_path:'../secret.png'})).toContain('data-icon-path=""');
 });
 it('loads a valid private icon and shows it without crop or a public bucket URL',async()=>{
  const t=fixture();
  t.art.hydrateList();
  await flush();
  expect(t.requests).toHaveLength(1);
  expect(t.requests[0].path).toBe('object/alea-skill-art/'+icon);
  expect(t.requests[0].options.method).toBe('GET');
  expect(t.el.children).toHaveLength(1);
  expect(t.el.children[0].src).toBe('blob:skill-0');
  expect(t.el.classList.added).toContain('skill-art-row-loaded');
  t.art.releaseList();
  expect(t.revoked).toEqual(['blob:skill-0']);
 });
 it('lazily fetches only visible thumbs on browsers with IntersectionObserver',async()=>{
  const t=fixture({lazy:true});
  t.art.hydrateList();
  expect(t.observed).toEqual([t.el]);
  expect(t.requests).toHaveLength(0);
  t.instances[0].callback([{target:t.el,isIntersecting:true}]);
  await flush();
  expect(t.requests).toHaveLength(1);
  expect(t.el.children).toHaveLength(1);
 });
 it('does not place stale thumbnails after the table has been replaced',async()=>{
  const t=fixture();
  let resume;
  t.ctx.mapStorageFetch=()=>new Promise(resolve=>{resume=resolve});
  t.art.hydrateList();
  t.setRoot({querySelectorAll:()=>[],contains:()=>false});
  t.art.hydrateList();
  resume({ok:true,blob:async()=>({size:100,type:'image/png'})});
  await flush();
  expect(t.el.children).toHaveLength(0);
  expect(t.revoked).toEqual(['blob:skill-0']);
 });
});
