import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const sql=(name)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const schema=sql('20261008112000_haj_area_schema.sql');
const events=sql('20261008112100_haj_area_runtime.sql');
const undo=sql('20261008112200_haj_undo_safety.sql');
const path=sql('20261008112300_haj_path_movement.sql');
const from=src.indexOf('function combatAreaActive('),to=src.indexOf('async function combatLoadEffects(',from);
const moveFrom=src.indexOf('function combatReachableHexes('),moveTo=src.indexOf('async function combatRecordFullMoveAction(',moveFrom);
if(from<0||to<=from||moveFrom<0||moveTo<=moveFrom)throw Error('HAJ runtime not found');
const defs=[
 {id:'fire',name:'Eldområde',active:true,target_type:'area',code:'area_fire',modifiers:{type:'area_damage',damage_kind:'fire'}},
 {id:'fog',name:'Dimma',active:true,target_type:'area',code:'area_fog',modifiers:{type:'area_terrain',sight_mode:'obscuring'}},
 {id:'difficult',name:'Svår terräng',active:true,target_type:'area',code:'area_difficult',modifiers:{type:'area_terrain',movement_mode:'difficult'}},
 {id:'wall',name:'Magi vägg',active:true,target_type:'hex',code:'area_wall',modifiers:{type:'area_terrain',movement_mode:'blocked',sight_mode:'blocked'}}
];
const area=(effect_id,center_q=0,center_r=0,radius=0,extra={})=>({
 id:'area-'+effect_id,effect_id,center_q,center_r,radius,
 applied_round:2,expires_round:null,status:'active',parameters:{},...extra
});
const hex=(q,r,mode='free')=>({q,r,key:q+','+r,movement_mode:mode,sight_mode:'clear',movement_cost:mode==='difficult'?2:1});
function areaHarness(areas=[],round=2){
 const ctx={activeCombat:{round_number:round},combatAreaEffects:areas,combatEffectRegistry:defs,
 combatEffectDefinition:row=>defs.find(d=>d.id===row.effect_id),
 combatAxialDistance:(a,b)=>{let q=a.q-b.q,r=a.r-b.r;return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2},
 combatCanManage:()=>true};
 runInNewContext(src.slice(from,to)+
 '\nthis.haj={combatAreaActive,combatAreasForHex,combatAreaTerrainForHex,combatTickAreaStay};',ctx);
 return ctx.haj
}
function movementHarness(cells,budget=6){
 const ctx={activeCombat:{phase:'movement'},combatRuntimeHexCells:()=>cells,combatCannotMove:()=>false,
 combatMovementAllowance:()=>budget,combatFlightCapabilities:()=>({ignore_terrain:false}),
 combatHexNeighbors:(q,r)=>[[q+1,r],[q-1,r]],combatTerrainIsWall:c=>c.notes==='wall',
 combatMentalMovementAllowed:()=>true};
 runInNewContext(src.slice(moveFrom,moveTo)+'\nthis.movement={combatReachableHexes,combatMovementHexPath}',ctx);
 return ctx.movement
}
describe('HAJ: persistent hex and area effects',()=>{
 test('radius zero affects only the center hex',()=>{
  const h=areaHarness([area('fire',1,0,0)]);
  expect(h.combatAreasForHex(1,0).length).toBe(1);
  expect(h.combatAreasForHex(0,0).length).toBe(0);
  expect(h.combatAreasForHex(1,1).length).toBe(0)
 });
 test('radius one covers axial neighbors and excludes hexes beyond it',()=>{
  const h=areaHarness([area('fog',0,0,1)]);
  for(const [q,r] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]){
   expect(h.combatAreasForHex(q,r).length).toBe(1)
  }
  expect(h.combatAreasForHex(2,0).length).toBe(0)
 });
 test('overlapping area effects are composed without altering permanent map terrain',()=>{
  const h=areaHarness([area('fog',0,0,1),area('difficult',0,0,1)]);
  const effect=h.combatAreaTerrainForHex(0,1);
  expect(effect.movement).toBe('difficult');
  expect(effect.sight).toBe('obscuring');
  expect(h.combatAreaTerrainForHex(3,3).movement).toBe('free');
  expect(src).toContain('const areaTerrain=combatAreaTerrainForHex(q,r);')
 });
 test('blocked beats difficult, blocked sight beats fog',()=>{
  const h=areaHarness([area('fog'),area('difficult'),area('wall')]);
  const t=h.combatAreaTerrainForHex(0,0);
  expect(t.movement).toBe('blocked');
  expect(t.sight).toBe('blocked')
 });
 test('inactive or expired areas are not rendered or applied',()=>{
  const h=areaHarness([area('fog',0,0,1,{expires_round:2}),area('fire',0,0,1,{status:'removed'})],3);
  expect(h.combatAreasForHex(0,0).length).toBe(0)
 });
 test('the shortest planned path tracks all intermediate hexes',()=>{
  const actor={id:'actor',q:0,r:0};
  const cells=[hex(0,0),hex(1,0),hex(2,0),hex(3,0)];
  const pathResult=movementHarness(cells).combatMovementHexPath(actor,3,0);
  expect(pathResult?.cost).toBe(3);
  expect(JSON.stringify(pathResult.path)).toBe(JSON.stringify([{q:1,r:0},{q:2,r:0},{q:3,r:0}]))
 });
 test('pathfinding charges difficult terrain and stops at blocked terrain',()=>{
  const actor={id:'actor',q:0,r:0};
  const cells=[hex(0,0),hex(1,0,'difficult'),hex(2,0),hex(3,0)];
  expect(movementHarness(cells).combatMovementHexPath(actor,3,0)?.cost).toBe(4);
  expect(movementHarness([hex(0,0),hex(1,0,'blocked'),hex(2,0)]).combatMovementHexPath(actor,2,0)).toBeNull()
 });
 test('out-of-range destinations do not yield a fabricated movement route',()=>{
  const actor={id:'actor',q:0,r:0};
  expect(movementHarness([hex(0,0),hex(1,0)],0).combatMovementHexPath(actor,1,0)).toBeNull()
 });
 test('SQL uses triggers only on changed q/r, not on KP updates',()=>{
  expect(events).toContain('AFTER UPDATE OF q,r ON public.combatants');
  expect(events).toContain('OLD.q IS DISTINCT FROM NEW.q');
  expect(events).toContain("v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END");
  expect(events).toContain('private.haj_area_event')
 });
 test('per-round stay is unique and both its caller and event are transactional',()=>{
  expect(schema).toContain('CREATE UNIQUE INDEX IF NOT EXISTS combat_area_stay_once');
  expect(schema).toContain("WHERE event_type='stay'");
  expect(events).toContain('ON CONFLICT DO NOTHING RETURNING id INTO v_event_id');
  expect(events).toContain("'already_resolved'");
  expect(events).toContain('v_actor.current_round<>p_round');
  expect(src).toContain('await combatTickAreaStay(actor,currentRound);')
 });
 test('area damage and wards are resolved by the server under GM permissions',()=>{
  expect(events).toContain("private.is_campaign_gm(v_actor.campaign_id)");
  expect(events).toContain('v_net:=greatest(0,v_gross-v_ward)');
  expect(events).toContain('UPDATE public.combatants SET current_kp=v_after');
  expect(events).toContain('INSERT INTO public.combat_log')
 });
 test('atomic path movement validates old coordinates, points and every adjacent hex',()=>{
  expect(path).toContain('FOR v_step IN SELECT value FROM jsonb_array_elements(p_path)');
  expect(path).toContain('p_expected_remaining');
  expect(path).toContain('v_actor.q IS DISTINCT FROM p_from_q');
  expect(path).toContain("RAISE EXCEPTION 'Movement path contains a nonadjacent hex'");
  expect(path).toContain('v_flight');
  expect(path).toContain('v_remaining:=v_remaining-v_cost');
  expect(src).toContain("dbJson('rpc/haj_move_combatant'")
 });
 test('area center is selected on map and new zones persist in Supabase',()=>{
  expect(src).toContain('combatToggleAreaPlacement()');
  expect(src).toContain('combatChooseAreaCenter(event,');
  expect(src).toContain("dbJson('combat_area_effects'");
  expect(src).toContain("damage_on_enter:entered,damage_on_stay:stayed,damage_on_exit:exited");
  expect(src).toContain("'+combatAreasAdminHtml()+combatTurnPanelHtml()");
 });
 test('undo protects against artificial movement damage and restores area history',()=>{
  expect(undo).toContain("set_config('alea.haj_restore','on',true)");
  expect(undo).toContain("current_setting('alea.haj_restore',true)='on'");
  expect(main).toContain('rpc/haj_restore_combatant');
  expect(main).toContain('snapshot.area_event_max_id');
  expect(main).toContain('area_effects:(');
  expect(main).toContain('combat_area_events?combat_id=eq.');
 });
 test('registry is seeded for fire, poison, fog and difficult terrain',()=>{
  for(const key of ['area_fire','area_poison','area_fog','area_difficult'])expect(schema).toContain("'"+key+"'");
  expect(schema).toContain('ENABLE ROW LEVEL SECURITY');
  expect(schema).toContain('ON CONFLICT (code) DO NOTHING');
  expect(schema).toContain('GRANT SELECT,INSERT,UPDATE,DELETE ON public.combat_area_effects TO authenticated')
 });
});
