import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const part=source.slice(source.indexOf('async function verifiedCandidatePreview('),source.indexOf('function trustedCandidatePreviewUrl('));
describe('Cloudflare Pages preview request validation',()=>{
 it('uses conservative pagination and preserves exact SHA validation',()=>{
  expect(part).toContain('per_page=20&page=');
  expect(part).toContain('page <= 20');
  expect(part).toContain('payload.result.length < 20');
  expect(part).toContain('deployment.deployment_trigger?.metadata?.commit_hash');
 });
 it('records only Cloudflare numeric error codes and fails closed',()=>{
  expect(part).toContain('CLOUDFLARE_ERROR_CODES');
  expect(part).toContain('Number(error.code)');
  expect(part).not.toContain('console.warn(apiToken)');
  expect(part).toContain('return null;');
 });
});
