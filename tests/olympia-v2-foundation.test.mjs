import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
it('V2 stays separate from OLYMPIA V1 and preserves the same PR card after merge',()=>{
  expect(page).toContain('ALEA ADMIN · OLYMPIA 2.0 · DEV');
  expect(page).toContain('DEV-granskning kräver verifierad ALEA-session');
  expect(page).toContain('data-dev-approve');
  expect(page).toContain('if(pr.merged_at)');
  expect(page).toContain('data-pr=');
  expect(page).toContain("'+id+'");
});
it('browser PR and status requests go through the authenticated ALEA function',()=>{
  expect(page).toContain("action:'pull_request_list'");
  expect(page).toContain("action:'pull_request_status'");
  expect(page).not.toContain('api.github.com');
  expect(page).not.toContain('fetch(base+path');
  expect(backend).toContain('githubToken("pull_request_list")');
  expect(backend).toContain('githubToken("pull_request_status")');
});
it('lists open development PRs and paginates every merged development PR',()=>{
  expect(backend).toContain('pulls?state=open&base=development&per_page=100');
  expect(backend).toContain('pulls?state=closed&base=development&per_page=100&page=');
  expect(backend).toContain('for (let page = 1; page <= 1000; page++)');
  expect(backend).toContain('pr.merged === true && pr.base?.ref === "development"');
  expect(page).not.toMatch(/\.slice\(0,\s*25\)/);
});
it('revalidates the active ALEA session on every protected request',()=>{
  expect(backend).toContain('client.auth.getUser(bearer)');
  expect(backend).toContain('user.email_confirmed_at');
  expect(backend).toContain('user.email?.toLowerCase() !== allowedEmail');
});
it('refreshes are single-flight and card filters use the cached PR list',()=>{
  expect(page).toContain('if(refreshing){pendingRefresh=true;return}');
  expect(page).toContain('filter.addEventListener(\'change\',renderCards)');
  expect(page).toContain('Promise.all(Array.from({length:Math.min(5,shown.length)}');
});
it('does not expose GitHub tokens or private keys to the browser',()=>{
  expect(page).not.toMatch(/OLYMPIA_GITHUB_APP_PRIVATE_KEY|installation_token|ghp_[A-Za-z0-9]{20,}/);
  expect(backend).toContain('OLYMPIA_GITHUB_APP_PRIVATE_KEY');
});
