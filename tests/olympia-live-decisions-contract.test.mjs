import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const server = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const finalStart = server.indexOf('if (data.decision === "final_approval") {');
const finalBlock = server.slice(finalStart, server.indexOf('if (data.decision === "pandoras_ask" || data.decision === "release_package")', finalStart));

describe('OLYMPIA LIVE decision safety contracts (no network writes)', () => {
  it('allows only known server decisions', () => {
    for (const action of ['final_approval','release_package','needs_fix','karon'])
      expect(server).toContain('"'+action+'"');
  });
  it('checks exact candidate, preview and LIVE baseline before any merge', () => {
    const verify = finalBlock.indexOf('candidate = await verifyCandidate(token, item, data)');
    const preview = finalBlock.indexOf('await verifiedCandidatePreview(token, candidate.pr.head.sha)');
    const baseline = finalBlock.indexOf('liveBeforeMerge.sha !== candidate.liveSha');
    const merge = finalBlock.indexOf('merge_method: "squash"');
    expect(verify).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(verify);
    expect(baseline).toBeGreaterThan(preview);
    expect(merge).toBeGreaterThan(baseline);
    expect(finalBlock).toContain('if (!previewUrl) return fail(');
  });
  it('release package explicitly does not publish to LIVE', () => {
    expect(server).toContain('Ingen LIVE-PR har startats.');
    expect(server).toContain('data.decision === "release_package"');
  });
  it('return-to-work and discard decisions do not use final approval merge path', () => {
    const nonFinal = server.slice(server.indexOf('const decisionIssue = await gh('));
    expect(nonFinal).not.toContain('merge_method: "squash"');
    expect(nonFinal).toContain('data.decision === "pandoras_ask"');
  });
  it('keeps LIVE controls disabled until the decision flow is connected', () => {
    expect(ui).toContain('approve.disabled=!pilotReady');
    expect(ui).toContain('control.disabled=true');
  });
});
