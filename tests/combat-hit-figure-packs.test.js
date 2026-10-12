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
   outline:'M0 0 L10 0 L10 20 Z',
   viewBox:'0 0 1024 1536',
   zones:{head:{paths:['M0 0 L10 0 Z']},left_leg:{paths:['M0 0 L10 10 Z']}}
  }
 };
 runInNewContext(rendererSource(),{window});
 return window;
}

describe('Swappable illustrated hit-location packs',()=>{
 it('renders the matching golden hit image with the original camera and fallback',()=>{
  const window=loadRenderer();
  const html=window.combatHitLocationFigureHtml({key:'head',label:'Huvud',figure_profile:'humanoid_male'});
  expect(html).toContain('assets/hit-figures/humanoid-male/head.webp');
  expect(html).toContain('class="combat-hit-art-image"');
  expect(html).toContain('class="combat-hit-camera"');
  expect(html).toContain('combat-hit-model-overlay');
  expect(html).toContain('combat-hit-art-loaded');
  expect(html).toContain('combat-hit-art-failed');
  expect(html).toContain('--hit-scale:2.5');
 });
 it('keeps anatomical rendering for any figure profile with no image pack',()=>{
  const window=loadRenderer();
  const html=window.combatHitLocationFigureHtml({key:'head',label:'Huvud',figure_profile:'skeleton'});
  expect(html).toContain('combat-hit-model-overlay');
  expect(html).not.toContain('combat-hit-art-image');
 });
 it('accepts future female/skeleton series without rewriting hit table',()=>{
  const window=loadRenderer();
  const names=['neutral','head','chest','abdomen','left_arm','right_arm','left_leg','right_leg'];
  const images=Object.fromEntries(names.map(part=>[part,part+'.webp']));
  expect(window.aleaRegisterHitFigurePack('skeleton',{base:'./assets/hit-figures/skeleton/',images})).toBe(true);
  const html=window.combatHitLocationFigureHtml({key:'left_leg',label:'Vänster ben',figure_profile:'skeleton'});
  expect(html).toContain('assets/hit-figures/skeleton/left_leg.webp');
 });
 it('keeps hit dice and damage logic untouched, only stores selected figure on result',()=>{
  const engine=load('features/combat/runtime.js');
  expect(engine).toContain("return attackMode==='melee'&&defenseMode==='parry_failed'?'B':'A'");
  expect(engine).toContain("target?.state?.hit_figure_profile");
  expect(engine).toContain("figure_profile:figureProfile");
  expect(engine).toContain("result.damage=await combatResolveDamage");
 });
 it('layers the selected image over the existing anatomical safety fallback',()=>{
  const css=load('src/styles/app.css');
  expect(css).toContain('.combat-hit-image-switch{');
  expect(css).toContain('.combat-hit-art-loaded > .combat-hit-art-image{');
  expect(css).toContain('.combat-hit-art-loaded > .combat-hit-model-stage{');
 });
});
