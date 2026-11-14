import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');

test('compact PR list remains a disclosure with process steps', () => {
  assert.match(html, /class="panel pr-disclosure"/);
  for (const stage of ['Ready', 'Test', 'DEV', 'LIVE']) assert.ok(html.includes("step('"+stage+"'"));
  assert.match(html, /pr-summary h2\{[^}]*text-overflow:ellipsis/);
});

test('DEV and LIVE stay side-by-side with aligned decision slots', () => {
  assert.match(html, /\.pr-disclosure \.lanes\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(html, /\.pr-disclosure \.lane\{display:grid;grid-template-rows:/);
  assert.match(html, /data-dev-approve/);
  assert.match(html, /Godkänn LIVE/);
});

test('shared feedback and history are present without enabling unimplemented DEV-only action', () => {
  assert.match(html, /data-pr-feedback/);
  assert.match(html, /class="pr-activity"/);
  assert.match(html, /class="pr-log"/);
  assert.match(html, /type="checkbox" disabled> Enbart DEV/);
});

test('candidate state indicators retain four visual states', () => {
  for (const state of ['success','pending','failed','unknown']) {
    assert.match(html, new RegExp('status-light\\.'+state));
  }
});
