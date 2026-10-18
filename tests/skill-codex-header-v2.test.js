import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=file('features/skills/skill-codex-header-v2.css');
const html=file('index.html');
const scope='#skillModal.skill-codex-active';

describe('ARCANE SKILL CODEX WIDE — quiet header V3',()=>{
 it('limits changes strictly to the title bar, icon and close button',()=>{
  expect(css).toContain(scope+' .modalhead');
  expect(css).toContain(scope+' #skillModalTitle');
  expect(css).toContain(scope+' .skill-codex-icon');
  expect(css).toContain(scope+' .modalclose');
  expect(css).not.toContain('skill-codex-description');
  expect(css).not.toContain('skill-codex-stats');
  expect(css).not.toContain('skill-codex-hero');
 });
 it('preserves the original banner without extra icon/close sockets or medals',()=>{
  expect(css).toContain('background:url("./codex-assets/header.webp") center/138% 100% no-repeat');
  expect(css).toContain('.modalhead::before,');
  expect(css).toContain('.modalhead::after {');
  expect(css).toContain('content:none;');
  expect(css).toContain('display:none;');
  expect(css).not.toContain('header-recess-v2.svg');
  expect(css).not.toContain('medallion.webp');
  expect(css).not.toContain('close-button.webp');
 });
 it('retains native skill icon art without adding borders or background',()=>{
  expect(css).toContain('--codex-icon-size:52px');
  expect(css).toContain('--codex-icon-inset:20px');
  expect(css).toContain('.skill-codex-icon::after {content:none}');
  expect(css).toContain('background:none;');
  expect(css).toContain('border:0;');
  expect(css).toContain('box-shadow:none;');
  expect(css).toContain('object-fit:contain;');
 });
 it('uses a compact oxblood ARCANE BUTTON on the text strip',()=>{
  expect(css).toContain('width:44px;');
  expect(css).toContain('height:44px;');
  expect(css).toContain('min-width:44px;');
  expect(css).toContain('min-height:44px;');
  expect(css).toContain('border-radius:8px;');
  expect(css).toContain('linear-gradient(155deg,#642025');
  expect(css).toContain('--codex-close-inset:20px');
  expect(css).toContain('right:var(--codex-close-inset)');
  expect(css).toContain('top:54%');
  expect(css).not.toContain('border-radius:50%');
 });
 it('centres title within symmetric tracks and supports narrow screens',()=>{
  expect(css).toContain('grid-template-columns:var(--codex-side-track) minmax(0,1fr) var(--codex-side-track)');
  expect(css).toContain('grid-column:2');
  expect(css).toContain('text-align:center');
  expect(css).toContain('overflow-wrap:anywhere');
  expect(css).toContain('@media(max-width:560px)');
  expect(css).toContain('@media(max-width:330px)');
 });
 it('loads latest header CSS after WIDE styles with fresh cache key',()=>{
  expect(html).toContain('skill-codex-header-v2.css?v=0.35.263');
  expect(html.indexOf('skill-codex-header-v2.css')).toBeGreaterThan(html.indexOf('skill-codex-wide.css'));
 });
});
