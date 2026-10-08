import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function code(from,to){
 const start=rt.indexOf(from),end=rt.indexOf(to,start+from.length);
 if(start<0||end<start)throw Error('Missing code '+from);
 return rt.slice(start,end)
}
const logic=code('function combatBeskyddareSideCells(', 'function combatMagicAreaCells(');
function harness(){
 const env={activeCombat:{round_number:8},
  combatAreaEffects:[],combatEffectDefinition:({effect_id})=>effect_id==='ward'?{code:'area_beskyddare',active:true,target_type:'area'}:null,
  combatAreaActive:row=>row.status==='active',
  combatHexLine:(a,b)=>{
   const distance=Math.abs(Number(b.q)-Number(a.q)),line=[];
   if(a.r!==b.r)throw Error('Test only straight axial line');
   for(let i=0;i<=distance;i++)line.push({q:Number(a.q)+Math.sign(b.q-a.q)*i,r:a.r});
   return line
  },
  combatAntimagicEgResistance:(a,d,roll)=>({target:10+a-d,roll,penetrates:roll<=10+a-d}),
  combatRollDice:async()=>({rolls:[{value:15}]})
 };
 runInNewContext(logic+'this.api={combatBeskyddareSideCells,combatBeskyddareDimensions,combatBeskyddareAreaParameters,combatIsBeskyddareArea,combatBeskyddareContains,combatBeskyddareCrossings,combatResolveBeskyddarePassage}',env);
 const area={id:'one',effect_id:'ward',center_q:0,center_r:0,radius:0,status:'active',
  parameters:env.api.combatBeskyddareAreaParameters({effect_grade:1},'spell1')};
 env.combatAreaEffects.push(area);
 return {env,area,api:env.api}
}
describe('BESKYDDARE · permanent kubisk spärr i båda riktningar',()=>{
 test('Kubens sidlängd är EG + 2 rutor, i alla tre dimensioner',()=>{
  const {api}=harness();
  expect(api.combatBeskyddareDimensions({effect_grade:1})).toEqual({x:3,y:3,z:3});
  expect(api.combatBeskyddareDimensions({effect_grade:4})).toEqual({x:6,y:6,z:6});
  expect(api.combatBeskyddareDimensions({effect_grade:3})).toEqual({x:5,y:5,z:5});
  const params=api.combatBeskyddareAreaParameters({effect_grade:2},'a');
  expect(params.cube_dimensions_cells).toEqual({x:4,y:4,z:4});
  expect(params.barrier_eg).toBe(1);
  expect(params.blocks_magic_both_directions).toBe(true);
 });
 test('barriären stoppar passage från insida till utsida och omvänt, men inte magi inuti',()=>{
  const {api,area}=harness();
  expect(api.combatBeskyddareContains(area,{q:0,r:0})).toBe(true);
  expect(api.combatBeskyddareContains(area,{q:4,r:0})).toBe(false);
  expect(api.combatBeskyddareCrossings({q:0,r:0},{q:4,r:0})).toHaveLength(1);
  expect(api.combatBeskyddareCrossings({q:4,r:0},{q:0,r:0})).toHaveLength(1);
  expect(api.combatBeskyddareCrossings({q:-4,r:0},{q:4,r:0})).toHaveLength(1);
  expect(api.combatBeskyddareCrossings({q:0,r:0},{q:1,r:0})).toHaveLength(0);
  expect(api.combatBeskyddareCrossings({q:3,r:0},{q:4,r:0})).toHaveLength(0);
 });
 test('motstånd EG mot EG avgör om en framgångsrik besvärjelse passerar',async()=>{
  const {api,env}=harness();
  const a=await api.combatResolveBeskyddarePassage({q:0,r:0},{q:4,r:0},2);
  expect(a.blocked).toBe(true);
  expect(a.checks[0]).toMatchObject({incoming_eg:2,barrier_eg:1,roll:15});
  env.combatRollDice=async()=>({rolls:[{value:4}]});
  const b=await api.combatResolveBeskyddarePassage({q:4,r:0},{q:0,r:0},2);
  expect(b.blocked).toBe(false);
 });
 test('besvärjelse styrs till områdesmotor även om den är en ritual',()=>{
  const src=code('function combatMagicBinding(', 'function combatMagicDamageFormula(');
  const x={};runInNewContext(src+'this.binding=combatMagicBinding',x);
  expect(x.binding({name:'BESKYDDARE',ritual:true})).toMatchObject({
   kind:'area',cube:true,code:'area_beskyddare',ritual:true,supported:true
  })
 });
 test('området visas som kub med dess tre mått',()=>{
  expect(rt).toContain("const shape=combatIsBeskyddareArea(a)");
  expect(rt).toContain("codes.some(x=>x==='area_beskyddare')");
 });
});
