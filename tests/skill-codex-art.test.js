import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../features/skills/skill-codex-art.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
describe('ARCANE SKILL CODEX decorative asset composition',()=>{
 it('layers artwork only inside skill details (not weapon edit or unrelated modals)',()=>{
  expect(css).toContain('#skillModal.skill-codex-active');
  expect(css).not.toContain('skillModal.weapon-instance-modal');
  expect(html).toContain('skill-codex-art.css');
  expect(html.indexOf('skill-codex.css')).toBeLessThan(html.indexOf('skill-codex-art.css'));
 });
 it('references the verified HERMES artwork output paths',()=>{
  for(const key of ['leather','header','medallion','close-button','illustration-frame','stat-plate','parchment-neutral','divider'])
   expect(css).toContain('./codex-assets/'+key+'.webp');
 });
 it('keeps the skill icon at top left and active close button top right',()=>{
  expect(css).toMatch(/\.skill-codex-icon\s*\{[^}]*left:17px/s);
  expect(css).toMatch(/\.modalclose\s*\{[^}]*right:16px/s);
  expect(css).toContain('pointer-events:none');
 });
 it('supports four stats on large displays and two on narrow mobiles',()=>{
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(css).toContain('@media(max-width:560px)');
  expect(css).toContain('object-position:center 42%');
 });
});