import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('OLYMPIA Astrid LIVE candidate',()=>{
 it('includes the approved mobile correction in the exact candidate source set',()=>{
  const queue=JSON.parse(read('olympia/work-items.json'));
  const item=queue.items.find(entry=>entry.id==='PILOT-001');
  expect(item.release_source_prs).toEqual([385,404]);
  const workflow=read('.github/workflows/olympia-release-candidate.yml');
  expect(workflow).toContain('mapfile -t SOURCE_PRS');
  expect(workflow).toContain('git -C "$SOURCE_DIR" apply "$PATCH_FILE"');
  expect(workflow).toContain('git -C "$DEV_DIR" diff --binary "$PR_PARENT_SHA" "$PR_MERGE_SHA"');
  expect(workflow).toContain('git -C "$SOURCE_DIR" add -A');
  expect(workflow).not.toContain('refs/pull/$PR_NUMBER/head');
  expect(workflow).toContain('git -C "$DEV_DIR" merge-base --is-ancestor "$PR_MERGE_SHA" "$TESTED_SHA"');
  expect(workflow).toContain('The accepted trophy-room files changed after Zeus tested this DEV version');
  expect(workflow).toContain('source_prs:process.env.SOURCE_PRS.split(",").map(Number)');
 });
 it('keeps candidate publication behind explicit final Zeus approval',()=>{
  const workflow=read('.github/workflows/olympia-release-candidate.yml');
  expect(workflow).toContain('This PR is not approved for LIVE until OLYMPIA final approval is recorded.');
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
