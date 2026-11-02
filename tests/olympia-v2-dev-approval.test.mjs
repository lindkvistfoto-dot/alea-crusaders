import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const approval=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
it('verifies Zeus session before DEV approval',()=>{
 expect(approval).toContain("action:'session_check'");
 expect(approval).toContain("action:'approve_and_merge_dev'");
 expect(approval).toContain('pullRequestHeadSha:sha');
 expect(approval).toContain('result.merged!==true');
});
it('keeps merged PR visible in the same card',()=>{
 expect(page).toContain('if(pr.merged_at)');
 expect(page).toContain("action:'pull_request_list'");
 expect(page).toContain('För publicering');
 expect(page).toContain('data-dev-approve');
});

it('does not treat an empty legacy commit status as pending CI',()=>{
 expect(page).toContain("(statuses.length>0&&status.state==='pending')");
 expect(page).toContain('DEV-beslut kräver verifierad Zeus-session och godkänd CI');
});

it('reads PR and CI through the authenticated ALEA backend',()=>{
 expect(page).toContain("action:'pull_request_list'");
 expect(page).toContain("action:'pull_request_status'");
 expect(approval).toContain('function belongsToDev');
 expect(approval).toContain('window.olympiaV2Request');
});
