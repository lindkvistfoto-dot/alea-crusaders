import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
const approval = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');

test('PR list is a compact disclosure with date, status, and process stages', () => {
  expect(html).toMatch(/class="panel pr-disclosure"/);
  for (const stage of ['Ready', 'Test', 'DEV', 'LIVE']) expect(html).toContain("step('" + stage + "'");
  expect(html).toContain("toLocaleDateString('sv-SE')");
  expect(html).toContain("x.status==='completed'&&x.conclusion==='success'");
  expect(html).toContain("String(x.head_sha||'').toLowerCase()===String(sha).toLowerCase()");
  expect(html).toMatch(/pr-summary h2\{[^}]*text-overflow:ellipsis/);
});

test('DEV and LIVE stay side-by-side with fixed aligned action slots', () => {
  expect(html).toMatch(/\.pr-disclosure \.lanes\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  expect(html).toMatch(/\.pr-disclosure \.lane\{display:grid;grid-template-rows:/);
  expect(html).toMatch(/data-dev-approve/);
  expect(html).toMatch(/Godkänn LIVE/);
  expect(html).toMatch(/Preview DEV/);
  expect(html).toMatch(/Fler LIVE-åtgärder/);
  expect(html).toMatch(/class="live-status"/);
  expect(html).toMatch(/data-live-ci/);
  expect(html).toMatch(/data-live-preview/);
  expect(html).toMatch(/link\(previewDevUrl,'Preview DEV'\)/);
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
  expect(approval).toContain("diagnosticDetails.className='pr-log'");
  expect(approval).toContain("Tekniska LIVE-detaljer");
  expect(approval).toMatch(/window\.olympiaV2Feedback=feedback/);
  expect(html).toMatch(/Klick registrerat · uppdaterar PR-status hos GitHub/);
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


test('DEV-only and ordinary DEV decision locks are idempotent and mutually exclusive', async () => {
  const start = edge.indexOf('const devDecisionRefName');
  const end = edge.indexOf('async function isDevOnlyDecision', start);
  const source = edge.slice(start, end).replaceAll(': number', '').replaceAll(': string', '').replaceAll(': boolean', '');
  const refs = new Map();
  const gh = async (_token, path, options) => {
    if (path.endsWith('/git/refs') && options?.method === 'POST') {
      const request = JSON.parse(options.body);
      const name = request.ref.replace(/^refs\/heads\//, '');
      if (refs.has(name)) throw new Error('GITHUB_REQUEST_FAILED_422');
      refs.set(name, request.sha);
      return { object: { sha: request.sha } };
    }
    const match = path.match(/\/git\/ref\/heads\/(.+)$/);
    if (match) {
      const sha = refs.get(decodeURIComponent(match[1]));
      if (!sha) throw new Error('GITHUB_REQUEST_FAILED_404');
      return { object: { sha } };
    }
    throw new Error('unexpected GitHub path');
  };
  const reserve = new Function('gh', 'OWNER', 'REPO', source + '; return reserveDevDecision;')(gh, 'owner', 'repo');
  const sha = letter => letter.repeat(40);

  await expect(reserve('token', 42, sha('a'), true, sha('c'))).resolves.toMatchObject({ selectedSha: sha('a') });
  await expect(reserve('token', 42, sha('a'), true, sha('d'))).resolves.toMatchObject({ selectedSha: sha('a') });
  await expect(reserve('token', 42, sha('a'), false, sha('c'))).rejects.toThrow('DEV_DECISION_ALREADY_SELECTED');

  await expect(reserve('token', 43, sha('b'), false, sha('d'))).resolves.toMatchObject({ selectedSha: sha('d') });
  await expect(reserve('token', 43, sha('b'), false, sha('e'))).resolves.toMatchObject({ selectedSha: sha('d') });
  await expect(reserve('token', 43, sha('b'), true, sha('d'))).rejects.toThrow('DEV_DECISION_ALREADY_SELECTED');
});
