import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('OLYMPIA LIVE candidate',()=>{
 it('includes the approved mobile correction in the exact candidate source set',()=>{
  const queue=JSON.parse(read('olympia/work-items.json'));
  const item=queue.items.find(entry=>entry.id==='PILOT-001');
  expect(item.release_source_prs).toEqual([385,404]);
  const pilot002=queue.items.find(entry=>entry.id==='PILOT-002');
  expect(pilot002.release_source_prs).toEqual([432,434,435,436,437,448]);
  expect(pilot002.features).toContain('index.html');
  const workflow=read('.github/workflows/olympia-release-candidate.yml');
  expect(workflow).toContain('mapfile -t SOURCE_PRS');
  expect(workflow).toContain('git -C "$SOURCE_DIR" apply --3way --index "$PATCH_FILE"');
  expect(workflow).toContain('git -C "$DEV_DIR" worktree add --detach "$SOURCE_DIR" "$LIVE_SHA"');
  expect(workflow).toContain('reconcile-index-asset-versions.mjs');
  expect(workflow).toContain('No candidate PR was created.');
  expect(workflow).not.toContain('git -C "$SOURCE_DIR" apply "$PATCH_FILE"');
  expect(workflow).toContain('git -C "$DEV_DIR" diff --binary --full-index "$PR_PARENT_SHA" "$PR_MERGE_SHA"');
  expect(workflow).toContain('git -C "$SOURCE_DIR" add -A');
  expect(workflow).toContain('EXPECTED_TREE: ${{ steps.candidate.outputs.candidate_tree }}');
  expect(workflow).toContain('ACTUAL_TREE="$(git -C "$SOURCE_DIR" write-tree)"');
  expect(workflow).toContain('git -C "$SOURCE_DIR" diff --quiet');
  expect(workflow).not.toContain('git -C "$SOURCE_DIR" status --porcelain');
  expect(workflow).not.toContain('refs/pull/$PR_NUMBER/head');
  expect(workflow).toContain('git -C "$DEV_DIR" merge-base --is-ancestor "$PR_MERGE_SHA" "$TESTED_SHA"');
  expect(workflow).toContain('The accepted change files changed after Zeus tested this DEV version. Refresh OLYMPIA and test again.');
  expect(workflow).toContain('Wait for release PR CI and mergeability');
  expect(workflow).toContain('checks: read');
  expect(workflow).toContain('statuses: read');
  expect(workflow).toContain('STATUS_CONTEXTS="$(jq');
  expect(workflow).toContain('STATUS_CONTEXTS == 0');
  expect(workflow).toContain('Release PR checks: all GitHub checks passed; PR is mergeable.');
  expect(workflow).toContain('GIT_AUTHOR_DATE="$ISSUE_CREATED_AT" GIT_COMMITTER_DATE="$ISSUE_CREATED_AT"');
  expect(workflow).toContain('ATTEMPT="$(jq -r \'.attempt // 1\'');
  expect(workflow).toContain('push --force origin "HEAD:refs/heads/$BRANCH"');
  expect(workflow).toContain('id-token: write');
  expect(workflow).toContain('functions/v1/olympia-candidate-bridge');
  expect(workflow).toContain('audience=alea-olympia-candidate-pr');
  expect(workflow).toContain('CANDIDATE_ATTEMPT');
  expect(workflow).not.toContain('github.rest.pulls.create');
  const bridge=read('supabase/functions/olympia-candidate-bridge/index.ts');
  expect(bridge).toContain('let pull = Array.isArray(existing) ? existing[0] : null');
  expect(bridge).toContain('Zeus decision journal: #" + issueNumber');
  expect(workflow).toContain('SOURCE_PRS: ${{ steps.candidate.outputs.source_prs }}');
  expect(workflow).toContain('BRANCH="olympia/${ITEM_ID,,}/issue-$ISSUE_NUMBER-live-$LIVE_SHA"');
  expect(workflow).toContain('release($ITEM_ID): verified candidate from LIVE (attempt $ATTEMPT)');
  expect(workflow).toContain('PRIMARY_PR="$(jq -r');
  expect(workflow).toContain('-- "${ALLOWED_FILES[@]}"');
  expect(workflow).not.toContain('ITEM_ID" == "PILOT-001"');
  expect(workflow).toContain('source_prs:process.env.SOURCE_PRS.split(",").map(Number)');
 });
 it('retries the same decision from current DEV while preserving the request attempt',()=>{
  const edge=read('supabase/functions/olympia-control/index.ts');
  expect(edge).toContain('attempt = Math.max(1, Number(previous.attempt) || 1) + 1;');
  expect(edge).toContain('method: "PATCH",');
  expect(edge).toContain('body: JSON.stringify({ sha: ref.object.sha, force: true }),');
  expect(edge).toContain('contents/" + path + "?ref=" + encodeURIComponent(branch)');
 });
 it('keeps candidate publication behind explicit final Zeus approval',()=>{
  const workflow=read('.github/workflows/olympia-release-candidate.yml');
  const bridge=read('supabase/functions/olympia-candidate-bridge/index.ts');
  expect(bridge).toContain('- This PR is not approved for LIVE until OLYMPIA final approval is recorded.');
  expect(workflow).toContain("publication:'NOT_PERFORMED'");
  expect(workflow).toContain('LIVE publication: NOT PERFORMED.');
 });
  it('starts a single-item LIVE PR only for Pandoras Ask; packages stay queued',()=>{
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(workflow).toContain('Only a Pandoras Ask start order can create a single-item LIVE PR candidate.');
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('Ändringen lades i releasepaketet. Ingen LIVE-PR har startats.');
    expect(edge).toContain('if (data.decision === "pandoras_ask") {');
  });
});
