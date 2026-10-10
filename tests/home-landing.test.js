import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
describe('landing page', () => {
  test('characters have a separate route', () => {
    const html = read('index.html');
    expect(html).toContain('id="landing"');
    expect(html).toContain('id="landingCharactersNavBtn"');
    expect(html).toContain('onclick="openCharacters()"');
  });
  test('home gallery code parses', () => {
    const code = read('features/home/home.js');
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('Math.random()');
  });
});
