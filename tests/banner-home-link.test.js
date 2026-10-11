import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Alea crest in the desktop banner', () => {
  const html = read('index.html');
  const css = read('features/home/topbar.css');
  const homeJs = read('features/home/home.js');

  test('renders one accessible link to the genuine landing page with two interchangeable images', () => {
    const head = html.split('<header class="alea-app-header">')[1].split('</header>')[0];
    expect(head).toContain('id="aleaBannerHomeLink"');
    expect(head).toContain('href="#landing"');
    expect(head).toContain('onclick="event.preventDefault();openLanding()"');
    expect(head).toContain('aria-label="Gå till Alea Crusaders framsida"');
    expect(head).toContain('assets/navigation/home-normal.avif');
    expect(head).toContain('assets/navigation/home-active.avif');
  });

  test('uses sharp, transparency-capable 512px AVIF assets for both Home states', () => {
    for (const name of ['home-normal.avif', 'home-active.avif']) {
      const image = readFileSync(new URL('../assets/navigation/' + name, import.meta.url));
      expect(image.toString('ascii',4,12)).toBe('ftypavif');
      const ispe = image.indexOf(Buffer.from('ispe'));
      expect(ispe).toBeGreaterThan(0);
      expect(image.readUInt32BE(ispe+8)).toBe(512);
      expect(image.readUInt32BE(ispe+12)).toBe(512);
    }
  });

  test('shows active image only for landing and preserves mobile header', () => {
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('.alea-app-header .alea-banner-home-link {display:none}');
    expect(css).toContain('.alea-banner-home-link[aria-current="page"] .alea-banner-home-icon--active {opacity:1}');
    expect(homeJs).toContain("if (bannerHome) bannerHome.setAttribute('aria-current', landingCurrent)");
    expect(homeJs).toContain('window.openLanding = openLanding;');
  });
});
