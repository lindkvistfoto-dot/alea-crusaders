import {readFileSync} from 'node:fs';
import {test,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
test('preserves in-flight candidate status node across PR refresh',()=>{
 expect(html).toContain('previousCandidates=new Map');
 expect(html).toContain('if(old)node.replaceWith(old)');
 expect(html).toContain("node.dataset.candidateStatus+'|'+node.dataset.mergeSha");
});
test('candidate diagnostics have a bounded longer timeout and visible error',()=>{
 expect(js).toContain("action.action==='auto_candidate_diagnostics'?60000:20000");
 expect(js).toContain('LIVE-status kunde inte verifieras');
});
