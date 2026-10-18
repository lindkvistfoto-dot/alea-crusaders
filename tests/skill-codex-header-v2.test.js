import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=file('features/skills/skill-codex-header-v2.css');
const svg=file('features/skills/codex-assets/header-recess-v2.svg');
const html=file('index.html');
const scope='#skillModal.skill-codex-active';

describe('ARCANE SKILL CODEX WIDE — integrated header V2',()=>{
 it('only modifies the Codex header, not the illustration, stats or parchment',()=>{
  expect(css).toContain(scope+' .modalhead');
  expect(css).toContain(scope+' #skillModalTitle');
  expect(css).toContain(scope+' .skill-codex-icon');
  expect(css).toContain(scope+' .modalclose');
  expect(css).not.toContain('skill-codex-description');
  expect(css).not.toContain('skill-codex-stats');
  expect(css).not.toContain('skill-codex-hero');
 });
 it('replaces visual corner ornaments with opaque decorative recesses',()=>{
  expect(css).toContain('header-recess-v2.svg');
  expect(svg).toContain('fill="#11120d"');
  expect(svg).toContain('viewBox="0 0 180 180"');
  expect(css).toContain('::before');
  expect(css).toContain('::after');
  expect(css).toContain('pointer-events:none');
  // The base stylesheet uses left:50% on ::after; clear it to seat the X at right.
  expect(css).toContain('left:auto');
  expect(css).toContain('bottom:auto');
  expect(css).toContain('.modalhead::after {right:var(--codex-seat-inset)}');
  expect(css).toContain('z-index:1');
 });
 it('aligns title in middle grid track and vertically centers both controls',()=>{
  expect(css).toContain('grid-template-columns:var(--codex-side-track) minmax(0,1fr) var(--codex-side-track)');
  expect(css).toContain('grid-column:2');
  expect(css).toContain('align-self:center');
  expect(css).toContain('text-align:center');
  expect(css).toContain('top:50%');
  expect(css).toContain('transform:translateY(-50%)');
 });
 it('uses own icon frame and a CSS ruby close button, not overlaying two old assets',()=>{
  expect(css).toContain('--codex-icon-size:64px');
  expect(css).toContain('--codex-close-size:55px');
  expect(css).toContain('radial-gradient(circle at 52% 68%');
  expect(css).not.toContain('close-button.webp');
  expect(css).not.toContain('medallion.webp');
  expect(css).toContain('min-width:44px');
  expect(css).toContain('min-height:44px');
 });
 it('loads last so header changes take precedence without editing previous defaults',()=>{
  expect(html).toContain('skill-codex-header-v2.css?v=0.35.262');
  expect(html.indexOf('skill-codex-header-v2.css')).toBeGreaterThan(html.indexOf('skill-codex-wide.css'));
 });
});
