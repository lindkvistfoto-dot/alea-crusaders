import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
const approval = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');

test('PR list is a compact disclosure with date, status, and process stages', () => {
  expect(html).toMatch(/class="panel pr-disclosure"/);
  for (const stage of ['Ready', 'Test', 'DEV', 'LIVE']) expect(html).toContain("step('" + stage + "'");
  expect(html).toContain("toLocaleDateString('sv-SE')");
  expect(html).toMatch(/pr-summary h2\{[^}]*text-overflow:ellipsis/);
});

test('DEV and LIVE stay side-by-side with fixed aligned action slots', () => {
  expect(html).toMatch(/\.pr-disclosure \.lanes\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  expect(html).toMatch(/\.pr-disclosure \.lane\{display:grid;grid-template-rows:/);
  expect(html).toMatch(/data-dev-approve/);
  expect(html).toMatch(/Godkänn LIVE/);
  expect(html).toMatch(/Preview DEV/);
  expect(html).toMatch(/Fler LIVE-åtgärder/);
});

test('Enbart DEV requires an interactive checkbox and a server action', () => {
  expect(html).toMatch(/data-dev-only-choice=/);
  expect(html).toMatch(/!ready\|\|pr\.draft\|\|!window\.olympiaV2ZeusVerified/);
  expect(approval).toMatch(/devOnly\},session\(\)/);
  expect(edge).toMatch(/reserveDevDecision\(token, data\.pullRequestNumber, data\.pullRequestHeadSha, devOnly, devBaseSha\)/);
  expect(edge).toMatch(/recordDevOnlyCompletion\(token, data\.pullRequestNumber/);
  expect(edge).toMatch(/No LIVE candidate created|LIVE-kandidat skapades inte/);
});

test('DEV-only completion is idempotent, audited, and blocks both LIVE candidate paths', () => {
  expect(edge).toMatch(/DEV_DECISION_ALREADY_SELECTED/);
  expect(edge).toMatch(/alreadyCompleted: true/);
  expect(edge).toMatch(/DEV head-SHA|PR head-SHA/);
  expect(edge).toMatch(/isDevOnlyDecision\(decisionToken/);
  expect(edge).toMatch(/isDevOnlyDecision\(token, number, String\(sourcePr\.head/);
  expect(html).toMatch(/p\.devOnly/);
  expect(html).toMatch(/p\.livePublished\|\|p\.devOnly/);
});

test('shared feedback and collapsed verified history stay available', () => {
  expect(html).toMatch(/data-pr-feedback/);
  expect(html).toMatch(/class="pr-log"/);
  expect(html).toMatch(/Öppna PR-historik/);
  expect(approval).toMatch(/data-pr-feedback/);
  expect(approval).toMatch(/data-pr-feedback/);
});

test('candidate indicators preserve off, pending, green, and failed styles', () => {
  for (const state of ['success','pending','failed','unknown']) expect(html).toMatch(new RegExp('status-light\\.' + state));
});

test('DEV-only child PRs render under the parent and malformed lane markup is absent', () => {
  expect(approval).toMatch(/querySelector\('\.pr-body'\)\?\.append\(childCard\)/);
  expect(html).toMatch(/<div class="lanes"><section class="lane"><h3>DEV/);
  expect(html).not.toMatch(/<div class="lanes"<section/);
});
