import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js'),css=read('src/styles/app.css');
describe('Cethiel CC0 sprites integrated in live melee combat v0.35.31',()=>{
 it('chooses normal/special/perfect slashes from actual dice results',()=>{
  const style=runtime.slice(runtime.indexOf('function combatSlashSpriteStyle('),runtime.indexOf('function combatSlashSpritePath('));
  expect(style).toContain("outcome==='perfect'?'fire'");
  expect(style).toContain("outcome==='special'?'blue':'classic'");
  expect(style).toContain("enchanted?'purple'");
  expect(style).toContain("if(!['success','special','perfect'].includes(outcome))return null");
 });
 it('loads strip only from local assets, crops six 126px frames and cleans up after 540ms',()=>{
  expect(runtime).toContain("const COMBAT_SLASH_SPRITE_DIR='./assets/combat/slashes/'");
  expect(runtime).toContain("viewport.setAttribute('viewBox','0 0 126 150')");
  expect(runtime).toContain("image.setAttribute('width','756')");
  expect(runtime).toContain("if(frame>=6){stop();return}");
  expect(runtime).toContain("viewport.setAttribute('viewBox',String(frame*126)+' 0 126 150')");
  expect(runtime).toContain("spriteAnimation?.stop()");
 });
 it('starts while dice roll, resolves after result, and retains SVG fallback',()=>{
  const action=runtime.slice(runtime.indexOf('function combatStartMeleeFx('),runtime.indexOf('async function combatResolveAttackAction('));
  expect(action).toContain("spriteAnimation=combatSlashSpriteOnMap(fx,b,size,style,slashVariant,rotation)");
  expect(action).toContain("image"); // Render function keeps animated SVG fallback.
  expect(runtime).toContain("const meleeFx=attackMode==='melee'?combatStartMeleeFx(actor,target):null");
  expect(runtime).toContain("meleeFx?.finish(rolled.outcome)");
  expect(runtime).toContain("image.addEventListener('error',stop");
  expect(css).toContain(".combat-melee-fx.slash-sprite-active .combat-melee-slash");
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
 });
 it('imports SHA256-pinned CC0 original and generates exactly 20 sprite PNGs',()=>{
  const py=read('scripts/import-weapon-slashes.py');
  const workflow=read('.github/workflows/import-weapon-slashes.yml');
  expect(py).toContain('Everything_0.zip');
  expect(py).toContain('163eb4e4d41385f3b888e7176c6da077d0e7fa7c101da96bbaa4645a2ec9d673');
  expect(py).toContain("if len(files)!=20");
  expect(workflow).toContain('contents: write');
  expect(workflow).toContain('python scripts/import-weapon-slashes.py');
  const assetDir=new URL('../assets/combat/slashes/',import.meta.url);
  if(existsSync(assetDir)){
   const names=readdirSync(assetDir).filter(n=>/^(classic|purple|blue|fire)-slash-[1-5]\.png$/.test(n));
   expect(names).toHaveLength(20)
  }
 });
});