import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');

test('poll pending CI every 10 seconds and settled CI every 30 seconds', () => {
  assert.match(html, /pendingChecks\?10000:30000/);
  assert.doesNotMatch(html, /setInterval\(automaticRefresh,120000\)/);
});

test('pending status names the waiting GitHub check', () => {
  assert.match(html, /Väntar på:/);
  assert.match(html, /if\(state==='pending'\)pendingChecks=true/);
});

test('refresh is single-flight and timestamps completed requests', () => {
  assert.match(html, /if\(refreshing\)return/);
  assert.match(html, /refreshing=false;lastRefreshAt=Date\.now\(\)/);
});
