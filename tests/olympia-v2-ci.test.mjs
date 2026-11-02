import {describe,expect,it} from 'vitest';
import {classifyCi,REQUIRED_CI_CHECKS} from '../supabase/functions/_shared/olympia-ci.ts';

const sha='a'.repeat(40);
function completed(name,conclusion='success',headSha=sha,extra={}) {
 return {name,status:'completed',conclusion,head_sha:headSha,...extra};
}
function passingChecks() {
 const runs=REQUIRED_CI_CHECKS.map(name=>completed(name));
 runs.find(x=>x.name==='Cloudflare Pages').output={summary:
  '<table><tr><td><strong>Latest commit:</strong></td><td><code>'+sha.slice(0,7)+'</code></td></tr>'+
  '<tr><td><strong>Preview URL:</strong></td><td><a href=\'https://66cbbba7.alea-crusaders.pages.dev\'>preview</a></td></tr></table>'};
 return runs;
}

describe('OLYMPIA CI for the exact PR commit',()=>{
 it('requires the repository CI, MINOTAURUS, ARCANE Preview and Cloudflare Pages checks',()=>{
  expect(REQUIRED_CI_CHECKS).toEqual(['check','guard','preview','Cloudflare Pages']);
  expect(classifyCi(passingChecks(),[],sha).state).toBe('success');
 });
 it('reports missing mandatory tests as unknown, never green',()=>{
  const runs=passingChecks().filter(x=>x.name!=='guard');
  expect(classifyCi(runs,[],sha)).toMatchObject({state:'unknown',label:'Obligatorisk check saknas: guard'});
 });
 it('fails closed when GitHub paginates away checks or commit statuses',()=>{
  expect(classifyCi(passingChecks(),[],sha,100,0,'success').state).toBe('unknown');
  expect(classifyCi(passingChecks(),[],sha,4,100,'success').state).toBe('unknown');
 });
 it('reports running checks as pending',()=>{
  const runs=passingChecks();runs[0].status='in_progress';
  expect(classifyCi(runs,[],sha).state).toBe('pending');
 });
 it('reports skipped mandatory checks as failed',()=>{
  const runs=passingChecks();runs[0].conclusion='skipped';
  expect(classifyCi(runs,[],sha).state).toBe('failed');
 });
 it('keeps a known failure visible while other checks are still running',()=>{
  const runs=passingChecks();runs[0].status='in_progress';runs[1].conclusion='failure';
  expect(classifyCi(runs,[],sha).state).toBe('failed');
 });
 it('reports failing GitHub checks and legacy commit statuses as failed',()=>{
  const runs=passingChecks();runs[1].conclusion='failure';
  expect(classifyCi(runs,[],sha).state).toBe('failed');
  expect(classifyCi(passingChecks(),[{state:'failure'}],sha).state).toBe('failed');
 });
 it('does not combine status from a different commit',()=>{
  expect(classifyCi(passingChecks(),[],'b'.repeat(40)).state).toBe('unknown');
 });
 it('requires a Cloudflare preview deployed from the same commit',()=>{
  const runs=passingChecks();
  runs.find(x=>x.name==='Cloudflare Pages').output.summary=
   '<strong>Latest commit:</strong> <code>bbbbbbb</code><strong>Preview URL:</strong> <a href=\'https://66cbbba7.alea-crusaders.pages.dev\'>preview</a>';
  expect(classifyCi(runs,[],sha)).toMatchObject({state:'unknown',previewUrl:null});
  const noUrl=passingChecks();noUrl.find(x=>x.name==='Cloudflare Pages').output.summary='';
  expect(classifyCi(noUrl,[],sha).state).toBe('unknown');
 });
 it('returns the immutable Cloudflare deployment preview only for the matching SHA',()=>{
  expect(classifyCi(passingChecks(),[],sha).previewUrl)
   .toBe('https://66cbbba7.alea-crusaders.pages.dev/olympia-v2/');
 });
});
