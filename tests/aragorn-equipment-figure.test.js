import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/character/current-equipment-gandalf.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const functionStart=app.indexOf('function currentEquipmentFigureHtml(character){');
const functionEnd=app.indexOf('function renderCurrentEquipment(){',functionStart);
const figureHtml=new Function(app.slice(functionStart,functionEnd)+';return currentEquipmentFigureHtml')();

describe('Aragorn – helfigur i aktuell utrustning',()=>{
 it('uses the clothed image rather than the armored variant',()=>{
  const character={figureImages:{base:'data:image/png;base64,YWJj',armored:'data:image/png;base64,ZGVm'}};
  const result=figureHtml(character);
  expect(result).toContain('data:image/png;base64,YWJj');
  expect(result).not.toContain('data:image/png;base64,ZGVm');
  expect(result).toContain('gandalf-equip-character');
 });
 it('rejects unsafe URLs and guides character owners to Bilder',()=>{
  expect(figureHtml({figureImages:{base:'javascript:alert(1)'}})).toContain('Helfigur saknas');
  expect(figureHtml({figureImages:{base:'data:image/svg+xml;base64,PHN2Zz4='}})).toContain('Helfigur saknas');
  expect(figureHtml({figureImages:{}})).toContain('fliken Bilder');
 });
 it('renders the person over the background without blocking equipment buttons',()=>{
  expect(app).toContain("'<div class=\"gandalf-equip-center\" aria-hidden=\"true\">'+currentEquipmentFigureHtml(current)+'</div>'");
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('inset:1% 25% 1% 25%');
  expect(css).toContain('width:auto');
  expect(css).toContain('max-width:none');
  expect(css).not.toMatch(/\.gandalf-equip-character\{[^}]*width:100%/);
  expect(css).toContain('justify-content:center');
  expect(css).toMatch(/\.gandalf-equip-character\{[^}]*height:95%/);
  expect(css).toContain('object-position:center bottom');
  expect(css).toContain('pointer-events:none');
  expect(css).toContain('.gandalf-equip-character');
  expect(css).toContain('@media(max-width:620px)');
  expect(html).toContain('Alea Crusaders v0.35.52');
  expect(html).toContain('id="tabImages"');
 });
});
