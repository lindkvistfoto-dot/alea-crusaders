import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('home mobile viewport regression',()=>{
  const css=read('features/home/home.css');
  test('home hero no longer forces 470px minimum on mobile',()=>{
    const responsive=css.slice(css.indexOf('/* v0.35.64'));
    expect(responsive).toContain('height:clamp(390px,105vw,510px)');
    expect(responsive).toContain('min-height:0');
    expect(responsive).toContain('aspect-ratio:auto');
  });
  test('hero and shortcut cards stay within phone width',()=>{
    const responsive=css.slice(css.indexOf('/* v0.35.64'));
    expect(responsive).toContain('main:has(> #landing:not(.hidden))');
    expect(responsive).toContain('overflow-x:clip');
    expect(responsive).toContain('#landing .landing-cinematic');
    expect(responsive).toContain('max-width:100%');
    expect(responsive).toContain('grid-template-columns:minmax(0,1fr)');
    expect(responsive).toContain('header .landing-route-nav');
  });
  test('extra narrow phones get tighter gallery and title',()=>{
    const responsive=css.slice(css.indexOf('@media(max-width:360px)',css.indexOf('/* v0.35.64')));
    expect(responsive).toContain('#landing .landing-cinematic{height:380px}');
    expect(responsive).toContain('#landing .landing-hero-copy h2{font-size:28px');
  });
});
