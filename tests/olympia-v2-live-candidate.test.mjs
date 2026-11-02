import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
describe('OLYMPIA 2.0 LIVE candidate safety',()=>{
 it('shows staged controls only for merged DEV PR',()=>{expect(html).toContain('if(pr.merged_at)');expect(html).toContain('data-live-prepare');expect(html).not.toContain('data-live-pandora');expect(html).toContain('LIVE-publicering kräver separat verifiering');});
 it('uses server-side Zeus decision bridge and current DEV SHA',()=>{expect(js).toContain("action:'current_refs'");expect(js).toContain('result.environments?.development?.sha');expect(js).toContain("decision,itemId,testedDevSha:sha");});
 it('never directly merges or publishes LIVE',()=>{expect(js).not.toContain("action:'final_approval'");expect(js).not.toContain("'/pulls/'");expect(js).toContain("'pandoras_ask'");});
 it('keeps SHA compact on mobile',()=>{expect(html).toContain("slice(0,12)");expect(html).toContain('overflow-wrap:anywhere');});
});
