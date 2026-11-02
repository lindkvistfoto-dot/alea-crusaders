import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {transformSync} from 'esbuild';

const source=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function autoPrepareLiveCandidate(');
const end=source.indexOf('async function appBotLogin()',start);
if(start<0||end<0)throw Error('Candidate function not found');
const compiled=transformSync(source.slice(start,end)+'\nreturn autoPrepareLiveCandidate;', {loader:'ts',format:'cjs'}).code;

function harness({failAfterLock=false}={}){
 const locks=new Set(),issues=[],calls={createRef:0,createIssue:0,startCandidate:0};
 const gh=async (_token,path,opts)=>{
  if(path.includes('/git/ref/heads/olympia/auto-candidates/')){
   if(locks.has(path.split('/git/ref/heads/')[1]))return {object:{sha:'a'.repeat(40)}};
   throw Error('GITHUB_REQUEST_FAILED_404');
  }
  if(path.endsWith('/git/refs')&&opts?.method==='POST'){
   calls.createRef++;
   const key=JSON.parse(opts.body).ref.replace('refs/heads/','');
   if(locks.has(key))throw Error('GITHUB_REQUEST_FAILED_422');
   locks.add(key);return {};
  }
  if(path.includes('/issues?')){if(failAfterLock)throw Error('SIMULATED_GITHUB_FAILURE');return issues;}
  if(path.endsWith('/issues')&&opts?.method==='POST'){
   calls.createIssue++;
   const issue={number:42,html_url:'https://github.com/example/issues/42',body:JSON.parse(opts.body).body};
   issues.push(issue);return issue;
  }
  throw Error('Unexpected GitHub call '+path);
 };
 const deps={
  Deno:{env:{get:()=> 'enabled'}},OWNER:'example',REPO:'repo',
  workItem:async()=>({id:'PR-502',pr_number:502}),
  verifyReleaseSources:async()=>true,appBotLogin:async()=> 'test[bot]',
  gh,title:()=> 'candidate',issueBody:()=>'- Beslut: PANDORAS ASK\n- Ärende-ID: PR-502\n- Testad DEV-commit (full SHA): '+'a'.repeat(40),
  startCandidateRequest:async()=>{calls.startCandidate++;return 'candidate-branch';},
 };
 const fn=new Function(...Object.keys(deps),compiled)(...Object.values(deps));
 const run=()=>fn('token',502,'Zeus',{testedDevSha:'a'.repeat(40)});
 return {run,calls,locks};
}
describe('OLYMPIA automatic LIVE candidate integration (mock GitHub)',()=>{
 it('only one of two simultaneous calls creates a release issue',async()=>{
  const h=harness();const results=await Promise.all([h.run(),h.run()]);
  expect(results.map(r=>r.state).sort()).toEqual(['already_requested','requested']);
  expect(h.calls.createIssue).toBe(1);
  expect(h.calls.startCandidate).toBe(1);
 });
 it('repeated call is a no-op after a successful request',async()=>{
  const h=harness();await h.run();expect((await h.run()).state).toBe('already_requested');
  expect(h.calls.createIssue).toBe(1);expect(h.calls.startCandidate).toBe(1);
 });
 it('retains the lock and fails closed after partial failure',async()=>{
  const h=harness({failAfterLock:true});await expect(h.run()).rejects.toThrow('SIMULATED_GITHUB_FAILURE');
  expect((await h.run()).state).toBe('already_requested');
  expect(h.calls.createIssue).toBe(0);expect(h.locks.size).toBe(1);
 });
});
