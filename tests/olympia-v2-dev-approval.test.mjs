import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const approval=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
it('verifies the existing ALEA DEV session before DEV approval',()=>{
 expect(approval).toContain("action:'session_check'");
 expect(approval).toContain("action:'approve_and_merge_dev'");
 expect(approval).toContain('pullRequestHeadSha:sha');
 expect(approval).toContain('result.merged!==true');
 expect(approval).toContain('function belongsToDev');
});
it('keeps a merged DEV PR visible as the same numbered card',()=>{
 expect(page).toContain('if(pr.merged_at)');
 expect(page).toContain("action:'pull_request_list'");
 expect(page).toContain('För publicering');
 expect(page).toContain('data-dev-approve');
});
it('uses authenticated GitHub App reads and writes for merge CI validation',()=>{
 expect(backend).toContain('checks: "read", statuses: "read"');
 expect(backend).toContain('gh(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
 expect(backend).not.toContain('ghPublic(path + "/commits/" + data.pullRequestHeadSha');
 expect(backend).toContain('classifyCi(runs, statuses, data.pullRequestHeadSha, Number(checks.total_count)');
});
it('shows the commit whose GitHub checks and preview were evaluated',()=>{
 expect(page).toContain('PR-head-commit testad av CI: <code>');
 expect(page).toContain('details.previewUrl');
});
