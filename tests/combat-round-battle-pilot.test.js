import {describe,it,expect} from 'vitest';
import {readFileSync,statSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=read('features/combat/round-theme.css');
const runtime=read('features/combat/runtime.js');
const asset=new URL('../assets/combat/round-hero-battle-pilot.avif',import.meta.url);

describe('Pilot: fantasy battle image behind the round panel',()=>{
 it('ships an actual AVIF file with the round artwork',()=>{
   const bytes=readFileSync(asset);
   expect(statSync(asset).size).toBeGreaterThan(1000);
   expect(bytes.subarray(4,8).toString('ascii')).toBe('ftyp');
   expect(bytes.toString('ascii',8,12)).toBe('avif');
 });
 it('uses a decorative, non-interactive layer fading down past the active combatant',()=>{
   const pilot=css.slice(css.indexOf('/* v0.35.123'));
   expect(pilot).toContain('.combat-turn-panel::after');
   expect(pilot).toContain("round-hero-battle-pilot.avif");
   expect(pilot).toContain('pointer-events:none');
   expect(pilot).toContain('z-index:0');
   expect(pilot).toContain('linear-gradient(180deg');
   expect(pilot).toContain('#160f0b 100%');
   expect(pilot).toContain('.combat-turn-panel .combat-turn-head,');
   expect(pilot).toContain('.combat-turn-panel .combat-turn-actor');
 });
 it('keeps action buttons and corner ornaments above the decorative picture',()=>{
   expect(css).toContain('.combat-turn-panel > * { position: relative; z-index: 1; }');
   expect(css).toContain('.combat-turn-panel > .combat-ornate-corners {');
   expect(css).toContain('z-index: 3;');
   expect(runtime).toContain('function combatTurnPanelHtml(){');
   expect(runtime).toContain('combatOrnateFrameCorners+combatRoundArtLayer+head+');
   expect(runtime).toContain('onclick="combatAttackButton');
 });
});
