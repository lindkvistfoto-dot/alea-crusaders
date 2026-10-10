import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');

const mapStart=runtime.indexOf('function renderCombatMap(){');
const mapEnd=runtime.indexOf('// Stridsdeltagare bär sitt porträtt',mapStart);
const cardStart=runtime.indexOf('function combatantCard(');
const cardEnd=runtime.indexOf('/* Kombatantdetaljer:',cardStart);
if(mapStart<0||mapEnd<mapStart||cardStart<0||cardEnd<cardStart){
 throw new Error('Combat map or participant renderer not found');
}

const hero={id:'hero',name_snapshot:'Astrid',source_type:'character',side:'heroes',status:'active',q:0,r:0,state:{}};
const enemy={id:'enemy',name_snapshot:'Skelettvakt',source_type:'monster',side:'enemies',status:'active',q:1,r:0,state:{}};
function mapFor(rows,activeId){
 const ctx={
  combatRuntimeGeometry:()=>({size:42,width:500,height:400,xPitch:80,rowPitch:70,offsetX:0,offsetY:0}),
  combatMapEnsureView:()=>{},
  combatMapViewBox:()=>({x:0,y:0,width:500,height:400}),
  combatRuntimeHexCells:()=>[
   {key:'0,0',q:0,r:0,x:100,y:100,movement_mode:'normal',sight_mode:'clear'},
   {key:'1,0',q:1,r:0,x:180,y:100,movement_mode:'normal',sight_mode:'clear'}
  ],
  combatActiveActor:()=>rows.find(c=>c.id===activeId),
  combatMovementPlanningActor:()=>null,
  combatCurrentAttackTargets:()=>new Map(),
  combatAreaPlacementActive:false,
  combatCanManage:()=>false,
  combatChosenAction:()=>null,
  combatGmPlacementId:null,
  combatAreaDraftCenter:null,
  combatFootprintCells:c=>[{q:c.q,r:c.r}],
  combatFootprintKey:pos=>pos.q+','+pos.r,
  combatTerrainIsWall:()=>false,
  combatAreasForHex:()=>[],
  combatMapView:{zoom:1},
  combatants:rows,
  combatSelectedTargetId:null,
  combatIsMovementPlanning:()=>false,
  combatIsActiveTurn:c=>c.id===activeId,
  combatHexPoints:(x,y,size)=>x+','+y+','+size,
  combatPlayerMiniatureSvg:()=>'<g class="test-miniature"></g>',
  combatMiniatureDefs:()=>'<defs></defs>',
  combatRuntimeMapUrl:'',
  combatTokenInitials:()=> 'AS',
  escAttr:x=>String(x),
 };
 runInNewContext(runtime.slice(mapStart,mapEnd)+'\nthis.draw=renderCombatMap;',ctx);
 return ctx.draw();
}
function cardFor(actor,activeId){
 const ctx={
  combatSelectedTargetId:null,
  combatIsActiveTurn:c=>c.id===activeId,
  combatCurrentAttackTargets:()=>new Map(),
  combatMovementBudget:()=>4,
  combatMovementMaximum:()=>8,
  combatNumber:(value,fallback)=>value==null?fallback:Number(value),
  combatMentalStatusLabel:()=>null,
  combatIsMovementPlanning:()=>false,
  combatIsFlying:()=>false,
  combatActiveEffects:[],
  combatEffectIsActive:()=>false,
  combatRowPortraitHtml:()=>'<span class="portrait"></span>',
  escAttr:x=>String(x),
 };
 runInNewContext(runtime.slice(cardStart,cardEnd)+'\nthis.draw=combatantCard;',ctx);
 return ctx.draw(actor,0);
}
describe('Aktiv kombatants tydliga turmarkering',()=>{
 it('visar bara en förankrad guldhalo och TUR-badge på den som agerar',()=>{
  const svg=mapFor([hero,enemy],'hero');
  expect(svg.match(/class="combat-active-turn-aura"/g)).toHaveLength(1);
  expect(svg.match(/class="combat-active-turn-outline"/g)).toHaveLength(1);
  expect(svg.match(/class="combat-active-turn-badge"/g)).toHaveLength(1);
  expect(svg).toContain('combat-token-group active-turn" data-token-id="hero"');
  expect(svg).not.toContain('combat-token-group active-turn" data-token-id="enemy"');
  expect(svg).toContain('translate(123.94 71.86) scale(1)');
 });
 it('byter automatiskt markering när turen går till fienden',()=>{
  const svg=mapFor([hero,enemy],'enemy');
  expect(svg).toContain('combat-token-group active-turn" data-token-id="enemy"');
  expect(svg).not.toContain('combat-token-group active-turn" data-token-id="hero"');
  expect(svg.match(/class="combat-active-turn-badge"/g)).toHaveLength(1);
 });
 it('visar inte guldhalon på besegrad kombatant',()=>{
  expect(mapFor([{...hero,status:'dead'}],'hero')).not.toContain('class="combat-active-turn-aura"');
 });
 it('markerar aktuell tur i turordningen utan att ändra andras rader',()=>{
  expect(cardFor(hero,'hero')).toContain('PÅ TUR');
  expect(cardFor(hero,'hero')).toContain('combatant-card player-row active-turn');
  expect(cardFor(enemy,'hero')).not.toContain('PÅ TUR');
  expect(cardFor(enemy,'enemy')).toContain('PÅ TUR');
 });
 it('bevarar lagfärgerna och respekterar inställningar för reducerad rörelse',()=>{
  expect(css).toContain('.combat-portrait-hex.npc-mini:not(.selected):not(.attack-target)');
  expect(css).toContain('.combat-portrait-hex.enemy-mini:not(.selected):not(.attack-target)');
  expect(css).toContain('.combat-map-svg .combat-active-turn-aura');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('.combat-map-svg .combat-active-turn-aura{animation:none;opacity:1}');
 });
});
