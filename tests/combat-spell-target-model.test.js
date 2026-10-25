import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');
function portion(start,end){
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a+start.length);
 if(a<0||b<0)throw Error('Missing code: '+start);
 return runtime.slice(a,b)
}

describe('magiska målmodellen',()=>{
 it('keeps the three registered target categories and uses center-only when radius is not explicit',()=>{
  const helper=portion('function combatSpellTargetType(', 'function combatMagicCastingRules(');
  const ctx={};runInNewContext(helper+'this.type=combatSpellTargetType;this.radius=combatSpellRadiusHexes;',ctx);
  expect(ctx.type({target_type:'combatant'})).toBe('combatant');
  expect(ctx.type({target_type:'hexagon'})).toBe('hexagon');
  expect(ctx.type({target_type:'other'})).toBe('other');
  expect(ctx.type({magic_binding:{kind:'area'}})).toBe('hexagon');
  expect(ctx.radius({effect_grade:3,target_text:'Ingen radie angiven'})).toBe(0);
  expect(ctx.radius({effect_grade:3,target_text:'Radie Sx2 rutor'})).toBe(6);
  expect(ctx.radius({effect_grade:3,target_text:'Radie 2 hex'})).toBe(2);
 });

 it('parses only explicit reach and leaves unknown reach to the GM',()=>{
  const code=portion('function combatSpellExplicitRangeHexes(', 'function combatFireballTargets(');
  const ctx={
   activeCombat:{settings:{hex_m:2}},combatActiveSceneId:()=> 'scene-a',combatCanManage:()=>false,
   combatRuntimeHexCells:()=>[{q:0,r:0},{q:1,r:0}],combatAxialDistance:()=>1,
   combatFootprintDistance:()=>1,combatHasLineOfSight:()=>true,
   combatAttackProfile:()=>({sty:12,smi:10}),combatNumber:Number
  };
  runInNewContext(code+'this.explicit=combatSpellExplicitRangeHexes;this.status=combatMagicHexRangeStatus;',ctx);
  const actor={q:0,r:0},action={source_data:{effect_grade:3,range_text:'Sx4 rutor'}};
  expect(ctx.explicit(actor,action)).toBe(12);
  expect(ctx.explicit(actor,{source_data:{range_text:'12 m'}})).toBe(6);
  expect(ctx.status(actor,{source_data:{range_text:'okänd räckvidd'}},{q:1,r:0}))
   .toMatchObject({valid:false,unresolved:true,range:null});
  ctx.combatCanManage=()=>true;
  expect(ctx.status(actor,{source_data:{range_text:'okänd räckvidd'}},{q:1,r:0}))
   .toMatchObject({valid:true,unresolved:true});
 });

 it('persists a validated hex, map identity, and current effect radius in the prepared action',async()=>{
  const writes=[];
  const actor={id:'mage',q:0,r:0},action={id:'action-1',status:'planned',source_data:{
   casting_spell:true,target_type:'hexagon',ready_round:2,effect_grade:2,area_radius:3
  }};
  const ctx={
   combatants:[actor],activeCombat:{id:'combat-1',round_number:2},combatMagicHexHover:null,
   combatChosenAction:()=>action,combatSpellTargetType:data=>data.target_type,
   combatRuntimeHexCells:()=>[{q:2,r:-1}],combatMagicHexRangeStatus:()=>({valid:true,unresolved:false}),
   combatSpellRadiusHexes:data=>data.area_radius,combatActiveSceneId:()=> 'scene-a',
   combatIsActiveTurn:()=>true,combatCannotAct:()=>false,combatCanManage:()=>true,
   dbJson:async(url,options)=>{writes.push({url,body:JSON.parse(options.body)});return []},
   encodeURIComponent,Date,renderCombat:()=>{}
  };
  runInNewContext(portion('async function combatSetMagicTargetHex(', 'function combatMagicTargetAllocations(')+
   'this.select=combatSetMagicTargetHex;',ctx);
  await ctx.select('mage',2,-1);
  expect(action.source_data.spell_target).toMatchObject({
   type:'hexagon',map_id:'scene-a',center:{q:2,r:-1},coordinates:{q:2,r:-1},radius:3
  });
  expect(writes).toHaveLength(1);
  expect(writes[0].body.source_data).toMatchObject({target_type:'hexagon',target_mode:'hex_area'});
 });

 it('requires a person target for manual combatant spells while other spells remain targetless',()=>{
  const target={id:'guard',q:1,r:0,status:'active'};
  const actor={id:'mage',q:0,r:0};
  const ctx={activeCombat:{round_number:2},combatSpellTargetType:data=>data.target_type,
   combatIsActiveTurn:()=>true,combatCannotAct:()=>false,combatSpellRangeHexes:()=>3,
   combatAxialDistance:()=>1,combatSpellEffectTargets:()=>[target]};
  runInNewContext(portion('function combatMagicTargetIsReady(', 'function combatToggleMagicTargetPicker(')+
   'this.ready=combatMagicTargetIsReady;this.candidates=combatMagicTargetCandidates;',ctx);
  const manual={status:'planned',source_data:{casting_spell:true,ready_round:2,target_type:'combatant',magic_binding:{kind:'manual'}}};
  expect(ctx.ready(actor,manual)).toBe(true);
  expect(ctx.candidates(actor,manual).has('guard')).toBe(true);
  const other={...manual,source_data:{...manual.source_data,target_type:'other'}};
  expect(ctx.ready(actor,other)).toBe(false);
  expect(ctx.candidates(actor,other).size).toBe(0);
 });

 it('shows hover preview before a click without requiring a tracked drag pointer',()=>{
  const action={status:'planned',source_data:{casting_spell:true,target_type:'hexagon'}};
  const state={updated:0};
  const ctx={
   combatMovementDrag:null,combatMapLastPointerType:'mouse',combatMapPointers:new Map(),
   combatMapPan:null,combatMagicHexHover:null,combatActiveActor:()=>({id:'mage'}),
   combatChosenAction:()=>action,combatSpellTargetType:data=>data.target_type,state,
   combatMapUpdateMagicHexHover:()=>{state.updated++},
   combatSvgPoint:()=>null,combatNearestRuntimeCell:()=>null,
   combatMapViewGeometry:()=>null
  };
  runInNewContext(portion('function combatMapPointerMove(', 'function combatMapPointerEnd(')+
   'this.move=combatMapPointerMove;',ctx);
  ctx.move({pointerType:'mouse',pointerId:1,target:{dataset:{q:'4',r:'-2'},closest:()=>({dataset:{q:'4',r:'-2'}})}});
  expect(ctx.combatMagicHexHover).toEqual({q:4,r:-2});
  expect(state.updated).toBe(1);
 });

 it('renders dedicated hover, selected-center, and connected effect-area marks',()=>{
  expect(runtime).toContain('function combatMagicHexTargetOverlayHtml(');
  expect(runtime).toContain("'spell-hex-center'");
  expect(runtime).toContain("'spell-hex-area'");
  expect(runtime).toContain('onpointerleave="combatMapPointerLeave(event)"');
  expect(runtime).toContain('combatSetMagicTargetHex');
  expect(css).toContain('@media(prefers-reduced-motion:reduce){.combat-map-svg .spell-hex-center{animation:none}}');
 });
});
