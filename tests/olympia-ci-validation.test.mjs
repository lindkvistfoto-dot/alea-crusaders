import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

const source = readFileSync(new URL('../supabase/functions/_shared/olympia-ci.js', import.meta.url), 'utf8');
const sandbox = {};
runInNewContext(source, sandbox);
const assess = sandbox.olympiaCiValidation.assess;
const sha = 'a'.repeat(40);
const required = [
  { name: 'check', status: 'completed', conclusion: 'success', head_sha: sha },
  { name: 'guard', status: 'completed', conclusion: 'success', head_sha: sha },
  { name: 'preview', status: 'completed', conclusion: 'success', head_sha: sha },
  { name: 'Cloudflare Pages', status: 'completed', conclusion: 'success', head_sha: sha },
];
const response = (runs = required, extra = {}) => ({ total_count: runs.length, check_runs: runs, sha, ...extra });

describe('OLYMPIA shared DEV CI verdict', () => {
  it('accepts green exact-SHA checks when the empty legacy status API says pending', () => {
    expect(assess(response(), { sha, state: 'pending', statuses: [] }, sha).state).toBe('success');
  });
  it('blocks pending and failed checks', () => {
    expect(assess(response(required.map((x, i) => i ? x : { ...x, status: 'in_progress' })), { sha, statuses: [] }, sha).state).toBe('pending');
    expect(assess(response(required.map((x, i) => i ? x : { ...x, conclusion: 'failure' })), { sha, statuses: [] }, sha).state).toBe('failed');
  });
  it('blocks missing required checks and incomplete pagination', () => {
    expect(assess(response(required.slice(1)), { sha, statuses: [] }, sha).code).toBe('CI_CHECKS_MISSING');
    expect(assess(response(required, { total_count: required.length + 1 }), { sha, statuses: [] }, sha).code).toBe('CI_CHECKS_INCOMPLETE');
  });
  it('never reuses check runs or commit statuses from another SHA', () => {
    expect(assess(response(required.map(x => ({ ...x, head_sha: 'b'.repeat(40) }))), { sha, statuses: [] }, sha).code).toBe('CI_SHA_MISMATCH');
    expect(assess(response(), { sha: 'b'.repeat(40), statuses: [] }, sha).code).toBe('CI_SHA_MISMATCH');
  });
  it('distinguishes failed, pending, and unknown legacy statuses', () => {
    expect(assess(response(), { sha, state: 'failure', statuses: [{ state: 'failure' }] }, sha).state).toBe('failed');
    expect(assess(response(), { sha, state: 'pending', statuses: [{ state: 'pending' }] }, sha).state).toBe('pending');
    expect(assess(response(), { sha, state: 'unknown', statuses: [{ state: 'unknown' }] }, sha).code).toBe('CI_STATUS_UNKNOWN');
  });
});

describe('OLYMPIA DEV approval API contract', () => {
  it('keeps Draft and GitHub merge confirmation fail-closed', () => {
    const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
    expect(edge).toContain('if (pr.draft) throw new Error("PR_IS_DRAFT")');
    expect(edge).toContain('merged.merged === true');
    expect(edge).toContain('GITHUB_MERGE_NOT_CONFIRMED');
    expect(edge).toContain('throw mergeError');
  });
  it('copies the shared evaluator beside the static OLYMPIA page at build time', () => {
    const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
    const ui = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
    expect(vite).toContain('resolve("supabase/functions/_shared/olympia-ci.js")');
    expect(vite).toContain('resolve("dist/olympia-v2/ci-validation.js")');
    expect(ui).toContain('<script src="./ci-validation.js"></script>');
  });
  it('requests CI read scopes only for the DEV merge token', () => {
    const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
    expect(edge).toContain('decision === "approve_and_merge_dev"');
    expect(edge).toContain('checks: "read", statuses: "read"');
  });
  it('does not translate GitHub API failures into a failed CI verdict', () => {
    const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
    expect(edge).toContain('GITHUB_APP_TOKEN_FAILED_422: "GitHub App saknar nödvändiga Checks/Statuses-läsbehörigheter.');
    expect(edge).toContain('GITHUB_REQUEST_FAILED_403: "GitHub nekade CI-verifieringen (403)');
    expect(edge).toContain('GITHUB_REQUEST_FAILED_502: "GitHub CI-tjänst är tillfälligt otillgänglig (502)');
    expect(edge).toContain('GITHUB_REQUEST_FAILED_504: "GitHub CI-tjänst svarade inte i tid (504)');
    expect(edge).toContain('CI_PENDING: "CI körs fortfarande.');
    expect(edge).not.toContain('CI_NOT_GREEN');
  });
});
