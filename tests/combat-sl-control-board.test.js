import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/sl-control-board.css');
const html=read('index.html');
const library=read('features/combat/battlefield-library.js');

function closedBoardMarkup({canManage=true}={}){
 const start=runtime.indexOf('function combatSlControlBoardHtml(logHtml){');
 const end=runtime.indexOf('function combatSelectGmPlacement(',start);
 const env={combatCanManage:()=>canManage,activeCombat:{name:'Teststrid',round_number:2},combatSlBoardOpen:false,combatSlBoardTab:'overview',escAttr:value=>String(value)};
 runInNewContext(runtime.slice(start,end)+'\nthis.renderBoard=combatSlControlBoardHtml;',env);
 return env.renderBoard('');
}

describe('SL Control Board integration',()=>{
 it('starts as a thin closed control strip and is restricted to the GM',()=>{
  const markup=closedBoardMarkup();
  expect(markup).toContain('aria-expanded="false"');
  expect(markup).toContain('aria-controls="slControlBoardPanel"');
  expect(markup).not.toContain('id="slControlBoardPanel"');
  expect(closedBoardMarkup({canManage:false})).toBe('');
 });

 it('routes scene, combatant, terrain, effect and log tools through existing combat data',()=>{
  expect(runtime).toContain('combatGmControls');
  expect(runtime).toContain('combatGmPlacementHtml()+combatSummonPanelHtml()');
  expect(runtime).toContain('combatAreasAdminHtml()');
  expect(runtime).toContain('combatEffectsAdminHtml()+combatAmmoSummaryHtml()');
  expect(runtime).toContain('combatSlBoardToggle(){');
  expect(runtime).toContain('combatSlBoardNavigate(tab){');
  expect(runtime).not.toContain('sl_control_board_instances');
 });

 it('places reusable terrain presets through the existing combat hexes and movement/LoS model',()=>{
  const env={window:{}};
  runInNewContext(library,env);
  const lib=env.window.aleaBattlefieldLibrary;
  expect(lib.entries().length).toBeGreaterThan(4);
  expect(lib.get('stone-wall').assetKey).toBe('arcane-battlefield-stone-wall');
  expect(lib.terrainPayload(lib.get('dense-forest'),{notes:'scene note'})).toEqual({movement_mode:'difficult',sight_mode:'obscuring',movement_cost:2,notes:'scene note'});
  expect(runtime).toContain("combat_hexes?'+base+'&select=id,notes&limit=1");
  expect(runtime).toContain("cls.push('battlefield-placement-hex')");
  expect(runtime).toContain('combatApplyBattlefieldPreset(event,' );
  expect(library).not.toContain('fetch(');
  lib.registerExternal([{object_key:'wall-segment-prototype',name:'Mursegment',category:'Murar',asset_key:'arcane-battlefield-wall-prototype',footprint:[{q:0,r:0}],connector_edges:[0,3],movement_mode:'blocked',sight_mode:'blocked',max_damage:10}]);
  const wall=lib.get('wall-segment-prototype');
  expect(wall.placement_mode).toBe('object');
  expect(wall.connector_edges).toEqual([0,3]);
  expect(lib.objectPayload(wall,{q:2,r:-1,rotation:4,damage:3})).toMatchObject({object_key:'wall-segment-prototype',q:2,r:-1,rotation:4,damage:3,max_damage:10,properties:{movement_mode:'blocked',sight_mode:'blocked'}});
 });

 it('provides pause and resume by updating the current combat instance with an expected status',()=>{
  expect(runtime).toContain('function combatTogglePauseResume(){');
  expect(runtime).toContain("const combatId=String(activeCombat.id),previousStatus=activeCombat.status,nextStatus=previousStatus==='active'?'paused':'active'");
  expect(runtime).toContain("'&status=eq.'+encodeURIComponent(previousStatus)+'&select=id,status'");
  expect(runtime).toContain('combatTogglePauseResume()');
 });

 it('keeps SL notes private and changes player visibility on existing combatants',()=>{
  expect(runtime).toContain("event_type:'gm_note'");
  expect(runtime).toContain('player_visible:false');
  expect(runtime).toContain("combatants?id=eq.'+encodeURIComponent(row.id)+'&combat_id=eq.'+encodeURIComponent(activeCombat.id)");
  expect(runtime).toContain("visible_to_players:visible");
  expect(runtime).toContain("['secrets','SL-info']");
 });

 it('queues manual events privately and exposes them only after a conditional SL approval',()=>{
  expect(runtime).toContain('or=(event_type.neq.gm_event_pending,details->>queue_status.eq.pending)');
  expect(runtime).toContain("event_type:'gm_event_pending'");
  expect(runtime).toContain("details:{scope:'gm',queue_status:'pending',due_round:dueRound},player_visible:false");
  expect(runtime).toContain("event_type=eq.gm_event_pending&details->>queue_status=eq.pending&select=id");
  expect(runtime).toContain("item.event_type==='gm_event_pending'&&item.details?.queue_status==='pending'");
  expect(runtime).toContain("event_type:'gm_event',player_visible:true");
  expect(runtime).toContain('combatCanManage()||!activeCombat?.id||combatQueuedEventBusy');
  expect(runtime).toContain('combatQueueManualEvent()');
  expect(runtime).toContain('combatApproveQueuedEvent(');
  expect(runtime).toContain('combatCancelQueuedEvent(');
 });

 it('positions the expanded panel as an overlay without resizing the map',()=>{
  expect(css).toContain('.combat-below-map{position:relative');
  expect(css).toContain('.slcb-panel{');
  expect(css).toContain('position:absolute');
  expect(html).toContain('features/combat/sl-control-board.css?v=20261112-5');
  expect(html).toContain('features/combat/battlefield-library.js?v=20261112-2');
  expect(runtime).toContain("'<div class=\"combat-below-map\">'+combatSlControlBoardHtml(logHtml)+");
 });
});
