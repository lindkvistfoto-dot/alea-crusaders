import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
const assetUrl=new URL('../assets/combat/round-equipment-leather.webp',import.meta.url);
const css=readFileSync(new URL('../features/combat/equipment-background.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');

describe('Round equipment leather backdrop',()=>{
 it('commits the actual supplied raster asset in a browser supported format',()=>{
  expect(existsSync(assetUrl)).toBe(true);
  const binary=readFileSync(assetUrl);
  expect(binary.length).toBeGreaterThan(4000);
  expect(binary.toString('ascii',0,4)).toBe('RIFF');
  expect(binary.toString('ascii',8,12)).toBe('WEBP');
 });
 it('adds only one shared background behind four equipment slots',()=>{
  expect(css).toContain('#combatPage .combat-turn-panel > .combat-turn-stats');
  expect(css).toContain('round-equipment-leather.webp');
  expect(css).toContain('background-size:100% 100%');
  expect(css).toContain('background-repeat:no-repeat');
  expect(css).toContain('> .combat-turn-equip-art');
  expect(css).toContain('background:transparent');
  expect(css).not.toMatch(/\.combat-attack-result/);
  expect(css).not.toMatch(/\.combat-detail-equipment/);
 });
 it('keeps equipment art and readable text above the shared background',()=>{
  expect(css).toContain('z-index:1');
  expect(css).toContain('text-shadow');
  expect(css).toContain('@media(max-width:760px)');
  expect(css).toContain('@media(max-width:420px)');
  expect(runtime).toContain("'<div class=\"combat-turn-stats\">'+combatTurnEquipmentHtml(actor)");
 });
 it('loads background styles only after the existing round and desktop styles',()=>{
  const reference='features/combat/equipment-background.css?v=';
  expect(html).toContain(reference);
  expect(html.indexOf(reference)).toBeGreaterThan(html.indexOf('features/combat/desktop-tight.css?v='));
 });
});
