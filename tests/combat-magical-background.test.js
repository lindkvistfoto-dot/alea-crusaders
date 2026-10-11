import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('features/character/magic-items.css');
const combat=read('features/combat/runtime.js');
const base=read('src/styles/app.css');

describe('Magic art in combat stays on a neutral background',()=>{
 it('keeps the ornate upper-left magic coin on enchanted equipment',()=>{
  expect(combat).toContain('const magicBadge=magical?');
  expect(combat).toContain('combat-turn-art-frame');
  expect(css).toContain('.combat-turn-art-frame>.alea-magic-item-dot');
 });
 it('does not amplify broad image alpha into a golden background in combat',()=>{
  const start=css.indexOf('/* v0.35.104');
  const end=css.indexOf('/* Without alpha-transparent artwork',start);
  expect(start).toBeGreaterThan(0);
  const rule=css.slice(start,end);
  expect(rule).toContain('.combat-turn-equip-art.magical:not(.magical-no-art) > .combat-turn-art-frame');
  expect(rule).toContain('background:none;');
  expect(rule).toContain('box-shadow:none;');
  expect(rule).toContain('drop-shadow(0 0 3px rgba(242,187,78,.32))');
  expect(rule).toContain('animation:none;');
  expect(rule).not.toContain('aleaMagicalGoldPulse');
  expect(rule).not.toContain('drop-shadow(0 0 38px');
 });
 it('keeps larger pulse for current equipment and normal image layout',()=>{
  expect(css).toContain('.gandalf-equip-slot.magical .gandalf-equip-face > img.gandalf-equip-art{');
  expect(css).toContain('animation:aleaMagicalGoldPulse 2.2s ease-in-out infinite;');
  expect(base).toContain('.combat-turn-equip-art>.combat-turn-art-frame');
  expect(base).toContain('.combat-turn-equip-art.twohand .combat-turn-art-frame');
  expect(css).toContain('.combat-turn-equip-art.magical-no-art .combat-turn-art-frame');
 });
 it('never reintroduces the heavy combat glow in reduced-motion mode',()=>{
  const reduced=css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  const atEnd=reduced.slice(0,reduced.indexOf('/* v0.35.95'));
  expect(atEnd).not.toContain('.combat-turn-equip-art.magical .combat-turn-art-frame > img.combat-turn-art');
 });
});