import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inn=read('features/inn/inn.js');
const app=read('legacy/app.js');
const css=read('src/styles/app.css');
const sql=read('supabase/migrations/20261009074500_inn_meal_provisions_coverage.sql');
const first=inn.indexOf('/* v0.35.10 — Meals eaten at the inn');
const last=inn.indexOf('async function innCheckout(){',first);
if(first<0||last<=first)throw new Error('Meal checkout helpers missing');
const code=inn.slice(first,last);
const ctx={
 centralCampaignId:'campaign-1',
 dbJson:async path=>[{day_number:7}],
 encodeURIComponent
};
runInNewContext(code+';this.api={innIsPreparedMeal,innFoodPurchaseSummary,innApplyFoodPurchase,innCurrentCampaignDay}',ctx);
const {innIsPreparedMeal,innFoodPurchaseSummary,innApplyFoodPurchase,innCurrentCampaignDay}=ctx.api;
const item=(itemKey,category='Mat & dryck')=>({itemKey,category});
const lines=(...pairs)=>pairs.map(([key,qty])=>({item:item(key),row:{qty}}));

describe('Mat köpt i värdshuset skyddar proviant vid dagens slut',()=>{
 test('måltider räknas, men inte öl, vin, logi, tjänster eller reskost',()=>{
  for(const key of ['food_breakfast_simple','food_breakfast_hearty','food_soup','food_hot_meal','food_fine_meal','food_feast']){
   expect(innIsPreparedMeal(item(key))).toBe(true);
  }
  for(const key of ['drink_ale','drink_wine_glass','lodging_single','service_bath','food_travel_ration']){
   expect(innIsPreparedMeal(item(key))).toBe(false);
  }
 });
 test('någon köpt måltid ger exakt en täckt dag, oavsett antal rätter',()=>{
  const foods=lines(['food_soup',3],['food_breakfast_simple',2],['drink_ale',5]);
  expect(innFoodPurchaseSummary(foods)).toEqual({meal:true,rations:0});
  const buyer={provisionsDays:4};
  innApplyFoodPurchase(buyer,foods,7);
  expect(buyer).toEqual({provisionsDays:4,innMealDay:7});
  const buyer2={provisionsDays:4,innMealDay:7};
  innApplyFoodPurchase(buyer2,foods,7);
  expect(buyer2).toEqual(buyer);
 });
 test('reskost fyller på antalet proviantdagar utan att räknas som uppäten måltid',()=>{
  const purchase=lines(['food_travel_ration',3],['drink_ale',1]);
  expect(innFoodPurchaseSummary(purchase)).toEqual({meal:false,rations:3});
  const buyer={provisionsDays:2};
  innApplyFoodPurchase(buyer,purchase,null);
  expect(buyer).toEqual({provisionsDays:5});
  const newBuyer={};
  innApplyFoodPurchase(newBuyer,purchase,null);
  expect(newBuyer.provisionsDays).toBe(3);
 });
 test('dryck eller logi ensamma ger inget undantag',()=>{
  const buyer={provisionsDays:2};
  innApplyFoodPurchase(buyer,lines(['drink_ale',2],['lodging_single',1]),7);
  expect(buyer).toEqual({provisionsDays:2});
  expect(innFoodPurchaseSummary(lines(['food_soup',0])).meal).toBe(false);
 });
 test('måltidsdatum måste vara en giltig serverdag, inte bara lokalt cachevärde',async()=>{
  const buyer={provisionsDays:3};
  expect(()=>innApplyFoodPurchase(buyer,lines(['food_soup',1]),undefined)).toThrow('Kampanjens dag');
  expect(buyer).toEqual({provisionsDays:3});
  expect(await innCurrentCampaignDay()).toBe(7);
  expect(code).toContain("dbJson('campaign_day_state?campaign_id=eq.'");
  expect(inn).toContain('foodSummary.meal?await innCurrentCampaignDay():null');
  expect(inn).toContain('innApplyFoodPurchase(draft,rows,foodDay)');
  expect(inn).toContain('await syncCharacterToCentral(draft)');
 });
 test('dagbyte undantar bara den betalade dagen och rör inte andra rollpersoner',()=>{
  expect(sql).toContain('create or replace function public.consume_character_provisions_on_day_change()');
  expect(sql).toContain('v_elapsed := new.day_number - old.day_number;');
  expect(sql).toContain("c.data->>'innMealDay'");
  expect(sql).toContain('old.day_number');
  expect(sql).toContain('new.day_number');
  expect(sql).toContain("c.data ? 'provisionsDays'");
  expect(sql).toContain('c.campaign_id = new.campaign_id');
  expect(sql).toContain('greatest(');
  expect(sql).not.toContain('update public.campaign_day_state');
  expect(inn).toContain('Dagens mat är betald');
  expect(app).toContain('provisions-covered');
  expect(css).toContain('#equipmentPanel .provisions-covered');
 });
});
