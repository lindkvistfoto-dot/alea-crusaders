import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/attack-participants.css');
const roundGallery=read('features/combat/round-gallery.js');

describe('Gemensam stridspanelbakgrund för attack och magi',()=>{
 it('does not render the selected spell effect behind the entire magic panel',()=>{
  const panel=runtime.slice(runtime.indexOf('function combatSpellCastPanelHtml(){'),
   runtime.indexOf('function combatAttackPanelHtml(){'));
  expect(panel).not.toContain('combat-magic-backdrop');
  expect(panel).not.toContain('has-spell-backdrop');
  expect(panel).toContain("combatSpellCarouselHtml(actor,action)");
  // Keep the independent spell cutout in the center frame.
  expect(panel).toContain('combatMagicHeaderHtml(actor,target,data,combatMagicTargetIsReady(actor,action),backdrop,preparing,cutout)');
 });
 it('inherits the same active-combatant illustration as Attack',()=>{
  const attack=css.match(/#combatPage \.combat-shell-live \.combat-mini-attack\s*\{([^}]*)\}/);
  const magic=css.match(/#combatPage \.combat-shell-live \.combat-mini-attack\.combat-mini-magic\s*\{([^}]*)\}/);
  expect(attack?.[1]).toContain('--alea-attack-illustration');
  expect(magic?.[1]).not.toMatch(/\bbackground(?:-image|-color|-position|-size)?\s*:/);
  expect(roundGallery).toContain("querySelectorAll('#combatPage .combat-shell-live .combat-mini-attack')");
 });
});
