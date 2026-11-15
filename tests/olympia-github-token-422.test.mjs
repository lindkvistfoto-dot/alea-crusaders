import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
const server=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA GitHub installation token 422',()=>{
 it('fails closed when the requested App permissions are not installed',()=>{
  expect(server).not.toContain('readOnlyPrAction');
  expect(server).not.toContain('requestToken({ repository_ids: [1403008145] })');
  expect(server).toContain('GITHUB_APP_TOKEN_FAILED_' + '422');
  expect(server).toContain('checks: "read", statuses: "read"');
 });
 it('keeps GitHub token server-side and never retries writes',()=>{
  expect(server).toContain('OLYMPIA_GITHUB_APP_PRIVATE_KEY');
  expect(server).toContain('if (!res.ok)');
 });
 it('shows GitHub token failure separately from DEV session failure',()=>{
  expect(ui.indexOf('GITHUB_APP_TOKEN_FAILED_422')).toBeLessThan(ui.indexOf('session|invalid.jwt'));
  expect(ui).toContain('DEV-inloggningen fungerar');
 });
});
