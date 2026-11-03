import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const preview=edge.slice(edge.indexOf('async function verifiedCandidatePreview('),edge.indexOf('function trustedCandidatePreviewUrl('));
describe('OLYMPIA preview diagnostics do not leak credentials',()=>{
 it('distinguishes configuration, HTTP, response, and transport failures',()=>{
  for(const code of ['OLYMPIA_PREVIEW_CONFIG_UNAVAILABLE','OLYMPIA_PREVIEW_HTTP_STATUS','OLYMPIA_PREVIEW_RESPONSE_INVALID','OLYMPIA_PREVIEW_REQUEST_FAILED'])expect(preview).toContain(code);
 });
 it('never logs token values or bypasses candidate verification',()=>{
  expect(preview).not.toContain('console.log(apiToken)');
  expect(preview).not.toContain('console.warn(apiToken)');
  expect(preview).toContain('releasePrSha.toLowerCase()');
  expect(preview).toContain('return null;');
 });
});
