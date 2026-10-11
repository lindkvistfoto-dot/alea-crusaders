import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('legacy/app.js');
const css=read('src/styles/app.css');
const sql=read('supabase/migrations/20261011130000_character_water_provisions.sql');
const begin=app.indexOf('/* v0.35.97 — Separate food and drinking-water stores');
const end=app.indexOf('/* Inventory units remain in the character',begin);
if(begin<0||end<begin)throw Error('Food/water panel not found');
const panel=app.slice(begin,end);
function fixture(editing=false,allowed=true,model={provisionsDays:3,waterDays:5}){
 const el={innerHTML:''},scope={current:model,editing,
  campaignDayState:{day_number:9},canEditCharacter:()=>allowed,
  $:id=>id==='characterProvisions'?el:null,save:()=>{scope.saves++},
  saves:0
 };
 runInNewContext(panel+';this.api={characterProvisionsDays,characterWaterDays,renderCharacterProvisions,setCharacterWater,stepCharacterWater}',scope);
 return {el,scope,api:scope.api}
}
describe('Water provisions per character',()=>{
 test('food and water render independently as remaining whole days',()=>{
  const x=fixture();
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).toContain('💧 Vatten');
  expect(x.el.innerHTML).toContain('🥖 Mat');
  expect(x.el.innerHTML).toContain('Ändra vattenförråd');
  expect(x.el.innerHTML).toContain('<strong>3</strong><span>dagar</span>');
  expect(x.el.innerHTML).toContain('<strong>5</strong><span>dagar</span>');
  expect(css).toContain('#equipmentPanel .provisions-grid');
 });
 test('water +/- updates only water, clamps, persists, and needs permission',()=>{
  const x=fixture();
  x.api.stepCharacterWater(-1);
  expect(x.scope.current).toMatchObject({waterDays:4,provisionsDays:3});
  expect(x.scope.saves).toBe(1);
  x.api.setCharacterWater(-200);
  expect(x.scope.current.waterDays).toBe(0);
  x.api.stepCharacterWater(-1);
  expect(x.scope.current.waterDays).toBe(0);
  x.api.setCharacterWater(999999999);
  expect(x.scope.current.waterDays).toBe(999999);
  const denied=fixture(false,false,{waterDays:2,provisionsDays:2});
  denied.api.stepCharacterWater(1);
  denied.api.renderCharacterProvisions();
  expect(denied.scope.current.waterDays).toBe(2);
  expect(denied.scope.saves).toBe(0);
  expect(denied.el.innerHTML).not.toContain('provisions-stepper');
 });
 test('old characters without waterDays render 0 and may add supplies',()=>{
  const old={provisionsDays:7};
  const x=fixture(true,true,old);
  x.api.renderCharacterProvisions();
  expect(x.api.characterWaterDays()).toBe(0);
  expect(x.el.innerHTML).toContain('setCharacterWater(this.value)');
  x.api.setCharacterWater('2.9');
  expect(old.waterDays).toBe(2);
  expect(old.provisionsDays).toBe(7);
 });
 test('a paid inn meal only protects food and never water',()=>{
  const x=fixture(false,true,{provisionsDays:0,waterDays:2,innMealDay:9});
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).toContain('Dagens mat betald');
  expect(x.el.innerHTML).not.toContain('Vatten: en dag förbrukas vid varje ny kampanjdag');
  expect(x.el.innerHTML).toContain('provisions-help-corner');
  expect(sql).toContain("c.data->>'innMealDay'");
  expect(sql).toContain("'{waterDays}'");
  expect(sql).toContain("c.data ? 'waterDays'");
  expect(sql).toContain('v_elapsed := new.day_number - old.day_number;');
  expect(sql).toContain("c.data ? 'provisionsDays' or c.data ? 'waterDays'");
  expect(sql).toContain('where c.campaign_id = new.campaign_id');
  expect(sql).not.toContain('update public.campaign_day_state');
  expect(app).toContain('Vatten: 1 dag dras separat');
 });
});
