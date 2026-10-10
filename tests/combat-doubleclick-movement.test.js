import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function sourceOf(name){
 const from=runtime.indexOf('function '+name+'(');
 if(from<0)throw Error('Missing '+name);
 const end=runtime.indexOf('\nfunction ',from+1);
 return runtime.slice(from,end<0?undefined:end);
}
function fixture(){
 let now=1000,commits=0,renders=0,resets=0,planning=true,type='mouse',allowed=true,committing=false,plan=null;
 const actor={id:'actor-1'};
 let underPointer={q:2,r:3,x:100,y:100};
 const code=`
 let combatMovementLastClick=null,combatMapSuppressClickUntil=0,combatMapLastPointerType='mouse',
     combatMovementCommitting=false,combatGmPlacementId=null,combatAreaPlacementActive=false;
 const Date={now:()=>deps.now()};
 const combatMovementPlanningActor=()=>deps.planning()?{id:'actor-1'}:null;
 const combatSetMovementPreview=(q,r,{render=true}={})=>deps.select(q,r,render);
 const commitCombatMovementPlan=()=>deps.commit();
 const combatMapResetView=()=>deps.reset();
 const combatSvgPoint=(event)=>({x:event.clientX,y:event.clientY});
 const combatNearestRuntimeCell=()=>deps.cell();
 const combatRuntimeGeometry=()=>({size:50});
 `+sourceOf('previewCombatMovementToHex')+'\n'+sourceOf('combatMapDoubleClick')+`
 return {
  click:(event,q,r)=>{combatMapLastPointerType=deps.type();return previewCombatMovementToHex(event,q,r)},
  dblclick:(event)=>{combatMapLastPointerType=deps.type();return combatMapDoubleClick(event)},
  block:(v)=>{combatMovementCommitting=v},
  record:()=>combatMovementLastClick
 }`;
 const run=new Function('deps',code)({
  now:()=>now,planning:()=>planning,type:()=>type,
  select:(q,r,render)=>{
   if(!allowed||q!==2||r!==3)return false;
   plan={q,r};if(render)renders++;
   return true
  },
  commit:()=>{commits++;return Promise.resolve('moved')},
  reset:()=>{resets++},
  cell:()=>underPointer
 });
 const click=(detail=1,q=2,r=3)=>run.click({detail,stopPropagation(){}},q,r);
 const dblclick=(x=100,y=100,target=null)=>run.dblclick({
  clientX:x,clientY:y,currentTarget:{},target:target||{closest:()=>null},
  preventDefault(){},stopPropagation(){}
 });
 return {click,dblclick,run,advance:n=>now+=n,type:t=>type=t,allow:v=>allowed=v,planning:v=>planning=v,block:v=>run.block(v),counts:()=>({commits,renders,resets,plan})};
}
describe('Desktop double-click to confirm movement',()=>{
 it('a single click previews; a second click on the same reachable hex commits',async()=>{
  const f=fixture();
  expect(f.click()).toBe(true);
  expect(f.counts()).toMatchObject({commits:0,renders:1,plan:{q:2,r:3}});
  f.advance(190);
  await f.click();
  expect(f.counts().commits).toBe(1);
  // Native dblclick after the second click must not reset zoom.
  f.block(true);
  f.dblclick();
  expect(f.counts()).toMatchObject({commits:1,resets:0});
 });
 it('a native dblclick on the new SVG commits when the polygon was replaced',async()=>{
  const f=fixture();f.click();
  f.advance(160);
  await f.dblclick();
  expect(f.counts()).toMatchObject({commits:1,resets:0});
 });
 it('ignores doubleclicks outside the clicked hex or on a token',()=>{
  const f=fixture();f.click();
  f.dblclick(180,180);
  expect(f.counts().commits).toBe(0);
  f.dblclick(100,100,{closest:s=>s==='.combat-token-group'?{}:null});
  expect(f.counts().commits).toBe(0);
 });
 it('rejects blocked destinations and does not double-move',()=>{
  const f=fixture();f.allow(false);
  expect(f.click()).toBe(false);
  f.dblclick();
  expect(f.counts().commits).toBe(0);
  f.allow(true);f.block(true);
  f.click();f.advance(120);f.dblclick();
  expect(f.counts().commits).toBe(0)
 });
 it('keeps touch clicks from causing movement and the normal map reset outside movement mode',()=>{
  const f=fixture();f.type('touch');f.click();f.advance(100);f.click();
  expect(f.counts().commits).toBe(0);
  f.planning(false);f.dblclick();
  expect(f.counts()).toMatchObject({commits:0,resets:1})
 });
});
