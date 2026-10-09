import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const store=read('features/shop/store.js');
const catalog=read('supabase/migrations/20261005213000_targans_gille_shop_catalog.sql');
const begin=store.indexOf('/* v0.35.12 — only actual food rations');
const end=store.indexOf('async function shopCheckout(){',begin);
if(begin<0||end<=begin)throw new Error('Targan provisions purchase handler missing');
const source=store.slice(begin,end);
let nextItem=0;
const ctx={
 ruleWeapons:[],
 ensureEquipmentState:c=>{
  for(const k of ['weapons','armor','shields','equipment']){
   if(!Array.isArray(c[k]))c[k]=[];
  }
 },
 newEquipItemId:kind=>kind+'-'+(++nextItem)
};
runInNewContext(source+';this.api={shopProvisionsDaysForPurchase,shopAddPurchasedItem}',ctx);
const {shopProvisionsDaysForPurchase,shopAddPurchasedItem}=ctx.api;
const ration=(overrides={})=>({
 source:'shop',itemKey:'travel_rations_day',category:'Proviant',
 name:'Reseproviant, 1 dag',purchaseKind:'equipment',
 quantityPerPurchase:1,bep:0.5,metadata:{},...overrides
});
const candle={source:'shop',itemKey:'wax_candle',category:'Proviant',name:'Vaxljus',
 purchaseKind:'equipment',quantityPerPurchase:1,bep:0,metadata:{}};

describe('Targans Gille — proviant till Mat & proviant',()=>{
 test('reseproviant i sortimentet motsvarar en dagsranson',()=>{
  expect(catalog).toContain("('travel_rations_day','Proviant','Reseproviant, 1 dag'");
  expect(catalog).toContain("('wax_candle','Proviant','Vaxljus'");
  expect(shopProvisionsDaysForPurchase(ration(),1)).toBe(1);
 });
 test('köp av 3 dagsransoner höjer räknaren och skapar inte tre utrustningsposter',()=>{
  const buyer={provisionsDays:5,equipment:[],projectiles:[]};
  shopAddPurchasedItem(buyer,ration(),3);
  expect(buyer.provisionsDays).toBe(8);
  expect(buyer.equipment).toHaveLength(0);
  expect(buyer.projectiles).toHaveLength(0);
  expect(buyer.weapons).toHaveLength(0);
 });
 test('köpare utan tidigare proviant får ett värde och nya inköp adderas',()=>{
  const buyer={};
  shopAddPurchasedItem(buyer,ration(),2);
  expect(buyer.provisionsDays).toBe(2);
  shopAddPurchasedItem(buyer,ration(),4);
  expect(buyer.provisionsDays).toBe(6);
  expect(buyer.equipment).toEqual([]);
 });
 test('vaxljus i samma kategori är fortfarande vanlig utrustning',()=>{
  const buyer={provisionsDays:4};
  expect(shopProvisionsDaysForPurchase(candle,2)).toBe(0);
  shopAddPurchasedItem(buyer,candle,2);
  expect(buyer.provisionsDays).toBe(4);
  expect(buyer.equipment).toHaveLength(2);
  expect(buyer.equipment[0]).toMatchObject({
   name:'Vaxljus',shopItemKey:'wax_candle',purchaseKind:'equipment'
  });
 });
 test('framtida matvaror kan ange dagsransoner i masterregistrets metadata',()=>{
  const future={...ration(),itemKey:'rations_pack',quantityPerPurchase:1,metadata:{provisions_days:5}};
  const buyer={provisionsDays:1};
  expect(shopProvisionsDaysForPurchase(future,2)).toBe(10);
  shopAddPurchasedItem(buyer,future,2);
  expect(buyer.provisionsDays).toBe(11);
  expect(buyer.equipment).toHaveLength(0);
 });
 test('provianträknaren begränsas till 999999 dagar och aldrig negativt',()=>{
  const buyer={provisionsDays:999998};
  shopAddPurchasedItem(buyer,ration(),6);
  expect(buyer.provisionsDays).toBe(999999);
  const malformed={provisionsDays:-45};
  shopAddPurchasedItem(malformed,ration(),1);
  expect(malformed.provisionsDays).toBe(1);
 });
 test('betalflödet använder gemensamma uppdateringen och sparar rollpersonen',()=>{
  expect(store).toContain('rows.forEach(({row,item})=>shopAddPurchasedItem(draft,item,row.qty));');
  expect(store).toContain('await syncCharacterToCentral(draft)');
  expect(store).toContain("dagars proviant tillagd.");
  expect(store).toContain("if(!shopSpendCarriedCoins(draft,cost))throw new Error('Börsen räcker inte till köpet.');");
 });
});
