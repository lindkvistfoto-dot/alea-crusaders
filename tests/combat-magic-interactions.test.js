import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function excerpt(start,end){
 const i=runtime.indexOf(start),j=runtime.indexOf(end,i+start.length);
 if(i<0||j<0)throw Error('Saknad kodsektion: '+start);
 return runtime.slice(i,j);
}
function load(start,end,globals,name){
 const ctx={...globals};
 runInNewContext(excerpt(start,end)+'\nthis.exposed='+name+';',ctx);
 return ctx;
}
const caster={id:'lyra',name_snapshot:'Lyra',status:'active'};
const ally={id:'astrid',name_snapshot:'Astrid',status:'active',visible_to_players:true};
const enemy={id:'orc',name_snapshot:'Orch',status:'active',visible_to_players:true};
const prepared={
 id:'cast1',combatant_id:'lyra',status:'planned',
 source_data:{action_key:'spell_cast',spell_prepared:true,casting_spell:true,
  spell_locked:true,ready_round:2,spell_key:'eld',effect_grade:2,spell_fv:16,
  magic_binding:{kind:'damage'},range_text:'S×10 rutor'}
};

describe('Klickbara magikontroller i strid',()=>{
 it('visar verkliga EG-knappar i magirutan ända fram till själva kastet',()=>{
  const ctx=load('function combatMagicFactHtml(', 'function combatMagicHeaderHtml(',{
   combatants:[caster],combatCanManage:()=>true,
   combatIsActiveTurn:c=>c.id==='lyra',escAttr:String
  },'combatMagicFactsHtml');
  const html=ctx.exposed(prepared.source_data,prepared);
  expect(html).toContain('EG · Effektgrad');
  expect(html).toContain('stepCombatSpellEffect');
  expect(html).toContain('Öka effektgrad');
  expect(html).toContain('Minska effektgrad');
  expect(html).toContain('CL');
  const resolved={...prepared,status:'resolved',result:{psy_cost:2}};
  expect(ctx.exposed(prepared.source_data,resolved)).not.toContain('stepCombatSpellEffect');
  expect(ctx.exposed({...prepared.source_data,item_magic:{item_name:'Stav'}},prepared))
   .not.toContain('stepCombatSpellEffect');
 });
 it('visar målknappar först under kast-SR och markerar valt mål',()=>{
  const ctx=load('function combatMagicTargetPickerHtml(', 'function combatMagicStatusHtml(',{
   activeCombat:{round_number:1},combatants:[caster,ally,enemy],
   combatCurrentAttackTargets:()=>new Map([['astrid',{}],['orc',{}]]),
   combatSelectedTargetId:null,escAttr:String
  },'combatMagicTargetPickerHtml');
  expect(ctx.exposed(caster,prepared)).toBe('');
  ctx.activeCombat.round_number=2;
  const html=ctx.exposed(caster,prepared);
  expect(html).toContain('Välj mål för besvärjelse');
  expect(html).toContain('Orch');
  expect(html).toContain('Astrid');
  expect(html).toContain('selectCombatTarget');
  ctx.combatSelectedTargetId='orc';
  expect(ctx.exposed(caster,prepared)).toContain('aria-pressed="true"');
 });
 it('giltiga skademål omfattar andra kombattanter men aldrig kastaren',()=>{
  const a={...prepared,source_data:{...prepared.source_data,effect_grade:1}};
  const ctx=load('function combatFireballTargets(', '// BESKYDDARE:',{
   combatants:[caster,ally,enemy,{id:'dead',status:'dead',visible_to_players:true}],
   combatActiveActor:()=>caster,combatChosenAction:()=>a,
   combatSpellRangeHexes:()=>10,combatFootprintDistance:()=>2,
   combatHasLineOfSight:()=>true,combatCanManage:()=>true
  },'combatFireballTargets');
  expect([...ctx.exposed().keys()]).toEqual(['astrid','orc']);
 });
 it('EG kan ändras i SR2 även om besvärjelsen är låst för omval',async()=>{
  const writes=[];
  const ctx=load('let combatSpellEffectUpdating=false;', 'function combatRowMagicMenuHtml(',{
   combatants:[caster],combatChosenAction:()=>prepared,combatCannotAct:()=>false,
   combatCanManage:()=>true,combatIsActiveTurn:()=>true,
   combatSpellOptions:()=>[{name:'ELD',id:'eld'}],combatSpellKey:()=> 'eld',
   combatMagicCastPreflight:()=>({valid:true,psy_cost:3}),
   combatMagicCastingRules:()=>({quick:false}),renderCombat:()=>{},
   dbJson:async (url,options)=>{writes.push({url,body:JSON.parse(options.body)});return []},
   alert:()=>{throw Error('Unexpected alert')},
  },'stepCombatSpellEffect');
  await ctx.exposed('lyra',1);
  expect(prepared.source_data.effect_grade).toBe(3);
  expect(prepared.source_data.ready_round).toBe(2);
  expect(writes[0].body.source_data.target_allocations).toEqual([]);
  expect(writes[0].body.source_data.psy_cost).toBe(3);
 });
});
