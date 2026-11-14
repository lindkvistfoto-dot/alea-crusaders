import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

const source = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('if (data.decision === "final_approval") {');
const end = source.indexOf('if (data.decision === "pandoras_ask" || data.decision === "release_package")', start);
if (start < 0 || end < 0) throw new Error('LIVE decision branch not found');
// Execute the actual production decision branch, replacing only a TS-only type annotation.
const branch = source.slice(start, end).replace('const messages: Record<string, string> =', 'const messages =');
const makeRunner = new Function('deps', `return async function run(data) {
 const {token,item,user,verifyCandidate,verifiedCandidatePreview,isTransientCandidateReadError,gh,title,issueBody,json,fail,OWNER,REPO} = deps;
 ${branch}
}`);
const classifierStart = source.indexOf('function isTransientCandidateReadError(');
const classifierEnd = source.indexOf('\n}', classifierStart) + 2;
const classifierSource = source.slice(classifierStart, classifierEnd).replace('(code: string)', '(code)');
if (classifierStart < 0 || classifierEnd < 2) throw new Error('Transient candidate error classifier not found');
const isTransientCandidateReadError = new Function(classifierSource + '; return isTransientCandidateReadError')();
const SHA = 'a'.repeat(40);
const LIVE = 'b'.repeat(40);
function harness({preview='https://candidate.alea-crusaders.pages.dev/', baseline=LIVE, releaseHead=SHA, rejectCandidate=false, mergeResult=true, journalFailure=false}={}) {
 const writes=[];
 const candidate={pr:{number:572,head:{sha:SHA},html_url:'https://github.com/example/pull/572'},liveSha:LIVE};
 const gh=vi.fn(async (_token,path,init={})=>{
  if(init.method) writes.push({path,method:init.method,body:init.body});
  if(path.endsWith('/commits/main')) return {sha:baseline};
  if(path.endsWith('/pulls/572') && !path.endsWith('/merge')) return {head:{sha:releaseHead}};
  if(path.endsWith('/issues') && init.method==='POST') return {number:900,html_url:'https://github.com/example/issues/900'};
  if(path.endsWith('/pulls/572/merge')) return {merged:mergeResult,sha:'c'.repeat(40)};
  if(path.endsWith('/issues/900') && init.method==='PATCH') {
   if(journalFailure) throw Error('journal unavailable');
   return {};
  }
  throw Error('Unexpected GitHub call: '+path);
 });
 const deps={
  token:'mock-only',item:{id:'PR-567'},user:{email:'zeus@example.invalid'},
  verifyCandidate:vi.fn(async()=>{if(rejectCandidate)throw Error(typeof rejectCandidate==='string'?rejectCandidate:'CANDIDATE_NOT_READY');return candidate}),
  isTransientCandidateReadError,
  verifiedCandidatePreview:vi.fn(async()=>preview),
  gh,title:()=> 'Approval',issueBody:()=> 'Mock journal',
  json:(value)=>({status:200,...value}),
  fail:(message,status)=>({status,ok:false,message}),
  OWNER:'test',REPO:'alea'
 };
 return {run:makeRunner(deps),writes,deps};
}
const data={decision:'final_approval',candidateIssue:569,testedDevSha:SHA,candidateTreeSha:SHA,releasePrSha:SHA};
describe('OLYMPIA LIVE decisions: executable mocked server branch',()=>{
 it('merges exact candidate only after verified preview and unchanged LIVE baseline',async()=>{
  const h=harness();const result=await h.run(data);
  expect(result.ok).toBe(true);
  expect(h.deps.verifiedCandidatePreview).toHaveBeenCalledWith('mock-only',SHA);
  expect(h.writes.map(x=>x.path)).toEqual([
   '/repos/test/alea/issues','/repos/test/alea/pulls/572/merge','/repos/test/alea/issues/900'
  ]);
  expect(JSON.parse(h.writes[1].body)).toEqual({sha:SHA,merge_method:'squash'});
 });
 it('rejects missing verified preview without any writes',async()=>{
  const h=harness({preview:null});expect((await h.run(data)).status).toBe(409);expect(h.writes).toEqual([]);
 });
 it('rejects failed candidate verification without any writes',async()=>{
  const h=harness({rejectCandidate:true});expect((await h.run(data)).status).toBe(409);expect(h.writes).toEqual([]);
 });
 it('rejects changed LIVE baseline before merge',async()=>{
  const h=harness({baseline:'d'.repeat(40)});expect((await h.run(data)).status).toBe(409);
  expect(h.writes.some(x=>x.path.endsWith('/merge'))).toBe(false);
 });
 it('rejects a release HEAD change after Zeus approved the displayed SHA',async()=>{
  const h=harness({releaseHead:'d'.repeat(40)});
  expect((await h.run(data)).status).toBe(409);
  expect(h.writes.some(x=>x.path.endsWith('/merge'))).toBe(false);
 });
 it('keeps a GitHub rate limit fail-closed but reports it as retryable service unavailability',async()=>{
  const h=harness({rejectCandidate:'GITHUB_PUBLIC_RATE_LIMITED'});
  const result=await h.run(data);
  expect(result.status).toBe(503);
  expect(result.message).toContain('GitHub');
  expect(h.writes).toEqual([]);
 });
 it('classifies GitHub API outages separately from actual CI failures',()=>{
  expect(isTransientCandidateReadError('GITHUB_PUBLIC_RATE_LIMITED')).toBe(true);
  expect(isTransientCandidateReadError('GITHUB_PUBLIC_REQUEST_FAILED_502')).toBe(true);
  expect(isTransientCandidateReadError('CANDIDATE_CHECKS_NOT_GREEN')).toBe(false);
 });
 it('does not claim success if GitHub refuses merge',async()=>{
  const h=harness({mergeResult:false});expect((await h.run(data)).status).toBe(502);
 });
 it('reports merge success even if post-merge journal update fails',async()=>{
  const h=harness({journalFailure:true});expect((await h.run(data)).ok).toBe(true);
 });
});
