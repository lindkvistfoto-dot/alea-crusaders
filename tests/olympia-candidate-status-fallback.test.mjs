import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const start=source.indexOf('if (data.action === "auto_candidate_diagnostics")');
const end=source.indexOf('if (data.action === "pull_request_list")',start);
const edge=source;
const diagnostic=source.slice(start,end);
describe('OLYMPIA candidate status survives preview verification failure',()=>{
 it('keeps the candidate requested and approval locked on verifier errors',()=>{
  expect(diagnostic).toContain('candidate = { ready: false, blocked: false');
  expect(diagnostic).toContain('LIVE-beslut förblir låsta');
  expect(diagnostic).toContain('state, locked, requestPresent, candidate');
 });
 it('keeps a failed Pandoras Ask visible with its reason and workflow run',()=>{
  expect(diagnostic).toContain('BLOCKERAD – LIVE-kandidat kunde inte skapas. Felorsak: ');
  expect(diagnostic).toContain('workflowRunUrl');
  expect(edge).toContain('liveCandidateActive: Boolean(pr.merged_at && activeCandidatePrs.has(Number(pr.number)))');
 });
 it('marks a merged candidate published only when its merge is in deployed main',()=>{
  expect(edge).toContain('liveMergePublicationStatus(token, mergeMatch[1])');
  expect(edge).toContain('await verifyPublishedManifest("main", liveSha)');
  expect(edge).toContain('["ahead", "identical"].includes(String(comparison.status || ""))');
  expect(edge).toContain('liveCandidateActive: Boolean(pr.merged_at && activeCandidatePrs.has(Number(pr.number)) && !livePublished)');
  expect(edge).toContain('livePublished');
  expect(html).toContain('Publicerad i LIVE · verifierad');
  expect(ui).toContain("candidate?.published===true");
 });
 it('does not turn a failed journal or lock check into success',()=>{
  expect(diagnostic).toContain('return fail("Kandidatens lås eller journal kunde inte verifieras. Ingen ändring gjordes.", 502)');
 });
});
