import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rendererSource=()=>{
 const source=load('src/main.js');
 return source.slice(source.indexOf('const TRANSPARENT_HIT_CAMERA='),source.indexOf('/* v0.33.65 — image-only hit location camera */'));
};
function loadRenderer(){
 const window={
  ALEA_HIT_BODY_MODEL:{src:'data:image/webp;base64,AAAA'},
  ALEA_HIT_BODY_ZONES:{
   outline:'M0 0 L10 0 L10 20 Z',viewBox:'0 0 1024 1536',
   zones:{head:{paths:['M0 0 L10 0 Z']},left_leg:{paths:['M0 0 L10 10 Z']}}
  }
 };
 runInNewContext(rendererSource(),{window});
 return window;
}
function loadRegistry(){
 const window={};
 runInNewContext(load('features/combat/hit-figures.js'),{window,console,Map,Set});
 return window.aleaHitFigures;
}
const complete=(race,gender)=>{
 const p=['neutral','head','chest','abdomen','left_arm','right_arm','left_leg','right_leg'];
 return p.map(part=>({race_id:race,gender,body_part:part,image_path:'figure/11111111-1111-4111-8111-111111111111.webp'}));
};

describe('Shared race/gender hit-location image packs',()=>{
 it('renders race, gender, and hit area within unchanged anatomical fallback camera',()=>{
  const window=loadRenderer();
  const html=window.combatHitLocationFigureHtml({key:'head',label:'Huvud',race:'Dvärg',gender:'Kvinna'});
  expect(html).toContain('class="combat-hit-art-image"');
  expect(html).toContain('data-hit-part="head"');
  expect(html).toContain('data-hit-race="Dvärg"');
  expect(html).toContain('data-hit-gender="Kvinna"');
  expect(html).toContain('class="combat-hit-camera"');
  expect(html).toContain('combat-hit-model-overlay');
  expect(html).toContain('--hit-scale:2.5');
 });
 it('uses desired gender first, then male of same race, then human female, then human male',()=>{
  const figures=loadRegistry();
  const all=[...complete('manniska','male'),...complete('manniska','female'),...complete('dvarg','male'),...complete('dvarg','female')];
  expect(figures.choosePack('Dvärg','Kvinna',all)?.key).toBe('dvarg|female');
  expect(figures.choosePack('Dvärg','Kvinna',all.filter(row=>!(row.race_id==='dvarg'&&row.gender==='female')))?.key).toBe('dvarg|male');
  expect(figures.choosePack('Dvärg','Kvinna',all.filter(row=>row.race_id==='manniska'))?.key).toBe('manniska|female');
  expect(figures.choosePack('Okänd ras','Kvinna',complete('manniska','male'))?.key).toBe('manniska|male');
 });
 it('does not use an incomplete series as if it were complete',()=>{
  const figures=loadRegistry();
  const partial=complete('dvarg','female').filter(x=>x.body_part!=='head');
  expect(figures.choosePack('Dvärg','Kvinna',partial)).toBeNull();
  expect(figures.choosePack('Dvärg','Kvinna',[...partial,...complete('manniska','male')])?.key).toBe('manniska|male');
 });
 it('normalizes absent gender to man and supports known humanoid race spellings',()=>{
  const figures=loadRegistry();
  expect(figures.normalizeRace('Människa')).toBe('manniska');
  expect(figures.normalizeRace('Humanoid anka')).toBe('anka');
  expect(figures.normalizeRace('Gråalv')).toBe('graalv');
  expect(figures.normalizeGender('')).toBe('male');
  expect(figures.normalizeGender('Kvinna')).toBe('female');
  expect(figures.candidateKeys('Anka','Kvinna').join(',')).toBe('anka|female,anka|male,manniska|female,manniska|male');
 });
 it('saves source race and gender in the defender snapshot and returned rolled hit',()=>{
  const source=load('features/combat/runtime.js');
  expect(source).toContain('race_name:stats.race_name,gender:stats.gender');
  expect(source).toContain('race:figureRace,gender:figureGender');
  expect(source).toContain('combatHydrateFigureIdentity()');
  expect(source).toContain("return attackMode==='melee'&&defenseMode==='parry_failed'?'B':'A'");
  expect(source).toContain('result.damage=await combatResolveDamage');
  expect(source).toContain('window.aleaHitFigures?.hydrate?.(body)');
 });
 it('has admin routing, persistent RLS table, and eight upload slots',()=>{
  const html=load('index.html'),legacy=load('legacy/app.js'),code=load('features/combat/hit-figures.js');
  const sql=load('supabase/migrations/20261012130000_hit_figure_race_gender_registry.sql');
  expect(html).toContain('openAdminSection(\'specialImages\')');
  expect(html).toContain('id="adminHitFigures"');
  expect(html).toContain('features/combat/hit-figures.js');
  expect(legacy).toContain("activeAdminSection==='specialImages'");
  expect(code).toContain("'neutral','Neutral figur'");
  expect(code).toContain("rule_hit_figure_images?on_conflict=race_id,gender,body_part");
  expect(sql).toContain('private.is_admin()');
  expect(sql).toContain("'alea-hit-figures'");
  expect(sql).toContain('enable row level security');
 });
});
