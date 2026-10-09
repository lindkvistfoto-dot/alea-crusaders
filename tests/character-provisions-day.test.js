import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('legacy/app.js');
const html=read('index.html');
const css=read('src/styles/app.css');
const migration=read('supabase/migrations/20261009071500_food_provisions_day_advance.sql');
const begin=app.indexOf('/* v0.35.09 — Food & provisions:');
const end=app.indexOf('function renderEquipment(){',begin);
if(begin<0||end<=begin)throw new Error('Provisions renderer not found');
const panel=app.slice(begin,end);

function context(editing=false,allowed=true){
 const current={provisionsDays:5};
 const el={innerHTML:''};
 let saves=0;
 const scope={current,editing,campaignDayState:{day_number:7},canEditCharacter:()=>allowed,$:id=>id==='characterProvisions'?el:null,save:()=>saves++};
 runInNewContext(panel+';this.api={characterProvisionsDays,renderCharacterProvisions,setCharacterProvisions,stepCharacterProvisions}',scope);
 return {current,el,scope,api:scope.api,get saves(){return saves}};
}
describe('Mat och proviant på rollpersonen',()=>{
 test('finns som egen sektion under Utrustning på alla skärmstorlekar',()=>{
  const equipment=html.indexOf('id="equipmentPanel"');
  const provisions=html.indexOf('id="characterProvisions"');
  const artifacts=html.indexOf('>Magiska artefakter</h2>');
  expect(equipment).toBeGreaterThan(0);
  expect(provisions).toBeGreaterThan(equipment);
  expect(artifacts).toBeGreaterThan(provisions);
  expect(css).toContain('#equipmentPanel .provisions-counter');
  expect(css).toContain('@media(max-width:560px)');
 });
 test('normalvy visar återstående hela dagar och manuella plus/minus',()=>{
  const x=context();x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).toContain('<strong>5</strong><span>dagar</span>');
  expect(x.el.innerHTML).toContain('stepCharacterProvisions(-1)');
  expect(x.el.innerHTML).toContain('stepCharacterProvisions(1)');
  expect(x.el.innerHTML).not.toContain('type="number"');
  x.api.stepCharacterProvisions(-1);
  expect(x.current.provisionsDays).toBe(4);
  expect(x.saves).toBe(1);
 });
 test('betald måltid under aktuell dag visas utan att ändra proviantvärdet',()=>{
  const x=context(false);
  x.current.innMealDay=7;
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).toContain('Dagens mat betald');
  expect(x.el.innerHTML).toContain('Ingen proviant dras vid nästa dagbyte');
  expect(x.el.innerHTML).toContain('<strong>5</strong>');
  x.scope.campaignDayState.day_number=8;
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).not.toContain('Dagens mat betald');
  expect(x.current.provisionsDays).toBe(5);
  expect(x.saves).toBe(0);
 });
 test('värdet kan skrivas direkt i redigeringsläge och aldrig bli negativt',()=>{
  const x=context(true);
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).toContain('type="number"');
  x.api.setCharacterProvisions('12');
  expect(x.current.provisionsDays).toBe(12);
  x.api.setCharacterProvisions(-17);
  expect(x.current.provisionsDays).toBe(0);
  expect(x.el.innerHTML).toContain('provisions-empty');
  x.api.stepCharacterProvisions(-1);
  expect(x.current.provisionsDays).toBe(0);
  x.api.setCharacterProvisions('4.9');
  expect(x.current.provisionsDays).toBe(4);
  x.api.setCharacterProvisions('999999999');
  expect(x.current.provisionsDays).toBe(999999);
 });
 test('gamla rollpersoner utan proviant visar noll och endast behöriga får ändra',()=>{
  const x=context(false,false);delete x.current.provisionsDays;
  expect(x.api.characterProvisionsDays()).toBe(0);
  x.api.stepCharacterProvisions(3);
  expect(x.current.provisionsDays).toBeUndefined();
  x.api.renderCharacterProvisions();
  expect(x.el.innerHTML).not.toContain('provisions-stepper');
  expect(x.saves).toBe(0);
  expect(app).toContain('equipment:[],provisionsDays:0,artifacts:[]');
  expect(app).toContain('renderCharacterProvisions();let c=current.coins');
 });
 test('förbrukning sker server-side exakt vid ökat dagnummer och inte vid render',()=>{
  expect(migration).toContain('after update of day_number on public.campaign_day_state');
  expect(migration).toContain('when (new.day_number > old.day_number)');
  expect(migration).toContain('v_elapsed := new.day_number - old.day_number');
  expect(migration).toContain('where c.campaign_id = new.campaign_id');
  expect(migration).toContain("c.data ? 'provisionsDays'");
  expect(migration).toContain('to_jsonb(greatest(');
  expect(migration).toContain('0,');
  expect(migration).not.toContain('update public.campaign_day_state');
  expect(app).toContain("Mat & proviant: 1 dag dras automatiskt");
  expect(panel).not.toContain('campaignDayState.day_number+1');
 });
});
