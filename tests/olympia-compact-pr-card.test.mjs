import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');

test('compact PR list remains a disclosure with process steps', () => {
  expect(html).toMatch(/class="panel pr-disclosure"/);
  for (const stage of ['Ready', 'Test', 'DEV', 'LIVE']) expect(html).toContain("step('" + stage + "'");
  expect(html).toMatch(/pr-summary h2\{[^}]*text-overflow:ellipsis/);
});

test('DEV and LIVE stay side-by-side with aligned decision slots', () => {
  expect(html).toMatch(/\.pr-disclosure \.lanes\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  expect(html).toMatch(/\.pr-disclosure \.lane\{display:grid;grid-template-rows:/);
  expect(html).toMatch(/data-dev-approve/);
  expect(html).toMatch(/Godkänn LIVE/);
});

test('shared feedback and history are present without enabling unimplemented DEV-only action', () => {
  expect(html).toMatch(/data-pr-feedback/);
  expect(html).toMatch(/class="pr-activity"/);
  expect(html).toMatch(/class="pr-log"/);
  expect(html).toMatch(/type="checkbox" disabled> Enbart DEV/);
});

test('candidate state indicators retain four visual states', () => {
  for (const state of ['success','pending','failed','unknown']) {
    expect(html).toMatch(new RegExp('status-light\\.' + state));
  }
});

test('expanded card keeps valid DEV/LIVE lane container markup', () => {
  expect(html).toMatch(/<div class="lanes"><section class="lane"><h3>DEV/);
  expect(html).not.toMatch(/<div class="lanes"<section/);
});
