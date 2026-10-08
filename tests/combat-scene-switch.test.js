import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const a=source.indexOf('function combatSceneSelectionIsPreview('),b=source.indexOf('function renderCombatGmControls(',a);
const ctx={combatSelectedSceneId:'sceneA',activeCombat:{id:'liveCombat',settings:{scene_id:'sceneB'},name:'Bron'},campaignCombatScenes:[{id:'sceneA',name:'Byn skelettpatrill',settings:{rows:10,hex_m:1.5},background_width:1254,background_height:1254}],combatScenePreviewRequest:0,combatScenePreview:null,combatScenePreviewSceneId:'',combatScenePreviewLoading:false,combatScenePreviewError:'',
 combatHexPoints:()=>'',combatTokenInitials:()=> 'X',escAttr:x=>String(x),$:(id)=>({innerHTML:'',textContent:''}),renderCombat:()=>{ctx.renders++},renders:0};
runInNewContext(source.slice(source.indexOf('function combatSceneFromId('),b),ctx);
describe('Byte av stridsscen förhandsvisar utan att förlora aktiv strid',()=>{
 test('scenval skiljer sig från aktiv strid och ger en omrendering',()=>{
  expect(ctx.combatSceneSelectionIsPreview()).toBe(true);
  ctx.selectCombatScene('sceneB');
  expect(ctx.renders).toBe(1);
  expect(ctx.combatSceneSelectionIsPreview()).toBe(false);
  ctx.selectCombatScene('sceneA');
  expect(ctx.renders).toBe(2);
  expect(ctx.combatSceneSelectionIsPreview()).toBe(true);
  expect(ctx.activeCombat.id).toBe('liveCombat')
 });
 test('preview innehåller scenens bild och egen geometri, inte aktiva stridens karta',()=>{
  const scene=ctx.campaignCombatScenes[0],preview={url:'blob:scene-map',width:1254,height:1254,hexes:[],combatants:[]};
  const result=ctx.combatScenePreviewMapHtml(scene,preview);
  expect(result).toContain('blob:scene-map');
  expect(result).toContain('viewBox="0 0 1254 1254"');
  expect(result).toContain('combat-scene-preview-svg');
 });
 test('UI har dedikerad preview och Förbered-knapp, inte aktivt stridsläge',()=>{
  expect(source).toContain('if(combatSceneSelectionIsPreview()){');
  expect(source).toContain('renderCombatScenePreview(scene);return');
  expect(source).toContain('Förbered</b> för att aktivera scenen');
  expect(source).toContain("combatSceneSelectionIsPreview()");
  expect(source).toContain("!activeCombat||previewing?'disabled'");
 });
 test('stale preview responses skyddas när scenval ändras',()=>{
  expect(source).toContain('token!==combatScenePreviewRequest||combatSelectedSceneId!==sceneId');
  expect(source).toContain('++combatScenePreviewRequest')
 })
});