import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('features/academy/rules.js');
const ui=read('features/academy/academy.js');
const page=read('index.html');
const admin=read('legacy/app.js');
const css=read('features/academy/academy.css');
const db=read('supabase/migrations/20261011173000_academy_skill_category.sql');
function model(){const x={window:{}};runInNewContext(source,x);return x.window.aleaAcademyRules}
const skill={id:'sword',name:'Enhandssvärd',type:'STR',base_attribute:'SMI',cost:2,expert_category:'A'};
function hero(fv=10,erf=3,bonusExp=0){
 return {id:'hero',identity:{namn:'Astrid',ras:'Människa'},
  base:{Smidighet:{v:14,g:3},Intelligens:{v:16,g:3}},
  skills:[{skillId:'sword',name:'Enhandssvärd',fv,erf}],
  baseChanceSkills:[],live:{bonusExp},academyTraining:null};
}
describe('Akademin — Expert advancement, experience and tuition',()=>{
 it('prices each next FV from the skill master cost and Expert category multipliers',()=>{
  const r=model();
  expect(r.quote(hero(9,2),skill).required).toBe(2);
  expect(r.quote(hero(10,4),skill)).toMatchObject({next:11,multiplier:2,required:4,ready:true});
  expect(r.quote(hero(14,6),skill)).toMatchObject({next:15,multiplier:3,required:6,ready:true});
  expect(r.quote(hero(17,8),skill)).toMatchObject({next:18,multiplier:4,required:8});
  expect(r.quote(hero(20,12),skill)).toMatchObject({next:21,multiplier:6,required:12});
 });
 it('category B costs ×1 through FV2, ×2 through 4, ×3 for 5 and stops',()=>{
  const r=model(),b={...skill,id:'b',name:'En kategori B-färdighet',expert_category:'B',cost:4};
  const trainee=(fv,erf)=>{const c=hero(fv,erf);c.skills[0].skillId='b';c.skills[0].name=b.name;return c};
  expect(r.quote(trainee(1,0),b).required).toBe(4);
  expect(r.quote(trainee(2,0),b).required).toBe(8);
  expect(r.quote(trainee(4,0),b).required).toBe(12);
  expect(r.quote(trainee(5,20),b).required).toBe(null);
 });
 it('spends named ERF first and only then generic bonus EXP without affecting another skill',()=>{
  const r=model(),c=hero(10,2,4);const out=r.purchase(c,skill);
  expect(out.receipt).toMatchObject({fv:11,cost:4,fromSkill:2,fromBonus:2});
  expect(out.character.skills[0]).toMatchObject({fv:11,erf:0});
  expect(out.character.live.bonusExp).toBe(2);
  expect(c.skills[0].fv).toBe(10);
  expect(()=>r.purchase(hero(10,2,0),skill)).toThrow('tillräckligt');
 });
 it('converts previously tracked base chance ERF into a newly purchased skill',()=>{
  const r=model(),c=hero();c.skills=[];c.baseChanceSkills=[{skillId:'sword',name:'Enhandssvärd',erf:3}];
  const out=r.purchase(c,skill);
  expect(out.character.skills).toHaveLength(1);
  expect(out.character.skills[0]).toMatchObject({fv:1,erf:1});
  expect(out.character.baseChanceSkills).toHaveLength(0);
 });
 it('self training lasts 7, 11 or 14 campaign days with one roll each',()=>{
  const r=model(),c=hero(10);
  expect(r.plan(c,skill,{day:25,mode:'self',hours:8})).toMatchObject({readyDay:32,rolls:1,hoursPerDay:8,costSm:0,cl:3});
  expect(r.plan(c,skill,{day:25,mode:'self',hours:6}).readyDay).toBe(36);
  expect(r.plan(c,skill,{day:25,mode:'self',hours:4}).readyDay).toBe(39);
  expect(()=>r.plan(c,skill,{day:25,mode:'self',hours:2})).toThrow();
  expect(()=>r.plan(c,skill,{day:NaN})).toThrow('Kampanjens dag');
 });
 it('enforces attribute cap with category B and learning skills exempt',()=>{
  const r=model(),c=hero(14);
  expect(r.trainingAllowed(c,skill).allowed).toBe(false);
  expect(()=>r.plan(c,skill,{day:10})).toThrow();
  expect(r.trainingAllowed(c,{...skill,type:'LÄR'}).allowed).toBe(true);
  expect(r.trainingAllowed(c,{...skill,expert_category:'B'}).allowed).toBe(true);
 });
 it('checks teachers’ INT, FV advantage and different-race weighted class capacity',()=>{
  const r=model(),c=hero(10),o={intelligence:15,fv:18,classmates:6,differentRace:0,magician:false,ownDifferentRace:false};
  expect(r.teacherQuote(c,skill,o).weeklySm).toBe(300);
  expect(r.teacherQuote(c,skill,o).bonus).toBe(5);
  expect(r.teacherQuote(c,skill,{...o,classmates:1}).weeklySm).toBe(2250);
  expect(r.teacherQuote(c,skill,{...o,classmates:1}).bonus).toBe(15);
  expect(r.teacherQuote(c,skill,{...o,classmates:1,differentRace:1,ownDifferentRace:true}).weeklySm).toBe(3375);
  expect(()=>r.teacherQuote(c,skill,{...o,intelligence:12})).toThrow('INT');
  expect(()=>r.teacherQuote(c,skill,{...o,fv:12})).toThrow('FV');
  expect(()=>r.teacherQuote(c,skill,{...o,classmates:10,differentRace:7})).toThrow('större');
  expect(r.teacherQuote(hero(3),{...skill,expert_category:'B'}, {...o,fv:5}).bonus).toBe(10);
 });
 it('teacher training stores two rolls and resolves only after elapsed time',()=>{
  const r=model(),c=hero(10),session=r.plan(c,skill,{mode:'teacher',day:30,teacher:{
   fv:18,intelligence:15,classmates:6,differentRace:0,magician:false,ownDifferentRace:false
  }});
  expect(session).toMatchObject({readyDay:37,rolls:2,cl:8,costSm:300});
  c.academyTraining=session;
  expect(()=>r.finish(c,skill,36,()=>0)).toThrow('inte färdig');
  let iter=0;const out=r.finish(c,skill,37,()=>[0.05,0.95][iter++]);
  expect(out.earned).toBe(1);
  expect(Array.from(out.rolls.map(x=>x.die))).toEqual([2,20]);
  expect(out.character.skills[0].erf).toBe(4);
  expect(out.character.academyTraining).toBe(null);
  expect(()=>r.finish(out.character,skill,38,()=>0)).toThrow('ingen aktiv');
 });
 it('renders a dedicated academy, accessible mobile nav and live character stats',()=>{
  expect(page).toContain('id="academyPage"');
  expect(page).toContain('id="academyNavBtn"');
  expect(page).toContain('data-mobile-target="academyNavBtn"');
  expect(page).toContain('features/academy/academy.css');
  expect(page).toContain('features/academy/rules.js');
  expect(page).toContain('features/academy/academy.js');
  for(const id of ['academyCharacter','academySkills','academyTraining','academyProgressSummary','academyBonus'])expect(page).toContain('id="'+id+'"');
  expect(ui).toContain('syncCharacterToCentral');
  expect(ui).toContain('shopSpendCarriedCoins');
  expect(ui).toContain('shopEligibleBuyers');
  expect(ui).toContain('campaignDayState');
  expect(css).toContain('@media(max-width:620px)');
 });
 it('uses explicit Expert A/B registry data rather than guessing from cost',()=>{
  expect(db).toContain('expert_category');
  expect(admin).toContain('id="rsExpertCategory"');
  expect(admin).toContain("base_attribute:$('rsGrund')");
  expect(admin).toContain('Kategori B får inte ERF genom äventyr');
 });
});
