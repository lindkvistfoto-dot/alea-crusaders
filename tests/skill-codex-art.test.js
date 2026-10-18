import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../features/skills/skill-codex-art.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const base=readFileSync(new URL('../features/skills/skill-codex.css',import.meta.url),'utf8');
const scoped='#skillModal.skill-codex-active';

describe('ARCANE SKILL CODEX decorative asset composition',()=>{
 it('layers artwork only inside skill details (not weapon or unrelated modals)',()=>{
  expect(css).toContain(scoped);
  expect(css).not.toContain('skillModal.weapon-instance-modal');
  expect(html).toContain('skill-codex-art.css');
  expect(html.indexOf('skill-codex.css')).toBeLessThan(html.indexOf('skill-codex-art.css'));
 });
 it('references only the nonredundant HERMES textures',()=>{
  for(const key of ['leather','header','close-button','stat-plate','parchment-neutral','divider'])
   expect(css).toContain('./codex-assets/'+key+'.webp');
  // Approved FÄRDIGHET IKON already includes the four diamonds and metal frame.
  // Avoid the second ornamental medallion and the grossly stretched wide art frame.
  expect(css).not.toContain('url("./codex-assets/medallion.webp")');
  expect(css).not.toContain('url("./codex-assets/illustration-frame.webp")');
  expect(css).toMatch(/\.skill-codex-icon::after\s*\{[^}]*content:none/s);
  expect(css).toMatch(/\.skill-codex-hero::after\s*\{[^}]*content:none/s);
 });
 it('preserves small skill icon top left, functional close button top right',()=>{
  expect(css).toMatch(/\.skill-codex-icon\s*\{[^}]*left:20px/s);
  expect(css).toMatch(/\.modalclose\s*\{[^}]*right:16px/s);
  expect(css).toMatch(/@media\(max-width:560px\)[\s\S]*?\.skill-codex-icon\s*\{[^}]*width:46px;height:46px;[^}]*left:14px/s);
 });
 it('shows full 1:1 skill illustration on mobile, without hiding its head',()=>{
  expect(css).toMatch(/@media\(max-width:560px\)[\s\S]*?\.skill-codex-hero\s*\{[^}]*aspect-ratio:1\/1/s);
  expect(css).toMatch(/\.skill-codex-hero img\s*\{[^}]*object-fit:contain;object-position:center/s);
  expect(css).toContain('border:2px solid #9e7841');
 });
 it('shrinks mobile cards and keeps the description fully readable',()=>{
  expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(css).toContain('min-height:66px');
  expect(css).toContain('padding:23px 22px 35px');
 });
 it('modal overlays the fixed audio dock without changing other modals',()=>{
  expect(css).toContain(scoped+' {z-index:7000}');
  expect(base).toContain('#skillModal.skill-codex-active');
  expect(css).not.toMatch(/^\.alea-audio-dock\s*\{/m);
 });
});
