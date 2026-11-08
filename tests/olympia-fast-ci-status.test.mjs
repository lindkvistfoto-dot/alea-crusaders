import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');

test('poll pending CI every 10 seconds and settled CI every 30 seconds', () => {
  expect(html).toMatch(/pendingChecks\?10000:30000/);
  expect(html).not.toMatch(/setInterval\(automaticRefresh,120000\)/);
});

test('pending status names the waiting GitHub check', () => {
  expect(html).toMatch(/Väntar på:/);
  expect(html).toMatch(/if\(state==='pending'\)pendingChecks=true/);
});

test('refresh is single-flight and timestamps completed requests', () => {
  expect(html).toMatch(/if\(refreshing\)return/);
  expect(html).toMatch(/refreshing=false;lastRefreshAt=Date\.now\(\)/);
});
