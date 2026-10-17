import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {arcaneMorphMarkup} from '../features/material/arcane-morph-markup.js';

describe('ARCANE MORPHING FRAME shared mechanisms',()=>{
 it('renders two separately turning gears and two telescopic columns',()=>{
  const markup=arcaneMorphMarkup();
  expect((markup.match(/arcane-gallery-gear--(left|right)/g)||[])).toHaveLength(2);
  expect((markup.match(/arcane-gallery-piston--(left|right)/g)||[])).toHaveLength(2);
  expect((markup.match(/arcane-gallery-piston-collar--bottom/g)||[])).toHaveLength(2);
  expect((markup.match(/<div\b/g)||[]).length).toBe((markup.match(/<\/div>/g)||[]).length);
  expect(markup).toContain('aria-hidden="true"');
 });
 it('reuses identical decorative mechanics for player and GM without sharing image data',()=>{
  const player=readFileSync(new URL('../features/material/arcane-gallery.js',import.meta.url),'utf8');
  const gm=readFileSync(new URL('../features/material/arcane-gm-preview.js',import.meta.url),'utf8');
  expect(player).toContain("import {arcaneMorphMarkup} from './arcane-morph-markup.js?telescope=03'");
  expect(gm).toContain("import {arcaneMorphMarkup} from './arcane-morph-markup.js?telescope=03'");
  expect(player).toContain("arcaneMorphMarkup()+'</div>'");
  expect(gm).toContain("arcaneMorphMarkup()+'</div>'");
  expect(player).toContain('legolas.readMedia(row,false)');
  expect(gm).toContain('legolas.readMedia(row,false)');
 });
});
