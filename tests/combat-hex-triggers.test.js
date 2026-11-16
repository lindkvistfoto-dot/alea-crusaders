import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/sl-control-board.css');

function triggerHarness({triggers,path}={}){
 const calls=[];
 const context={
  activeCombat:{id:'combat-1',round_number:2,phase:'movement'},
  combatHexTriggers:triggers||[],combatFootprintKey:cell=>cell.q+','+cell.r,
  combatFootprintCells:(actor,q=actor.q,r=actor.r)=>[{q:Number(q),r:Number(r)}],
  encodeURIComponent,Date,console:{error(){},warn(){}},alert(){},
  dbJson:async(url,options)=>{calls.push({url,options});return [{id:'trigger-1'}]}
 };
 const start=runtime.indexOf('function combatEnteredHexKeys(');
 const end=runtime.indexOf('\nasync function combatRecordFullMoveAction(',start);
 if(start<0||end<0)throw new Error('Hex trigger movement helpers not found');
 runInNewContext(runtime.slice(start,end)+'\nthis.entered=combatEnteredHexKeys;this.trigger=combatTriggerHexEvents;',context);
 return{...context,calls,path}
}

describe('combat hex event triggers',()=>{
 test('detects cells entered along a movement route, excluding the starting cell',()=>{
  const{entered}=triggerHarness();
  const cells=entered({q:2,r:1},[{q:1,r:0},{q:1,r:1},{q:2,r:1}],0,0);
  expect([...cells]).toEqual(['1,0','1,1','2,1']);
  expect([...entered({q:1,r:0},[{q:1,r:0}],0,0)]).toEqual(['1,0']);
 });

 test('fires a private queued event when a route enters any selected trigger hex',async()=>{
  const triggers=[{id:'trigger-1',event_type:'gm_hex_trigger',message:'Fällan utlöses',details:{trigger_status:'armed',trigger_hexes:[{q:1,r:1},{q:3,r:2}]}}];
  const harness=triggerHarness({triggers});
  await harness.trigger({id:'hero-1',name_snapshot:'Astrid',q:0,r:0},[{q:1,r:0},{q:1,r:1}]);
  expect(harness.calls).toHaveLength(1);
  expect(harness.calls[0].url).toContain('event_type=eq.gm_hex_trigger');
  expect(harness.calls[0].url).toContain('trigger_status=eq.armed');
  expect(harness.calls[0].options.method).toBe('PATCH');
  expect(JSON.parse(harness.calls[0].options.body)).toMatchObject({event_type:'gm_event_pending',player_visible:false,details:{scope:'gm',queue_status:'pending',source:'hex_trigger',triggered_by:'hero-1',entered_hexes:[{q:1,r:1}]}});
 });

 test('does not fire an armed trigger when the route does not enter its hexes',async()=>{
  const harness=triggerHarness({triggers:[{id:'trigger-1',event_type:'gm_hex_trigger',details:{trigger_status:'armed',trigger_hexes:[{q:4,r:4}]}}]});
  await harness.trigger({id:'hero-1',q:0,r:0},[{q:1,r:0},{q:2,r:0}]);
  expect(harness.calls).toHaveLength(0);
 });

 test('stores triggers as private combat log rows and selects one or more map hexes',()=>{
  expect(runtime).toContain("event_type:'gm_hex_trigger',message,");
  expect(runtime).toContain('trigger_hexes:triggerHexes},player_visible:false');
  expect(runtime).toContain('combatHexTriggerPick(event,');
  expect(runtime).toContain('combatHexTriggerSelected.push(key)');
  expect(runtime).toContain('combatHexTriggerPlacement?\'onclick="combatHexTriggerPick(event,');
  expect(runtime).toContain('combatTriggerHexEvents(actor,route.path,fromQ,fromR)');
  expect(runtime).toContain("event_type:'gm_event_pending'");
  expect(runtime).toContain('combatDisarmHexTrigger');
  expect(css).toContain('.combat-hex.hex-trigger-selected');
 });
});
