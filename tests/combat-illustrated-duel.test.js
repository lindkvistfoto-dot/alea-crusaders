import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('features/combat/duel-frames.css');
const page=read('index.html');
describe('v0.35.177 · shared illustrated attack and spell frames',()=>{
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
 it('keeps narrow mobile headings on one line and names legible',()=>{
  expect(css).toContain('font-size:clamp(7px,1.85vw,9px)');
  expect(css).toContain('white-space:nowrap;overflow-wrap:normal;word-break:normal');
  expect(css).toContain('font-size:clamp(9px,2.35vw,11px)');
  expect(css).not.toContain('text-wrap:balance');
  expect(css).toContain('font-size:clamp(8px,2.05vw,10px)');
  expect(css).toContain('text-shadow:0 1px 4px #000');
  expect(runtime).toContain("label=spell?'BESVÄRJELSE':'VAPEN'");
 });
 it('does not wrap headings, full names or KP on any combat viewport',()=>{
  expect(css).toContain('white-space:nowrap;');
  expect(css).toContain('text-wrap:nowrap;');
  expect(css).toContain('text-overflow:ellipsis;');
  expect(css).toContain('overflow-wrap:normal;');
  expect(css).toContain('font-size:clamp(8px,.75vw,11px)');
  expect(css).toContain('font-size:clamp(10px,1vw,14px)');
  expect(css).toContain('font-size:clamp(8px,2.15vw,10px)');
  expect(css).toContain('font-size:clamp(7px,1.95vw,9px)');
  expect(css).not.toContain('text-wrap:balance');
  expect(css).toContain('.combat-duelist-meta');
 });
 it('prevents a second fiery cast image only when the main spell backdrop exists',()=>{
  expect(css).toContain('.combat-mini-magic.has-spell-backdrop .combat-spell-effect-artwork');
  expect(css).toContain('display:none;');
  expect(css).toContain('.combat-mini-magic.has-spell-backdrop .combat-spell-effect-surface');
  expect(css).toContain('background-image:linear-gradient(135deg,#211812,#15100d);');
  expect(css).toContain('.combat-mini-magic.has-spell-backdrop .combat-spell-result');
  expect(css).toContain('.combat-duel-spell-art');
  expect(runtime).toContain('combatSpellResultHtml(action)');
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
 it('aligns magic frames without opaque CSS backplates and shows the ready-SR',()=>{
  expect(css).toContain('.combat-duel-center.is-spell.has-spell-cutout');
  expect(css).toContain('padding-top:0;');
  expect(css).toContain('.combat-magic-preparation .combat-preparation-portrait');
  expect(css).toContain('background:transparent;');
  expect(css).toContain('.combat-preparation-round');
  expect(css).toContain('.combat-preparation-eg');
  expect(runtime).toContain('const firstCastSr=');
  expect(runtime).toContain('const firstCastLabel=');
  expect(runtime).toContain('combat-spell-eg-corner');
  expect(runtime).toContain("preparing?' is-preparing':'')");
  expect(css).toContain('clip-path:inset(12% -115% -110% 11%)');
  expect(css).toContain('margin-top:clamp(16px,1.65vw,22px)');
  expect(css).toContain('background:radial-gradient(ellipse at 50% 46%');
  expect(css).toContain('center center / 82% 80% no-repeat');
  expect(css).toContain('margin-top:16px;');
  expect(css).toContain('.combat-spell-eg-corner');
  expect(css).toContain('left:-7%;bottom:-13%');
  expect(css).toContain('top:50%;left:50%;width:88%');
  expect(css).toContain('transform:translate(-50%,-50%)');
  expect(css).toContain('margin-top:clamp(3px,.4vw,6px)');
  expect(css).toContain('.combat-duel-center.is-spell .combat-duel-center-name');
  expect(css).toContain('width:96%;height:auto;aspect-ratio:3/4');
  expect(css).toContain('drop-shadow(0 10px 12px rgba(0,0,0,.92))');
  expect(css).toContain('background:radial-gradient(ellipse at 50% 48%,rgba(46,27,20,.95)');
  expect(runtime).toContain("(preparing?'':combatMagicStatusHtml(");
 });
 it('uses the transparent 1 SR hourglass and keeps its gold frame aligned',()=>{
  expect(runtime).toContain('preparation-hourglass-1sr.webp');
  expect(css).toContain('.combat-preparation-hourglass');
  expect(css).toContain('top:-22%;width:68%;');
  expect(css).toContain('clip-path:none;');
  expect(css).toContain('.combat-preparation-portrait::after');
  const bytes=readFileSync(new URL('../assets/combat/frames/preparation-hourglass-1sr.webp',import.meta.url));
  expect(bytes.subarray(0,4).toString()).toBe('RIFF');
  expect(bytes.subarray(8,12).toString()).toBe('WEBP');
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
  const version=JSON.parse(read('package.json')).version;
  expect(page).toContain('duel-frames.css?v='+version);
  for(const name of ['duel-portrait-frame.png','duel-focus-frame.png','duel-chevron.png']){
   const bytes=readFileSync(new URL('../assets/combat/frames/'+name,import.meta.url));
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   // Palette PNGs encode real transparency using their tRNS chunk.
   expect(bytes.includes(Buffer.from('tRNS'))).toBe(true);
  }
 });
});