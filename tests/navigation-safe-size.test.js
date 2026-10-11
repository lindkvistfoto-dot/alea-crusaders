import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
const material = read('features/material/viewer.js');

describe('Desktop navigation image sizing regression – v0.35.117', () => {
  const buttonIds = [
    'shopNavBtn','alchemyNavBtn','innNavBtn','academyNavBtn',
    'landingCharactersNavBtn','combatNavBtn'
  ];
  it('never exposes natural 512px intrinsic dimensions in header image tags', () => {
    const header = html.split('<header class="alea-app-header">')[1].split('</nav>')[0];
    expect((header.match(/class="alea-nav-asset alea-nav-asset--normal"/g) || []).length).toBe(6);
    expect((header.match(/class="alea-nav-asset alea-nav-asset--active"/g) || []).length).toBe(6);
    const imgs = [...header.matchAll(/<img[^>]*>/g)].map(match => match[0]);
    expect(imgs.length).toBe(14);
    for (const image of imgs) {
      expect(image).toContain('width="104" height="104"');
      expect(image).not.toContain('width="512"');
    }
    expect(material).not.toContain('width="512" height="512" decoding="async"');
    expect((material.match(/width="104" height="104" decoding="async"/g) || []).length).toBe(2);
  });

  it('embeds independent critical CSS so a stale external stylesheet cannot enlarge images', () => {
    const guard = html.match(/<style id="alea-nav-critical-size">([\s\S]*?)<\/style>/)?.[1];
    expect(guard).toBeTruthy();
    expect(guard).toContain('.alea-toolstrip > .btn.alea-nav-art');
    expect(guard).toContain('overflow:hidden!important');
    expect(guard).toContain('> img.alea-nav-asset');
    expect(guard).toContain('position:absolute!important');
    expect(guard).toContain('width:100%!important');
    expect(guard).toContain('height:100%!important');
    expect(guard).toContain('width:104px!important');
    expect(guard).toContain('height:104px!important');
    expect(guard).toContain('@media (max-width:700px)');
    for(const id of buttonIds){
      expect(html).toContain('id="'+id+'"');
    }
    expect(html.indexOf('<style id="alea-nav-critical-size">')).toBeLessThan(html.indexOf('</head>'));
  });

  it('preserves the 512px actual image resources for sharp 104px rendering', () => {
    const img = readFileSync(new URL('../assets/navigation/alkemi-normal.avif',import.meta.url));
    const ispe = img.indexOf(Buffer.from('ispe'));
    expect(img.readUInt32BE(ispe+8)).toBe(512);
    expect(img.readUInt32BE(ispe+12)).toBe(512);
  });
});
