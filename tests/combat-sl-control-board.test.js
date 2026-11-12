import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/sl-control-board.css');
const html=read('index.html');

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

 it('positions the expanded panel as an overlay without resizing the map',()=>{
  expect(css).toContain('.combat-below-map{position:relative');
  expect(css).toContain('.slcb-panel{');
  expect(css).toContain('position:absolute');
  expect(html).toContain('features/combat/sl-control-board.css?v=20261112-2');
  expect(runtime).toContain("'<div class=\"combat-below-map\">'+combatSlControlBoardHtml(logHtml)+");
 });
});
