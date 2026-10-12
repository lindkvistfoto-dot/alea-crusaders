import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function tabControl(name){
 const classes=new Set();
 return {
  dataset:{specialImageSwitch:name},classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c)},
  attrs:{},setAttribute(key,value){this.attrs[key]=value},tabIndex:0
 };
}
function panel(name){
 const classes=new Set();
 return {
  dataset:{specialImageTab:name},hidden:name==='hitFigures',
  classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),contains:c=>classes.has(c)}
 };
}

describe('Specialbilder shared admin page',()=>{
 it('uses exactly one overview entry and one admin route',()=>{
  const html=read('index.html');
  const app=read('legacy/app.js');
  expect(html.match(/openAdminSection\('specialImages'\)/g)).toHaveLength(1);
  expect(html).not.toContain('openAdminSection(\'roundImages\')');
  expect(html).not.toContain('openAdminSection(\'hitFigures\')');
  expect(html.match(/data-admin-section="specialImages"/g)).toHaveLength(1);
  expect(html).not.toContain('data-admin-section="roundImages"');
  expect(html).not.toContain('data-admin-section="hitFigures"');
  expect(app).toContain("specialImages:['Specialbilder'");
  expect(app).toContain("activeAdminSection==='specialImages'");
  expect(html).toContain('id="adminRoundGallery"');
  expect(html).toContain('id="adminHitFigures"');
  expect(html).toContain('id="roundGalleryStatus"');
  expect(html).toContain('id="hitFigureStatus"');
  expect(html).toContain('aleaRoundGallery.upload');
  expect(html).toContain('special-images.css');
 });
 it('switches accessible tabs and refreshes only the selected gallery',async()=>{
  const app=read('legacy/app.js');
  const start=app.indexOf("let activeSpecialImageTab='roundImages';");
  const end=app.indexOf("async function openAdminSection(",start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const buttons=[tabControl('roundImages'),tabControl('hitFigures')];
  const panels=[panel('roundImages'),panel('hitFigures')];
  const element={querySelectorAll(selector){
   if(selector==='[data-special-image-switch]')return buttons;
   if(selector==='[data-special-image-tab]')return panels;
   return [];
  }};
  const round=vi.fn(async()=>{}),hit=vi.fn(async()=>{});
  const context={$:(key)=>key==='adminSpecialImages'?element:null,
   window:{aleaRoundGallery:{renderAdmin:round},aleaHitFigures:{renderAdmin:hit}}};
  runInNewContext(app.slice(start,end)+'\nwindow.testTabSwitch=selectSpecialImageTab;',context);
  await context.window.testTabSwitch('hitFigures');
  expect(hit).toHaveBeenCalledTimes(1);
  expect(round).not.toHaveBeenCalled();
  expect(buttons[1].attrs['aria-selected']).toBe('true');
  expect(buttons[1].tabIndex).toBe(0);
  expect(panels[0].hidden).toBe(true);
  expect(panels[1].hidden).toBe(false);
  await context.window.testTabSwitch('roundImages');
  expect(round).toHaveBeenCalledTimes(1);
  expect(buttons[0].attrs['aria-selected']).toBe('true');
  expect(buttons[1].attrs['aria-selected']).toBe('false');
  expect(panels[0].hidden).toBe(false);
  expect(panels[1].hidden).toBe(true);
 });
 it('preserves previous gallery URLs as aliases and keeps existing registries',()=>{
  const code=read('legacy/app.js');
  expect(code).toContain("if(key==='roundImages'||key==='hitFigures')");
  expect(code).toContain("key='specialImages'");
  const html=read('index.html');
  expect(html).toContain('features/combat/round-gallery.js');
  expect(html).toContain('features/combat/hit-figures.js');
  expect(read('features/combat/round-gallery.js')).toContain('rule_combat_round_backgrounds');
  expect(read('features/combat/hit-figures.js')).toContain('rule_hit_figure_images');
 });
});
