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
    expect(head).toContain('assets/navigation/home-normal.png');
    expect(head).toContain('assets/navigation/home-active.png');
  });

  test('uses real transparent PNG assets with matching dimensions', () => {
    for (const name of ['home-normal.png', 'home-active.png']) {
      const image = readFileSync(new URL('../assets/navigation/' + name, import.meta.url));
      expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(image.readUInt32BE(16)).toBe(96);
      expect(image.readUInt32BE(20)).toBe(96);
    }
  });

  test('shows active image only for landing and preserves mobile header', () => {
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('.alea-app-header .alea-banner-home-link { display: none; }');
    expect(css).toContain('.alea-banner-home-link[aria-current="page"] .alea-banner-home-icon--active { opacity: 1; }');
    expect(homeJs).toContain("if (bannerHome) bannerHome.setAttribute('aria-current', landingCurrent)");
    expect(homeJs).toContain('window.openLanding = openLanding;');
  });
});
