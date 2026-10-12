import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const legacy=read('legacy/app.js');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/equipment-crop-quadrants.css');
const html=read('index.html');
const migration=read('supabase/migrations/20261012233500_combat_equipment_crop_quadrant.sql');

describe('Per-master artwork quadrants in the combat Runda panel',()=>{
 it('offers four quadrants and full image in every equipment admin editor',()=>{
  const start=legacy.indexOf('function combatCropQuadrant(value)');
  const end=legacy.indexOf('function renderAdminProjectiles()',start);
  expect(start).toBeGreaterThan(-1);
  const context={escAttr:x=>x};
  runInNewContext(legacy.slice(start,end)+'\nthis.crop=combatCropQuadrant;this.editor=combatCropQuadrantEditor;',context);
  for(const value of ['top-right','top-left','bottom-right','bottom-left','full']){
   expect(context.crop(value)).toBe(value);
  }
  expect(context.crop('invalid')).toBe('top-right');
  const editor=context.editor('rwCombatCrop',{combat_crop_quadrant:'bottom-left'});
  expect(editor).toContain('id="rwCombatCrop"');
  expect(editor).toContain('value="bottom-left" selected');
  for(const field of ['rpCombatCrop','rwCombatCrop','raCombatCrop','rsCombatCrop']){
   expect(legacy).toContain("combatCropQuadrantEditor('"+field+"'");
   expect(legacy).toContain("combatCropQuadrant($('"+field+"')?.value)");
  }
 });
 it('persists selectable crop on all four existing rule-master tables',()=>{
  for(const table of ['rule_weapons','rule_shields','rule_armor_types','rule_projectile_types']){
   expect(migration).toContain('ALTER TABLE public.'+table+' ADD COLUMN');
   expect(migration).toContain(table+'_crop_quadrant_ck');
  }
  expect(migration).toContain("DEFAULT 'top-right'");
 });
 it('reads the crop from the matched master and sets a safe data attribute on each thumbnail',()=>{
  expect(runtime).toContain('master?.combat_crop_quadrant||item?.combat_crop_quadrant');
  expect(runtime).toContain('cropValue(rule,item)');
  expect(runtime).toContain('cropValue(armorRule,worn)');
  expect(runtime).toContain("cropValue(category==='thrown'?rule:projectile,item)");
  expect(runtime).toContain('data-combat-crop="'+ "'+crop+'" + '"');
  expect(runtime).toContain('data-combat-crop="'+ "'+row.crop+'" + '"');
  expect(runtime).toContain("imageTile('shield',label,item");
 });
 it('uses full-image mode or quadrant alignment ONLY within the combat round equipment row',()=>{
  expect(html).toContain('features/combat/equipment-crop-quadrants.css?v=');
  expect(css).toContain('[data-combat-crop="top-left"]');
  expect(css).toContain('[data-combat-crop="bottom-right"]');
  expect(css).toContain('[data-combat-crop="bottom-left"]');
  expect(css).toContain('[data-combat-crop="full"]');
  expect(css).toContain('--crop-origin:bottom right');
  expect(css).toContain('transform:rotate(45deg) scale(1.12)');
  expect(css).toContain('.combat-turn-projectile-crop');
  const selectors=css.split('{').slice(0,-1).map(x=>x.split('}').pop()).filter(x=>x.includes('img.combat-turn-art'));
  expect(selectors.length).toBeGreaterThan(0);
  expect(selectors.every(x=>x.includes('#combatPage')&&x.includes('.combat-turn-stats'))).toBe(true);
 });
});
