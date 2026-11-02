import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const page=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
test('V2 is separate and read-only',()=>{assert.match(page,/PILOT \/ ENDAST LÄSNING/);assert.match(page,/button disabled>Godkänn DEV/);assert.doesNotMatch(page,/approve_and_merge_dev|pandoras_ask|final_approval/);});
test('V2 reads GitHub PR, CI and preview without a duplicate status store',()=>{assert.match(page,/\/pulls\?state=open&base=development/);assert.match(page,/\/check-runs\?per_page=100/);assert.match(page,/cloudflare pages/i);assert.match(page,/Promise\.allSettled/);});
test('V2 escapes untrusted GitHub content',()=>{assert.match(page,/const safe=/);assert.match(page,/safe\(pr\.title\)/);assert.match(page,/safe\(pr\.html_url\)/);});
