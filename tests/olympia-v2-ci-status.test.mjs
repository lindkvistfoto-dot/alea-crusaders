import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const ui=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const helper=readFileSync(new URL('../supabase/functions/_shared/olympia-ci.js',import.meta.url),'utf8');
const browserHelper=readFileSync(new URL('../olympia-v2/ci-validation.js',import.meta.url),'utf8');
describe('OLYMPIA V2 real CI status',()=>{
 it('ships the browser CI evaluator loaded by OLYMPIA',()=>{expect(ui).toContain('<script src="./ci-validation.js"></script>');expect(browserHelper).toContain('root.olympiaCiValidation = Object.freeze({ assess });');expect(browserHelper).toContain('REQUIRED_CHECKS = [/^check$/i, /^guard$/i, /^preview$/i, /^Cloudflare Pages$/i]');});\nit('uses the same combined status returned by GitHub',()=>{expect(ui).toContain('details.combinedStatusState');expect(edge).toContain("combinedStatusState: String(status.state || 'unknown')");});
 it('uses the common evaluator in both listing and approval',()=>{expect(ui).toContain('window.olympiaCiValidation.assess(checks,status,sha)');expect(edge).toContain('assessCi(checks, status, data.pullRequestHeadSha)');});
 it('defines the four required check names and accepted conclusions once',()=>{expect(helper).toContain('REQUIRED_CHECKS = [/^check$/i, /^guard$/i, /^preview$/i, /^Cloudflare Pages$/i]');expect(helper).toContain('new Set(["success", "neutral", "skipped"])');});
});
