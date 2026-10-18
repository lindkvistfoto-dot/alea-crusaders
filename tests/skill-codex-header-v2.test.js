import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=file('features/skills/skill-codex-header-v2.css');
const html=file('index.html');
const base=file('features/skills/skill-codex-wide.css');
const scope='#skillModal.skill-codex-active';

describe('ARCANE SKILL CODEX WIDE — Sisyphus header V5',()=>{
 it('touches only the skill heading, icon and X (never 16:9 art, stats or parchment)',()=>{
  expect(css).toContain(scope+' .modalhead');
  expect(css).toContain(scope+' #skillModalTitle');
  expect(css).toContain(scope+' .skill-codex-icon');
  expect(css).toContain(scope+' .modalclose');
  expect(css).not.toContain('skill-codex-hero');
  expect(css).not.toContain('skill-codex-stats');
  expect(css).not.toContain('skill-codex-description');
  expect(base).toContain('aspect-ratio:16/9');
  expect(base).toContain('parchment-paper.svg');
 });
 it('restores the EXACT original banner: no stretched crop, sockets or ornamental duplicates',()=>{
  expect(css).toContain('background:url("./codex-assets/header.webp") center/100% 100% no-repeat');
  expect(css).toContain('.modalhead::before,');
  expect(css).toContain('.modalhead::after {');
  expect(css).toContain('content:none;');
  expect(css).toContain('display:none;');
  expect(css).not.toContain('header-recess-v2.svg');
  expect(css).not.toContain('medallion.webp');
  expect(css).not.toContain('138%');
 });
 it('increases icon to 82px on mobile and keeps its own frame, overlapping title strip',()=>{
  expect(css).toContain('--codex-icon-size:100px');
  expect(css).toContain('--codex-icon-size:82px');
  expect(css).toContain('top:54%;');
  expect(css).toContain('transform:translateY(-50%)');
  expect(css).toContain('overflow:visible');
  expect(css).toContain('border:0;');
  expect(css).toContain('background:none;');
  expect(css).toContain('box-shadow:none;');
  expect(css).toContain('object-fit:contain');
  expect(css).toContain('.skill-codex-icon::after {content:none}');
 });
 it('reuses the approved circular ruby X beside the right jewel endcap',()=>{
  expect(css).toContain('url("./codex-assets/close-button.webp")');
  expect(css).toContain('--codex-close-inset:7.5%');
  expect(css).toContain('right:var(--codex-close-inset)');
  expect(css).toContain('border-radius:50%');
  expect(css).toContain('min-width:44px');
  expect(css).toContain('min-height:44px');
  expect(css).not.toContain('linear-gradient(155deg,#642025');
  expect(html).toMatch(/id="skillModal"[\s\S]*?class="modalclose" onclick="closeSkillInfo\(\)" aria-label="Stäng"/);
 });
 it('centres Fiska horizontally & vertically using equal side columns',()=>{
  expect(css).toContain('grid-template-columns:var(--codex-side-track) minmax(0,1fr) var(--codex-side-track)');
  expect(css).toContain('grid-column:2');
  expect(css).toContain('align-self:center');
  expect(css).toContain('text-align:center');
  expect(css).toContain('transform:translateY(4px)');
  expect(css).toContain('font:normal clamp(27px,3.8vw,37px)/1.07 Georgia');
  expect(css).toContain('font-size:clamp(18px,5.9vw,25px)');
  expect(css).toContain('font-size:clamp(22px,6.6vw,29px)');
  expect(css).toContain('@media(max-width:560px)');
  expect(css).toContain('@media(max-width:330px)');
 });
 it('loads after the other Codex styles so no cached old header appears',()=>{
  expect(html.indexOf('skill-codex-header-v2.css')).toBeGreaterThan(html.indexOf('skill-codex-wide.css'));
  expect(html).toContain('skill-codex-header-v2.css?v=0.35.265');
 });
});
