import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shared=read('features/character/item-spells.js');
const config=read('features/equipment/magic-configurator.js');
const runtime=read('features/combat/runtime.js');
const characterApp=read('legacy/app.js');
const page=read('index.html');
const spell={id:'fire-spell',name:'FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)',
 spell_key:'frammana-skicka-bort-elementar-eld',attack_magic:false,description:'Eldelementar'};
function data(){
 return {
  weapons:[{equipId:'w1',name:'Dödsbringaren',isMagical:true,magicPowers:[{
   id:'power-1',kind:'spell',property_key:'cast_spell',
   spell_id:'fire-spell',effect_grade:1,effect_multiplier:4,cast_mode:'fixed',fixed_fv:5,
   psy_source:'artifact',recharge_rule:'next_day',last_used_day:null,uses_today:0
  }]}],
  armor:[],shields:[],equipment:[],spells:[{name:spell.name,rule_id:spell.id,fv:16,erf:0}]
 }
}
function fixture(){
 const ctx={window:{}};runInNewContext(config+'\n'+shared,ctx);
 const item=data();const actor={id:'actor',source_id:'char',source_type:'character',state:{attack_profile:{spells:item.spells, ...item}}};
 const common={
  window:ctx.window,ruleSpells:[spell],campaignDayState:{day_number:10},
  combatAttackProfile:()=>item,
  combatMagicRuleProfile:()=>({category:'summon'}),
  combatMagicBinding:()=>({kind:'manual',supported:true,reason:'SL avgör effekten'}),
  escAttr:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 };
 const start=runtime.indexOf('function combatItemSpellSources(');
 const end=runtime.indexOf('async function combatMagicButton(',start);
 if(start<0||end<start)throw new Error('Item combat spell chooser missing');
 runInNewContext(runtime.slice(start,end)+'\nthis.options=combatSpellOptions;this.render=combatSpellChooserHtml;',common);
 return {actor,item,common,api:ctx.window.aleaItemSpells,config:ctx.window.aleaMagicConfigurator}
}
describe('Besvärjelser från magiska föremål visas separat',()=>{
 it('visar egen rubrik på rollpersonens Magi och i strid',()=>{
  expect(page).toContain('id="itemSpellTable"');
  expect(page).toContain('Besvärjelser från magiska föremål');
  expect(page).toContain('features/character/item-spells.js?v=');
  expect(characterApp).toContain('renderItemSpellTable();');
  expect(characterApp).toContain('function showItemSpellInfo(i)');
  expect(runtime).toContain("label:'Inlärda besvärjelser'");
  expect(runtime).toContain("label:'Besvärjelser från magiska föremål'");
 });
 it('håller Dödsbringarens FV5 EG1 ×4 separat från inlärd FV16 och maxantal',()=>{
  const x=fixture();
  const list=x.common.options(x.actor);
  expect(list).toHaveLength(2);
  expect(list.filter(s=>s.spell_source==='item')).toHaveLength(1);
  expect(list.find(s=>s.spell_source==='learned').fv).toBe(16);
  const item=list.find(s=>s.spell_source==='item');
  expect(item.fv).toBe(5);
  expect(item.item_spell.effect_grade).toBe(1);
  expect(item.item_spell.effect_multiplier).toBe(4);
  expect(x.common.combatSpellKey(item)).toContain('item:weapons:w1:power-1');
  const html=x.common.render(x.actor,{source_data:{}});
  expect(html).toContain('Inlärda besvärjelser');
  expect(html).toContain('Besvärjelser från magiska föremål');
  expect(html).toContain('Dödsbringaren');
  expect(html).toContain('EG 1 ×4');
  expect(html).toContain('FV 5');
 });
 it('tar bort förmågan när föremålets magi tas bort men lämnar inlärd magi',()=>{
  const x=fixture(); x.item.weapons[0].isMagical=false;
  const list=x.common.options(x.actor);
  expect(list).toHaveLength(1);
  expect(list[0].spell_source).toBe('learned');
  x.item.weapons[0].isMagical=true;
  x.item.weapons[0].magicPowers=[];
  expect(x.common.options(x.actor)).toHaveLength(1);
 });
 it('låser frammaningen efter användning tills nästa kampanjdag',()=>{
  const x=fixture(),power=x.item.weapons[0].magicPowers[0];
  Object.assign(power,x.config.markUsed(power,10));
  const locked=x.common.options(x.actor).find(s=>s.spell_source==='item');
  expect(locked.item_spell.ready).toBe(false);
  expect(x.common.render(x.actor,{source_data:{}})).toContain('disabled');
  x.common.campaignDayState.day_number=11;
  expect(x.common.options(x.actor).find(s=>s.spell_source==='item').item_spell.ready).toBe(true);
 });
 it('väljer föremålets fasta EG1, FV5 och egen PSY-källa vid förberedelse i strid',async()=>{
  const x=fixture(),item=x.common.options(x.actor).find(s=>s.spell_source==='item');
  const action={id:'action1',status:'planned',source_data:{action_key:'spell_cast',effect_grade:3}};
  const writes=[];
  const start=runtime.indexOf('async function chooseCombatPreparedSpell(');
  const stop=runtime.indexOf('async function stepCombatSpellEffect(',start);
  if(start<0||stop<start)throw Error('Spell preparation missing');
  const scope={
   combatants:[x.actor],combatChosenAction:()=>action,combatCannotAct:()=>false,
   combatActionDefinition:()=>({key:'spell_cast'}),
   combatSpellOptions:()=>x.common.options(x.actor),combatSpellKey:x.common.combatSpellKey,
   combatMagicCastPreflight:(_c,_spell,eg)=>({valid:true,errors:[],rule:{category:'summon'},psy_cost:eg,
    casting:{effect_grade:eg,quick:false}}),
   combatMagicBinding:()=>({kind:'manual',supported:true}),
   activeCombat:{id:'battle'},dbJson:async (path,opts)=>{writes.push(JSON.parse(opts.body));return []},
   alert:vi.fn(),renderCombat:vi.fn(),console
  };
  runInNewContext(runtime.slice(start,stop)+'this.select=chooseCombatPreparedSpell;',scope);
  await scope.select(x.actor.id,x.common.combatSpellKey(item));
  expect(writes).toHaveLength(1);
  const data=writes[0].source_data;
  expect(data.effect_grade).toBe(1);
  expect(data.spell_fv).toBe(5);
  expect(data.psy_cost).toBe(0);
  expect(data.item_magic).toMatchObject({
   group:'weapons',item_id:'w1',power_id:'power-1',
   psy_source:'artifact',effect_multiplier:4
  });
 });
 it('registrerar föremålets förbrukning utan att dra PSY från bäraren',async()=>{
  const x=fixture();
  const t0=runtime.indexOf('function combatSpellActualPsyCost(');
  const t1=runtime.indexOf('async function combatSpendMagicPsy(',t0);
  expect(t0).toBeGreaterThan(-1);expect(t1).toBeGreaterThan(t0);
  const entry=x.item.weapons[0].magicPowers[0];
  let saved=0,psyPaid=0;
  const scope={
   window:x.common.window,
   chars:[{_dbId:'char',...x.item}],
   campaignDayState:{day_number:10},
   save:()=>{saved++},
   combatMagicPsyCost:(_result,eg)=>eg,
   combatSpendMagicPsy:async(_actor,cost)=>{psyPaid+=cost}
  };
  runInNewContext(runtime.slice(t0,t1)+'this.actual=combatSpellActualPsyCost;this.pay=combatPayForSpell;',scope);
  const action={source_data:{item_magic:{
   group:'weapons',item_id:'w1',power_id:'power-1',psy_source:'artifact'}}};
  const cost=scope.actual(action,'success',1);
  expect(cost).toBe(0);
  await scope.pay({source_id:'char'},cost,action);
  expect(saved).toBe(1);
  expect(psyPaid).toBe(0);
  expect(entry.last_used_day).toBe(10);
  await expect(scope.pay({source_id:'char'},cost,action)).rejects.toThrow('nästa kampanjdag');
  scope.campaignDayState.day_number=11;
  await scope.pay({source_id:'char'},cost,action);
  expect(entry.last_used_day).toBe(11);
  const learned={source_data:{}};
  await scope.pay({source_id:'char'},scope.actual(learned,'success',2),learned);
  expect(psyPaid).toBe(2);
 });
 it('lägger inte till besvärjelsen i rollpersonens inlärda lista',()=>{
  const x=fixture(),before=JSON.stringify(x.item.spells);
  x.api.list(x.item,[spell],10);
  expect(JSON.stringify(x.item.spells)).toBe(before);
 });
 it('skyddar mot att välja en föremålsförmåga med utgången tillgänglighet',()=>{
  expect(runtime).toContain("if(item&&(!item.ready||item.cast_mode==='automatic'||!(Number(item.fv)>0)))");
  expect(runtime).toContain("if(action.source_data?.item_magic)return;");
  expect(runtime).toContain("psy_source:item.psy_source");
  expect(runtime).toContain("combatRecordItemMagicUse");
 });
});
