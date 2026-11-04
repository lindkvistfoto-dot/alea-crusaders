import { describe, expect, it } from 'vitest';
import {
  normalizeHistoricalPr,
  normalizeImportPayload,
  shouldMarkCompleted,
  suppressedHistoricalPrNumbers,
  validateIdeaPayload,
  validateHistoricalPr,
} from '../olympia-v2/uppslag-core.mjs';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pr = (number, overrides = {}) => ({ number, purpose: 'Syfte', classification: 'not_handled', remaining_need: 'Kvarstår', recommendation: 'Behåll', ...overrides });
const idea = overrides => ({ title: 'Behov', description: 'Beskrivning', status: 'idea_bank', historical_prs: [], ...overrides });

describe('OLYMPIA UPPSLAG', () => {
  it('validates and normalizes historical PR links and classifications', () => {
    expect(validateHistoricalPr(pr(534))).toBe('');
    expect(normalizeHistoricalPr(pr(534))).toMatchObject({
      number: 534,
      url: 'https://github.com/lindkvistfoto-dot/alea-crusaders/pull/534',
      classification: 'not_handled',
      hidden: false,
    });
    expect(validateHistoricalPr(pr(534, { classification: 'ready_to_merge' }))).toContain('klassning');
    expect(validateHistoricalPr(pr(0))).toContain('positivt heltal');
  });

  it('enforces idea statuses, preserves active PR references and requires LIVE proof for completion', () => {
    expect(validateIdeaPayload(idea({ status: 'to_process' }))).toBe('');
    expect(validateIdeaPayload(idea({ status: 'in_olympia', active_pr_number: 524 }))).toBe('');
    expect(validateIdeaPayload(idea({ status: 'in_olympia' }))).toContain('kopplad PR');
    expect(validateIdeaPayload(idea({ status: 'done', active_pr_number: 524 }))).toContain('verifierad LIVE');
    expect(validateIdeaPayload(idea({ status: 'done', active_pr_number: 524, completed_at: '2026-11-03T10:00:00Z' }))).toBe('');
    expect(validateIdeaPayload(idea({ status: 'idea_bank', completed_at: '2026-11-03T10:00:00Z' }))).toContain('LIVE-datum');
  });

  it('filters only historical PRs explicitly marked hidden', () => {
    expect(suppressedHistoricalPrNumbers([
      { historical_prs: [pr(487, { hidden: true }), pr(496, { hidden: false })] },
      { historical_prs: [pr(534, { hidden: true }), pr(487, { hidden: true })] },
    ])).toEqual([487, 534]);
    expect(suppressedHistoricalPrNumbers([{ historical_prs: [pr('bad', { hidden: true })] }])).toEqual([]);
  });

  it('validates CLEAN OLYMPUS import metadata, 38 unique PRs, grouping and no duplicates', () => {
    const rows = Array.from({ length: 38 }, (_, index) => pr(index + 1));
    const payload = {
      schema: 'olympia-uppslag-import/v1',
      source_report: { name: 'CLEAN OLYMPUS', date: '2026-11-03', open_pr_count: 38 },
      ideas: [{ title: 'Samlat arbete', description: 'Flera PR', historical_prs: rows }],
    };
    expect(normalizeImportPayload(payload).ideas[0].historical_prs).toHaveLength(38);
    expect(normalizeImportPayload({ ...payload, source_report: { ...payload.source_report, date: '2026-10-03' } }).error).toContain('3 november 2026');
    expect(normalizeImportPayload({ ...payload, ideas: [{ ...payload.ideas[0], historical_prs: rows.slice(0, 37) }] }).error).toContain('37 unika');
    const repeated = [...rows.slice(0, 37), rows[0]];
    expect(() => normalizeImportPayload({ ...payload, ideas: [{ ...payload.ideas[0], historical_prs: repeated }] })).toThrow('mer än en gång');
  });

  it('marks an item complete only when GitHub ancestry and the published LIVE manifest match', () => {
    const sourceSha = 'a'.repeat(40), releaseSha = 'b'.repeat(40), mainSha = 'c'.repeat(40), testedDevSha = 'd'.repeat(40);
    const sourcePr = { number: 534, state: 'closed', merged: true, base: { ref: 'development' }, merge_commit_sha: sourceSha };
    const decisionIssue = { number: 700, body: '- Ärende-ID: PR-534\n- Testad DEV-commit (full SHA): '+testedDevSha+'\n- Beslut: PANDORAS ASK' };
    const releasePr = { number: 701, merged: true, base: { ref: 'main' }, merge_commit_sha: releaseSha, body: 'Zeus decision journal: #700' };
    const evidence = { sourcePr, testedDevSha, sourceComparison: { status: 'ahead', merge_base_commit: { sha: sourceSha } }, decisionIssue, releasePr, mainSha, releaseComparison: { status: 'ahead', merge_base_commit: { sha: releaseSha } }, manifest: { environment: 'main', source_sha: mainSha } };
    expect(shouldMarkCompleted(evidence)).toBe(true);
    expect(shouldMarkCompleted({ ...evidence, sourceComparison: { status: 'ahead', merge_base_commit: { sha: 'e'.repeat(40) } } })).toBe(false);
    expect(shouldMarkCompleted({ ...evidence, releasePr: { ...releasePr, body: 'another journal' } })).toBe(false);
    expect(shouldMarkCompleted({ ...evidence, manifest: { environment: 'development', source_sha: mainSha } })).toBe(false);
    expect(shouldMarkCompleted({ ...evidence, sourcePr: { ...sourcePr, merged: false } })).toBe(false);
  });

  it('uses the authenticated Olympia endpoint, RLS protected permanent storage and no GitHub mutation for UPPSLAG', () => {
    const page = read('../olympia-v2/uppslag.html');
    const bridge = read('../olympia-v2/dev-approval.js');
    const edge = read('../supabase/functions/olympia-control/index.ts');
    const migration = read('../supabase/migrations/20261103235000_olympia_uppslag.sql');
    expect(page).toContain("api({action:'idea_list'})");
    expect(page).toContain('window.olympiaV2Refresh=load');
    expect(page).toContain('<table class="table">');
    expect(page).toContain('data-priority');
    expect(page).toContain('data-delete');
    expect(page).toContain('Historisk PR (valfri)');
    expect(bridge).toContain('https://wkiuyklzzroavclnsxna.supabase.co/functions/v1/olympia-control');
    expect(edge).toContain('"/pull/" + number');
    expect(edge).toContain('data.action === "idea_list"');
    expect(edge).toContain('data.action === "idea_import"');
    expect(edge).toContain('data.action === "idea_verify_live"');
    expect(edge).toContain('Zeus decision journal: #');
    expect(edge).toContain('releaseComparison');
    expect(edge).toContain('manifest?.source_sha !== mainSha');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('private.is_admin()');
    const ideaBlock = edge.slice(edge.indexOf('if (String(data.action || "").startsWith("idea_"))'), edge.indexOf('if (data.action === "auto_candidate_diagnostics")'));
    expect(ideaBlock).not.toContain('approve_and_merge_dev');
    expect(edge).toContain('data.action === "idea_delete"');
    expect(edge).toContain('IDEA_DELETE_PROTECTED');
    expect(edge).toContain('current.import_source');
    expect(edge).toContain('current.active_pr_number');
    expect(edge).toContain('current.historical_prs');
    expect(ideaBlock).not.toContain('update_pull_request');
  });
});
