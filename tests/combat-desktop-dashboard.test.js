import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const runtime=read('features/combat/runtime.js');
const compact=read('features/combat/desktop-tight.css');

function gmControlMarkup({admin=true,status='active',preview=false,busy=false}={}){
 const start=runtime.indexOf('function renderCombatGmControls(){');
 const end=runtime.indexOf('function combatNumber(',start);
 expect(start).toBeGreaterThan(-1);
 const host={classList:{add(){},remove(){}},innerHTML:''};
 const scene={id:'scene1',name:'Testscen'};
 const env={
  $:id=>id==='combatGmControls'?host:null,
  combatCanManage:()=>admin,
  campaignCombatScenes:[scene],
  combatSelectedSceneId:'scene1',
  combatActiveSceneId:()=>scene.id,
  combatSceneFromId:()=>scene,
  combatSceneSelectionIsPreview:()=>preview,
  combatSceneBusy:busy,
  combatStopBusy:false,
  activeCombat:{id:'fight1',status,name:'Test',round_number:3,phase:'active',settings:{}},
  combatIsResetReadyForPlay:()=>false,
  combatPhaseLabel:()=> 'Pågår',
  escAttr:x=>String(x)
 };
 runInNewContext(runtime.slice(start,end)+'\nthis.callControls=renderCombatGmControls;',env);
 env.callControls();
 return host.innerHTML;
}

describe('Desktop combat compact dashboard and GM stop action',()=>{
 it('removes the redundant title, back button and old stop button in page header',()=>{
  const p=html.slice(html.indexOf('<section id="combatPage"'),html.indexOf('<section id="mapPage"'));
  expect(p).toContain('id="combatSubtitle"');
  expect(p).not.toContain('class="combathead"');
  expect(p).not.toContain('<h2>⚔ Strid</h2>');
  expect(p).not.toContain('onclick="closeCombat()"');
  expect(p).not.toContain('id="combatStopBtn"');
  expect(p).toContain('id="combatBody"');
 });
 it('keeps Stop directly beside Play and Reset in SL controls when battle is running',()=>{
  const control=gmControlMarkup();
  expect(control).toContain('id="combatPlayBtn"');
  expect(control).toContain('id="combatResetBtn"');
  expect(control).toContain('id="combatStopBtn"');
  expect(control).toContain('onclick="combatFinishAndRecover()"');
  expect(control.indexOf('id="combatStopBtn"')).toBeGreaterThan(control.indexOf('id="combatResetBtn"'));
 });
 it('shows no finish button to players, in previews, or after combat is finished',()=>{
  expect(gmControlMarkup({admin:false})).toBe('');
  expect(gmControlMarkup({preview:true})).not.toContain('id="combatStopBtn"');
  expect(gmControlMarkup({status:'completed'})).not.toContain('id="combatStopBtn"');
  expect(gmControlMarkup({status:'setup'})).not.toContain('id="combatStopBtn"');
  expect(gmControlMarkup({status:'paused'})).toContain('id="combatStopBtn"');
 });
 it('preserves end-battle RPC, projectile recovery and confirmation',()=>{
  const finish=runtime.slice(runtime.indexOf('async function combatFinishAndRecover()'),runtime.indexOf('function combatAttackWeaponOptions(',runtime.indexOf('async function combatFinishAndRecover()')));
  expect(finish).toContain("askConfirm('Avsluta striden'");
  expect(finish).toContain('rpc/combat_finish_and_recover');
  expect(finish).toContain('combatPersistFinishedSummary');
  expect(runtime).toContain('med stoppknappen vid SL-kontrollerna bredvid Play och Reset');
 });
 it('puts desktop dashboard flush under banner and retains round and attack content',()=>{
  expect(html).toContain('features/combat/desktop-tight.css?v=');
  expect(compact).toContain('main:has(> #combatPage:not(.hidden))');
  expect(compact).toContain('padding-top:0');
  expect(compact).toContain('.combat-shell-live .combat-left-column');
  expect(compact).toContain('gap:6px');
  expect(compact).toContain('max-height:none');
  expect(compact).toContain('overflow:visible');
  expect(runtime).toContain("combatTurnPanelHtml()+combatAttackPanelHtml()");
  expect(runtime).toContain('combatGmToolboxHtml()');
 });
});
