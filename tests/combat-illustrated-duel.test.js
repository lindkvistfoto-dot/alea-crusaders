import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/duel-frames.css');
const page=read('index.html');
describe('v0.35.172 · shared illustrated attack and spell frames',()=>{
 it('uses one middle tile in all combat branches without replacing target interactions',()=>{
  const area=runtime.slice(runtime.indexOf('function combatMagicHeaderHtml('),runtime.indexOf('function combatTurnPortraitHtml('));
  expect(area).toContain("combatDuelCenterHtml('spell'");
  expect((area.match(/combatDuelCenterHtml\('weapon'/g)||[])).toHaveLength(2);
  expect((area.match(/combat-illustrated-duel/g)||[])).toHaveLength(3);
  expect(area).toContain("combatPortraitTargetPickerHtml(targets,target)");
  expect(area).toContain("combatMagicTargetPickerHtml(actor,action)");
  expect(area).toContain("combatAttackResultHtml(attack)");
  expect(area).toContain("combatSpellResultHtml(action)");
 });
 it('uses real image assets and existing artwork resolvers',()=>{
  expect(runtime).toContain('window.aleaEquipmentArt?.src(path)');
  expect(runtime).toContain('data-spell-art-path');
  expect(css).toContain('duel-portrait-frame.png');
  expect(css).toContain('duel-focus-frame.png');
  expect(css).toContain('duel-chevron.png');
  expect(css).toContain('button.combat-portrait-target-button');
  expect(page).toContain('duel-frames.css?v=0.35.172');
  for(const name of ['duel-portrait-frame.png','duel-focus-frame.png','duel-chevron.png']){
   const bytes=readFileSync(new URL('../assets/combat/frames/'+name,import.meta.url));
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   // Palette PNGs encode real transparency using their tRNS chunk.
   expect(bytes.includes(Buffer.from('tRNS'))).toBe(true);
  }
 });
});