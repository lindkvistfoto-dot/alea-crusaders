import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const inventory=read('features/character/magic-items.js');
const character=read('legacy/app.js');
const combat=read('features/combat/runtime.js');
const css=read('features/character/magic-items.css');
const icon='./features/character/assets/alea-magic-item-sigil.png';

describe('magical item sigil indicators',()=>{
 it('ships a transparent PNG asset for the shared gold sigil',()=>{
  const binary=readFileSync(new URL('../features/character/assets/alea-magic-item-sigil.png',import.meta.url));
  expect(binary.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(binary[25]).toBe(3); // paletted PNG; transparent tRNS chunk supplied
  expect(binary.includes(Buffer.from('tRNS'))).toBe(true);
 });
 it('keeps the icon tied to the individual magical flag in lists',()=>{
  expect(inventory).toContain("if(!magical(x))return '';");
  expect(inventory).toContain('class="character-item-magic-badge"');
  expect(inventory).toContain(icon);
  for(const kind of ['weapon','armor','shield','equipment'])expect(character).toContain("badge('"+kind+"',i)");
 });
 it('shows dark upper-left sigil coins in normal, two-handed, and combat equipment',()=>{
  expect(character).toContain('const magicBadge=magical?');
  expect(character).toContain('currentEquipmentMagicSparkHtml(magical)+magicBadge+countBadge');
  expect(character).toContain('currentEquipmentMagicSparkHtml(magical)+magicBadge');
  expect(combat).toContain('const magicBadge=magical?');
  expect(combat).toContain("count+'</b>')+magicBadge+'</div>'");
  expect(css).toContain('.gandalf-equip-face>.alea-magic-item-dot');
  expect(css).toContain('.gandalf-equip-twohand .gandalf-equip-face>.alea-magic-item-dot');
  expect(css).toContain('.combat-turn-art-frame>.alea-magic-item-dot');
 });
 it('does not move the bottom-right projectile counters',()=>{
  expect(character).toContain("currentEquipProjectileSlotHtml(character)");
  expect(combat).toContain('combat-turn-ammo-count');
  expect(css).toContain('left:2px;top:2px;');
 });
});
