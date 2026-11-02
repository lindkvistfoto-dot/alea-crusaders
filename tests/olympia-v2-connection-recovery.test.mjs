import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const backend=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const approval=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');

it('denies protected calls unless the existing ALEA DEV session belongs to Zeus',()=>{
 expect(backend).toContain('client.auth.getUser(bearer)');
 expect(backend).toContain('user.email_confirmed_at');
 expect(backend).toContain('user.email?.toLowerCase() !== allowedEmail');
 expect(approval).toContain('alea_supabase_session_dev');
 expect(approval).toContain('Authorization:');
});
it('uses GitHub App installation tokens on PR list, status and merge requests',()=>{
 expect(backend).toContain('githubToken("pull_request_list")');
 expect(backend).toContain('githubToken("pull_request_status")');
 expect(backend).toContain('githubToken("approve_and_merge_dev")');
 expect(backend).toContain('? { pull_requests: "read" }');
 expect(backend).toContain('{ contents: "read", issues: "read", pull_requests: "read", checks: "read" }');
 expect(backend).toContain('"Authorization": "Bearer " + token');
});
it('recovers open and merged DEV PRs without a silent display cap',()=>{
 expect(backend).toContain('state=open&base=development');
 expect(backend).toContain('state=closed&base=development');
 expect(backend).toContain('GITHUB_PR_LIST_PAGE_LIMIT');
 expect(page).not.toContain('.slice(0,25)');
});
it('rejects a status response for a PR whose head changed during the request',()=>{
 expect(backend).toContain('pr.head?.sha !== data.pullRequestHeadSha');
 expect(backend).toContain('PR-versionen har ändrats');
});
it('serializes list refreshes and ignores stale card renders',()=>{
 expect(page).toContain('if(refreshing){pendingRefresh=true;return}');
 expect(page).toContain('if(version!==cardRenderVersion)return');
 expect(page).toContain('filter.addEventListener(\'change\',renderCards)');
});
