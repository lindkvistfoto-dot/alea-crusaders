import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/duel-frames.css');
const page=read('index.html');
describe('v0.35.175 · shared illustrated attack and spell frames',()=>{
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
 it('keeps gold PNG frames without extra outer tiles and enlarges arrows',()=>{
  expect(css).toContain('padding:0;border:0;');
  expect(css).toContain('background:transparent;box-shadow:none;text-align:center;');
  expect(css).toContain('clamp(16px,2vw,26px)');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) clamp(17px,4.8vw,22px)');
  expect(css).toContain('width:clamp(29px,7.5vw,40px)');
  expect(css).toContain('duel-double-chevron.svg');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) clamp(16px,2vw,26px) minmax(0,1fr)');
  expect(css).toContain('width:clamp(23px,2.4vw,34px)');
  expect(css).toContain('flex:0 0 auto');
  expect(css).toContain('aspect-ratio:4/3');
  expect(css).toContain('duel-portrait-frame.png');
  expect(css).toContain('duel-focus-frame.png');
 });
 it('clips SLP and player portraits to the inner gold edge and keeps target clicks intact',()=>{
  expect(css).toContain('clip-path:inset(0 round 11px)');
  expect(css).toContain('left:9%;top:10%;right:auto;bottom:auto;');
  expect(css).toContain('width:82%;height:80%;');
  expect(css).toContain('position:absolute;z-index:1;display:block;');
  expect(css).toContain('z-index:4;pointer-events:none;');
  expect(css).toContain('button.combat-portrait-target-button');
  expect(runtime).toContain('combatToggleMagicTargetPicker()');
  expect(runtime).toContain('combatTogglePortraitTargetPicker()');
 });
 it('left aligns the spell outcome without redundant roll label and clips the magic art',()=>{
  const fn=runtime.slice(runtime.indexOf('function combatSpellResultHtml('),runtime.indexOf('function combatMagicFactHtml('));
  expect(fn).not.toContain('Besvärjelseslag');
  expect(fn).toContain('combat-spell-outcome-banner"><b>');
  expect(css).toContain('text-align:left;justify-content:flex-start;');
  expect(css).toContain('.combat-duel-center.is-spell .combat-duel-center-viewport');
  expect(css).toContain('overflow:hidden;border-radius:10px;');
  expect(css).toContain('inset:clamp(4px,.65vw,8px)');
  expect(css).toContain('object-fit:fill;pointer-events:none;');
 });
 it('uses real image assets and existing artwork resolvers',()=>{
  expect(runtime).toContain('window.aleaEquipmentArt?.src(path)');
  expect(runtime).toContain('data-spell-art-path');
  expect(css).toContain('duel-portrait-frame.png');
  expect(css).toContain('duel-focus-frame.png');
  expect(css).toContain('duel-double-chevron.svg');
  const doubleArrow=read('assets/combat/frames/duel-double-chevron.svg');
  expect(doubleArrow).toContain('viewBox="0 0 120 128"');
  expect(doubleArrow).toContain('data:image/png;base64,iVBORw0KGgo');
  expect(css).toContain('button.combat-portrait-target-button');
  expect(page).toContain('duel-frames.css?v=0.35.175');
  for(const name of ['duel-portrait-frame.png','duel-focus-frame.png','duel-chevron.png']){
   const bytes=readFileSync(new URL('../assets/combat/frames/'+name,import.meta.url));
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   // Palette PNGs encode real transparency using their tRNS chunk.
   expect(bytes.includes(Buffer.from('tRNS'))).toBe(true);
  }
 });
});