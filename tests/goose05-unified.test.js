import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('GOOSE 05 – one published viewer, separate GM administration',()=>{
 it('mounts exactly one shared gallery, never a second GM preview',()=>{
  const frodo=read('features/material/frodo-ui.js');
  expect(frodo.match(/gallery\.mount\(\)/g)).toHaveLength(1);
  expect(frodo).not.toContain('createArcaneGmPreview');
  expect(frodo).toContain('gallery.sync(state.row,state.revision)');
  expect(frodo).toContain("el('frodoGmAdmin')?.classList.toggle('hidden',!gm)");
  expect(frodo).toContain('id="frodoGmAdmin"');
 });
 it('loads published campaign history for either authenticated role',()=>{
  const code=read('features/material/arcane-gallery.js');
  expect(code).toContain("const allowed=()=>isLoggedIn()&&");
  expect(code).toContain("role=isGM()?'gm':'player'");
  expect(code).toContain("if(state.campaign!==c||state.role!==role){clear()");
  expect(code).toContain('campaign_material_presentation_history?');
  expect(code).toContain('createGoosePlayerShutter');
 });
 it('staging never publishes; legacy explicit publication actions remain untouched',()=>{
  const frodo=read('features/material/frodo-ui.js');
  const presentation=read('features/material/presentation.js');
  expect(frodo).toContain('stagedId=tile.dataset.frodoId;render();');
  expect(frodo).toContain('const result=await frodo.show(row);');
  expect(frodo).toContain("el('frodoStop').addEventListener('click',()=>frodo.stop())");
  expect(presentation).toContain("request('rpc/frodo_set_presentation'");
  expect(read('features/material/arcane-gallery.js')).not.toContain('rpc/frodo_set_presentation');
 });
 it('adds exactly two temporary GM-only gate buttons below the shared viewer',()=>{
  const ui=read('features/material/frodo-ui.js');
  const css=read('features/material/frodo-atelier.css');
  const gallery=read('features/material/arcane-gallery.js');
  expect(ui).toContain('id="frodoGooseTestOpen"');
  expect(ui).toContain('id="frodoGooseTestClose"');
  expect(ui).toContain("gallery.testShutter(action)");
  expect(ui).toContain("el('frodoGooseTestControls')?.classList.toggle('hidden',!gm||!authenticated())");
  expect(ui.indexOf('id="frodoGooseTestControls"')).toBeLessThan(ui.indexOf('id="frodoGmAdmin"'));
  expect(gallery).toContain("!isGM()");
  expect(gallery).toContain('gate.close({prepareFourByThree:homeRatio})');
  expect(css).toContain('.frodo-goose-test-controls.hidden');
 });
 it('uses private queue thumbnails and a single mobile close button',()=>{
  const ui=read('features/material/frodo-ui.js');
  const css=read('features/material/frodo-atelier.css');
  expect(ui).toContain('legolas.readMedia(row,true)');
  expect(ui).toContain('revokeObjectURL(url)');
  expect(ui).toContain('id="frodoCloseMobile"');
  expect(css).toContain('#legolasPanel.legolas-atelier-gm .frodo-close-mobile');
  expect(css).toContain('.frodo-gm-admin.hidden');
  expect(css).toContain('.frodo-queue-strip .frodo-queue-tile');
 });
});
