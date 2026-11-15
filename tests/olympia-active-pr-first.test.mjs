import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const approval=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const list=edge.slice(edge.indexOf('if (data.action === "pull_request_list")'),edge.indexOf('if (data.action === "pull_request_history")'));
const history=edge.slice(edge.indexOf('if (data.action === "pull_request_history")'),edge.indexOf('if (data.action === "current_refs")'));
const status=edge.slice(edge.indexOf('if (data.action === "pull_request_status")'),edge.indexOf('if (data.action === "deployment_check")'));
const merge=edge.slice(edge.indexOf('if (data.action === "approve_and_merge_dev")'),edge.indexOf('if (data.action === "prepare_merged_dev_candidate")'));

it('normal PR listing fetches only paginated open PR and targeted active candidate parents',()=>{
 expect(list).toContain('/pulls?state=open&per_page=100&page=');
 expect(list).not.toContain('/pulls?state=closed');
 expect(list).not.toContain('/pulls?state=all');
 expect(list).toContain('activeCandidatePrs');
 expect(list).toContain('repoPath + "/pulls/" + number');
 expect(list).toContain('GITHUB_PR_LIST_INCOMPLETE');
});

it('history is a separate paginated server action and never requests CI',()=>{
 expect(history).toContain('/pulls?state=closed&per_page=50&page=');
 expect(history).toContain('/search/issues?');
 expect(history).toContain('totalCount');
 expect(history).not.toContain('check-runs');
 expect(history).not.toContain('/status');
 expect(page).toContain("historyPanel.addEventListener('toggle'");
 expect(page).toContain("action:'pull_request_history'");
 expect(page).toContain("document.querySelector('#history-search').addEventListener('submit'");
 const refresh=page.slice(page.indexOf('async function refresh()'),page.indexOf('let refreshing=false'));
 expect(refresh).not.toContain("action:'pull_request_history'");
});

it('Draft PRs do not trigger CI and a cached green expires into a disabled approval',()=>{
 expect(page).toContain('pr.draft?{checkRuns:[],statuses:[],pullRequest:null}:await readPrStatus');
 expect(page).toContain('Date.now()-details.verifiedAt<120000');
 expect(page).toContain('button.disabled=true');
 expect(page).toContain('CI-status måste verifieras igen');
});

it('CI reads use authenticated App endpoints for display and approval',()=>{
 expect(page).not.toContain('api.github.com');
 expect(status).toContain('ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/status")');
 expect(status).toContain('ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
 expect(status).not.toContain('ghPublic');
 expect(merge).toContain('ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100")');
 expect(merge).not.toContain('ghPublic');
 expect(edge).toContain('checks: "read", statuses: "read"');
 expect(edge).toContain('mergeable_state !== "clean"');
});

it('DEV approval requires fresh green CI and mergeability and remains disabled after an uncertain failure',()=>{
 expect(page).toContain('details.pullRequest?.mergeableState===\'clean\'');
 expect(page).toContain('details.pullRequest?.state===\'open\'');
 expect(approval).toContain("latest.pullRequest?.mergeableState!=='clean'");
 expect(approval).toContain("assessment.state!=='success'");
 expect(approval).toContain("await window.olympiaV2Refresh?.()");
 expect(approval).not.toContain('button.disabled=false;await window.olympiaV2Refresh?.()');
});
