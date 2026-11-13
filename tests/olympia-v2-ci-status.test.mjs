import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const ui=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA V2 real CI status',()=>{
 it('does not fabricate pending for any nonempty status list',()=>{expect(ui).not.toContain("state:details.statuses?.length?'pending':'success'");expect(ui).toContain('details.combinedStatusState');});
 it('returns GitHub combined status from server',()=>{expect(edge).toContain("combinedStatusState: String(status.state || 'unknown')");});
 it('uses the shared mandatory check names and success conclusions',()=>{const helper=readFileSync(new URL('../supabase/functions/_shared/olympia-ci.js',import.meta.url),'utf8');for(const name of ['^check
});
,'^guard
});
,'^preview
});
,'^Cloudflare Pages
});
])expect(helper).toContain(name);expect(helper).toContain('new Set(["success", "neutral", "skipped"])');expect(ui).toContain('window.olympiaCiValidation.assess(checks,status,sha)');expect(edge).toContain('assessCi(checks, status, data.pullRequestHeadSha)');});
});
