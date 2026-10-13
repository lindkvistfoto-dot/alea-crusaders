import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=source('src/styles/app.css');
const dice3d=source('src/features/dice/dice3d.js');
const main=source('src/main.js');
const html=source('index.html');
const mobileCss=source('features/combat/mobile-simplify.css');
const runtime=source('features/combat/runtime.js');

describe('Combat DiceBox presentation',()=>{
 it('keeps the 3D canvas flush with the map, without scaled overscan',()=>{
  const host=css.match(/\.combat-dice-host\{([^}]+)\}/)?.[1]||'';
  expect(host).toMatch(/\binset:\s*0\s*;/);
  expect(host).toMatch(/\bwidth:\s*100%\s*;/);
  expect(host).toMatch(/\bheight:\s*100%\s*;/);
  expect(host).not.toMatch(/\btransform:\s*scale\(/);
  expect(css).toMatch(/\.combat-dice-host canvas\{[^}]*width:100%!important;[^}]*height:100%!important;/);
 });
 it('keeps dice square on tall attack panels and shallow map overlays on phones',()=>{
  const start=runtime.indexOf('function combatDiceStageSide(');
  const end=runtime.indexOf('function combatPositionDiceLayer()',start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const context={};
  runInNewContext(runtime.slice(start,end)+';this.side=combatDiceStageSide;',context);
  expect(context.side({width:360,height:560})).toBe(360);
  expect(context.side({width:360,height:170})).toBe(170);
  expect(context.side({width:320,height:320})).toBe(320);
  expect(runtime).toContain("layer.style.setProperty('--combat-dice-side',combatDiceStageSide(rect)+'px')");
  expect(mobileCss).toMatch(/\.combat-dice-layer \.combat-dice-host\{[^}]*width:var\(--combat-dice-side,100%\);[^}]*height:var\(--combat-dice-side,100%\);/);
  expect(mobileCss).toContain('object-fit:contain;');
  expect(runtime).toContain("window.visualViewport?.addEventListener('resize'");
 });
 it('uses appropriately sized battle dice and recalculates the 3D world before every throw',()=>{
  const block=dice3d.split('async function ensureCombatDice3D(){')[1]?.split('window.alea3dCombatClear=')[0]||'';
  const scale=Number(block.match(/\bscale:\s*([0-9.]+)/)?.[1]);
  expect(scale).toBeGreaterThanOrEqual(3.5);
  expect(scale).toBeLessThanOrEqual(5.0);
  expect(block).toMatch(/await nextFrame\(\);\s*b\.resizeWorld\?\.\(\);\s*await nextFrame\(\);\s*return b\.roll\(notation/);
  expect(block).toContain('return b.roll(notation,{newStartPoint:true})');
 });
 it('refreshes affected module and CSS cache paths without altering the dice tray',()=>{
  const version=JSON.parse(source('package.json')).version;
  expect(main).toContain('features/dice/dice3d.js?v='+version);
  expect(html).toContain('src/styles/app.css?v='+version);
  expect(html).toContain('src/main.js?v='+version);
  expect(dice3d).toContain('scale:7.2,');
  expect(dice3d).toContain('scale:5.6,');
 });
});
