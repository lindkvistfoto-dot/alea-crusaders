import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const start=source.indexOf('/* Navigation must not be reset by asynchronous startup');
const end=source.indexOf('/* v0.35.69',start);
if(start<0||end<=start)throw Error('Cannot find the app startup implementation');

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
function setup({fail=false}={}){
 const load=deferred();
 const errors=[],alerts=[];
 const els=new Map();
 const element=id=>{
  if(!els.has(id))els.set(id,{classList:{flags:new Set(['hidden']),add(x){this.flags.add(x)},remove(x){this.flags.delete(x)},contains(x){return this.flags.has(x)}}});
  return els.get(id)
 };
 let page='login',initialHomes=0,cardRenders=0,authRefreshes=0;
 const ctx={
  $:element,
  document:{querySelector:element},
  goHome:()=>{page='landing';initialHomes++},
  refreshAuthUI:()=>{authRefreshes++},
  renderCards:()=>{cardRenders++},
  loadCentralData:()=>load.promise,
  loadRuleSkills:async()=>{},loadRuleMagicRegistry:async()=>{},loadRuleEffects:async()=>{},
  loadRuleProfessions:async()=>{},loadRuleRaces:async()=>{},loadRuleArmorRegistry:async()=>{},
  loadRuleShields:async()=>{},loadRuleWeapons:async()=>{},loadRuleProjectileTypes:async()=>{},
  loadRuleWeaponMaterials:async()=>{},loadRuleCombatFumbles:async()=>{},
  loadRuleSocialStands:async()=>{},loadCampaignMaps:async()=>{},
  loadCampaignDayState:async()=>{},
  console:{error:(...a)=>errors.push(a)},
  alert:message=>alerts.push(message)
 };
 runInNewContext(source.slice(start,end)+';globalThis.startApp=enterApp;',ctx);
 return {startApp:ctx.startApp,load,openPage:value=>{page=value},
  get page(){return page},get initialHomes(){return initialHomes},
  get cardRenders(){return cardRenders},get authRefreshes(){return authRefreshes},
  errors,alerts
 };
}

describe('Startsidan och asynkron inläsning',()=>{
 it('opens landing only once, before the deferred startup data loads',async()=>{
  const app=setup();
  const promise=app.startApp();
  expect(app.page).toBe('landing');
  expect(app.initialHomes).toBe(1);
  app.load.resolve();
  await promise;
  expect(app.page).toBe('landing');
  expect(app.initialHomes).toBe(1);
  expect(app.cardRenders).toBe(1);
 });
 it.each(['characters','map','shop','inn','combat','dice','admin'])(
  'does not return from %s to the landing page when a slow data request completes',
  async destination=>{
   const app=setup(),promise=app.startApp();
   app.openPage(destination);
   app.load.resolve();
   await promise;
   expect(app.page).toBe(destination);
   expect(app.initialHomes).toBe(1);
   expect(app.cardRenders).toBe(1);
  }
 );
 it('preserves the selected page even if central data loading fails',async()=>{
  const app=setup(),promise=app.startApp();
  app.openPage('map');
  app.load.reject(new Error('Timeout'));
  await promise;
  expect(app.page).toBe('map');
  expect(app.initialHomes).toBe(1);
  expect(app.cardRenders).toBe(1);
  expect(app.alerts.join(' ')).toContain('Timeout');
 });
});
