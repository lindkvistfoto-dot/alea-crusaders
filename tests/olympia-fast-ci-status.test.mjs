import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');

test('poll pending CI every 30 seconds and settled CI every 120 seconds', () => {
  expect(html).toMatch(/pendingChecks\?30000:120000/);
  expect(html).toContain('const ttl=cached?.pending?30000:300000');
  expect(html).toContain('mapLimit(shown,5,card)');
});

test('pending status names the waiting GitHub check', () => {
  expect(html).toMatch(/Väntar på:/);
  expect(html).toMatch(/if\(state==='pending'\)pendingChecks=true/);
});

test('refresh is single-flight and timestamps completed requests', () => {
  expect(html).toMatch(/if\(refreshing\)return/);
  expect(html).toMatch(/refreshing=false;lastRefreshAt=Date\.now\(\)/);
});
