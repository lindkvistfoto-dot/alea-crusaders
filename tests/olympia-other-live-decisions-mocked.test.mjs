import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const start=source.indexOf('const decisionIssue = await gh(');
const end=source.indexOf('  } catch (error) {\n    const message = error instanceof Error',start);
if(start<0||end<0)throw Error('Decision recording branch not found');
const block=source.slice(start,end).replace('let requestBranch: string | null = null;','let requestBranch = null;').replace('let candidateStarted: boolean | null = null;','let candidateStarted = null;');
const run=new Function('deps',`return async function execute(data) {
const {token,OWNER,REPO,item,user,gh,title,issueBody,json,startCandidateRequest}=deps;
${block}
}`);
function setup({reject=false}={}){
 const calls=[];
 const gh=vi.fn(async (_token,path,opts={})=>{
  calls.push({path,method:opts.method||'GET',body:opts.body});
  if(reject)throw Error('mock GitHub unavailable');
  if(path==='/repos/test/alea/issues'&&opts.method==='POST')return {number:901,html_url:'https://example.invalid/issues/901'};
  throw Error('Unexpected request '+path);
 });
 const startCandidateRequest=vi.fn(async()=>{throw Error('must not start candidate')});
 const deps={token:'mock',OWNER:'test',REPO:'alea',item:{id:'PR-524'},user:{email:'zeus@example.invalid'},gh,title:(_item,decision)=>decision,issueBody:(_item,data)=>JSON.stringify(data),json:body=>body,startCandidateRequest};
 return {execute:run(deps),calls,startCandidateRequest};
}
describe('OLYMPIA non-publication decisions with mocked GitHub',()=>{
 for(const decision of ['release_package','needs_fix','karon']){
  it(decision+' writes only one decision issue and never publishes',async()=>{
   const h=setup();
   const result=await h.execute({decision,testedDevSha:'a'.repeat(40)});
   expect(result.ok).toBe(true);
   expect(result.decision).toBe(decision);
   expect(h.calls).toHaveLength(1);
   expect(h.calls[0].path).toBe('/repos/test/alea/issues');
   expect(h.calls[0].method).toBe('POST');
   expect(h.calls.some(c=>c.path.includes('/merge')||c.path.includes('/git/refs'))).toBe(false);
   expect(h.startCandidateRequest).not.toHaveBeenCalled();
   expect(result.candidateStarted).toBeNull();
  });
 }
 it('release package explains no LIVE PR was started',async()=>{
  const h=setup();const result=await h.execute({decision:'release_package',testedDevSha:'a'.repeat(40)});
  expect(result.message).toContain('Ingen LIVE-PR har startats');
 });
 it('GitHub issue creation failure propagates rather than reporting success',async()=>{
  const h=setup({reject:true});
  await expect(h.execute({decision:'needs_fix',testedDevSha:'a'.repeat(40)})).rejects.toThrow('mock GitHub unavailable');
  expect(h.calls).toHaveLength(1);
 });
});
