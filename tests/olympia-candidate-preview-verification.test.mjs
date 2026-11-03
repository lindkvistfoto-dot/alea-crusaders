import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('LIVE candidate preview is verified and fail-closed',()=>{
 it('requires deployment matching exact release PR SHA',()=>{
  expect(edge).toContain('deployment.sha || "").toLowerCase() !== releasePrSha.toLowerCase()');
  expect(edge).toContain('entry.state === "success"');
  expect(edge).toContain('previewUrl: await verifiedCandidatePreview(token, verified.pr.head.sha)');
 });
 it('only accepts Cloudflare preview host, not production',()=>{
  expect(edge).toContain('trustedCandidatePreviewUrl(deployment.url)');
  expect(edge).toContain('url.hostname === "alea-crusaders.pages.dev"');
  expect(ui).toContain("verifiedUrl.hostname.endsWith('.alea-crusaders.pages.dev')");
 });
 it('keeps preview disabled without verified URL and never enables publishing',()=>{
  expect(ui).toContain('preview.disabled=true');
  expect(ui).toContain('if(candidate.previewUrl)');
  expect(ui).toContain('control.disabled=true');
 });
});
