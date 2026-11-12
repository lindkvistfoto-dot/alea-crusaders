import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');

function archiveHarness(resultRows){
 const calls=[];
 const context={
  centralCampaignId:'campaign-1',Date,encodeURIComponent,
  dbJson:async(path,options)=>{calls.push({path,options});return resultRows}
 };
 const start=runtime.indexOf('async function combatArchiveRuntime(');
 const end=runtime.indexOf('\nfunction combatRollD10()',start);
 if(start<0||end<0)throw new Error('combatArchiveRuntime function not found');
 runInNewContext(runtime.slice(start,end)+'\nthis.archive=combatArchiveRuntime;',context);
 return{archive:context.archive,calls}
}

describe('Combat reset and close recovery',()=>{
 test('new combat writes only columns present in combat_instances',()=>{
  const creator=runtime.slice(runtime.indexOf('async function combatCreateRuntimeFromScene('),runtime.indexOf('\nasync function combatStartScene(',runtime.indexOf('async function combatCreateRuntimeFromScene(')));
  expect(creator).not.toContain('session_id');
  expect(creator).not.toContain('aleaGetActiveGameSessionId');
  expect(creator).toContain('event_id:scene.source_event_id||null');
  expect(creator).toContain('campaign_id:centralCampaignId');
 });

 test('reset archives the replaced runtime instead of deleting its history',()=>{
  const start=runtime.indexOf('async function combatStartScene(');
  const end=runtime.indexOf('\nfunction combatIsResetReadyForPlay(',start);
  const lifecycle=runtime.slice(start,end);
  expect(lifecycle).toContain('combatArchiveRuntime(previousCombatId,previousCombatStatus)');
  expect(lifecycle).not.toContain('combatDeleteRuntime(previousCombatId)');
  expect(runtime).toContain("status:'completed',completed_at:now,updated_at:now");
 });

 test('archive changes only the instance status and preserves its existing log and statistics rows',async()=>{
  const{archive,calls}=archiveHarness([{id:'fight-1',status:'completed'}]);
  await archive('fight-1','active');
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toContain('combat_instances?id=eq.fight-1');
  expect(calls[0].path).toContain('campaign_id=eq.campaign-1');
  expect(calls[0].path).toContain('status=eq.active');
  expect(calls[0].options.method).toBe('PATCH');
  expect(JSON.parse(calls[0].options.body).status).toBe('completed');
  expect(calls[0].options.body).not.toContain('DELETE');
 });

 test('completed report can close back to the page that opened combat',()=>{
  expect(runtime).toContain('onclick="closeCombat()" aria-label="Stäng avslutad strid');
  expect(runtime).toContain("if(combatReturn==='map'){$('mapPage').classList.remove('hidden')}");
  expect(runtime).toContain("if(activeCombat.status==='completed')");
 });

 test('reset leaves the scene prepared for Play and Play reactivates that instance',()=>{
  expect(runtime).toContain('resetReady:reset||prepare');
  expect(runtime).toContain('reset_ready_for_play:resetReady===true');
  expect(runtime).toContain("body:JSON.stringify({status:'active',phase:'initiative'");
  expect(runtime).toContain('async function resetCombatScene()');
 });
});
