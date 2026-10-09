import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../features/shop/store.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/shop/store.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
describe('Häxans brygder',()=>{
 it('has a separate navigation entry and shop mode',()=>{
  expect(html).toContain('id="alchemyNavBtn"');
  expect(html).toContain('onclick="openAlchemyShop()"');
  expect(source).toContain("async function openAlchemyShop(){return openShop('alchemy')}");
  expect(source).toContain("shopMode=alchemy?'alchemy':'general'");
  expect(source).toContain("page?.classList.toggle('shop-alchemy',alchemy)");
  expect(css).toContain('.shop-alchemy .shop-hero');
 });
 it('does not mix Targan and alchemist cart or catalogue',()=>{
  expect(source).toContain("ALCHEMY_CART_STORAGE_KEY='alea_alchemy_cart_v1'");
  expect(source).toContain('localStorage.getItem(shopStorageKey())');
  expect(source).toContain('localStorage.setItem(shopStorageKey(),JSON.stringify(shopCart))');
  expect(source).toContain("Boolean(item.metadata?.alchemy)!==(shopMode==='alchemy')");
  expect(source).toContain("Boolean(x.item.metadata?.alchemy)===(shopMode==='alchemy')");
 });
 it('withholds unpriced items and lets SL set prices under RLS',()=>{
  expect(source).toContain("if(item.metadata?.price_pending)return 'Pris enligt SL'");
  expect(source).toContain('if(!item||item.metadata?.price_pending)return');
  expect(source).toContain("item.metadata?.price_pending?' disabled");
  expect(source).toContain('async function shopEditAlchemyPrice(key)');
  expect(source).toContain("if(!activeUser()?.admin)return");
  expect(source).toContain("dbJson('rule_shop_items?id=eq.'");
  expect(source).toContain("price_pending:false,price_note:'Pris satt av SL'");
 });
 it('routes purchased alchemy items to persisted equipment with rule metadata',()=>{
  expect(source).toContain("alchemy:{...item.metadata},shopSource:'alchemy'");
  expect(source).toContain('await syncCharacterToCentral(draft)');
  expect(source).toContain("shopMode==='alchemy'?'Handla hos alkemisten':'Handla hos Targan'");
  expect(source).toContain('shopAlchemyDetailsHtml(item)');
  expect(source).toContain('Verkningstid');
  expect(source).toContain('Ingredienser');
 });
});
