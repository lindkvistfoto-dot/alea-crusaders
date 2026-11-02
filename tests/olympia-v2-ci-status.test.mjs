import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const ui=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA V2 real CI status',()=>{
 it('does not fabricate pending for any nonempty status list',()=>{expect(ui).not.toContain("state:details.statuses?.length?'pending':'success'");expect(ui).toContain('details.combinedStatusState');});
 it('returns GitHub combined status from server',()=>{expect(edge).toContain("combinedStatusState: String(status.state || 'unknown')");});
 it('requires the actual four mandatory check-run names',()=>{for(const name of ['^check$','^guard$','^preview$','^Cloudflare Pages$'])expect(ui).toContain(name);expect(ui).toContain("x.conclusion!=='success'");});
});
