import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const preview=source.slice(source.indexOf('async function verifiedCandidatePreview('),source.indexOf('async function inspectCandidate('));
describe('OLYMPIA direct Cloudflare preview verification',()=>{
 it('only accepts exact candidate SHA and successful preview deployments',()=>{
  expect(preview).toContain('deployment.environment !== "preview"');
  expect(preview).toContain('deployment.latest_stage?.status !== "success"');
  expect(preview).toContain('deployment.deployment_trigger?.metadata?.commit_hash');
  expect(preview).toContain('releasePrSha.toLowerCase()');
 });
 it('fails closed without credentials or Cloudflare response',()=>{
  expect(preview).toContain('if (!apiToken || !accountId');
  expect(preview).toContain('if (!response.ok) {');
  expect(preview).toContain('console.warn("OLYMPIA_PREVIEW_HTTP_STATUS", response.status');
  expect(preview).toContain('return null;');
  expect(preview).toContain('return null;');
 });
 it('uses a restricted preview hostname and never writes a deployment',()=>{
  expect(preview).toContain('trustedCandidatePreviewUrl(deployment.url)');
  expect(preview).not.toContain('method: "POST"');
  expect(source).toContain('url.hostname === "alea-crusaders.pages.dev"');
 });
});
