import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
const fnStart = edge.indexOf('async function registerExternalCandidate(');
const fnEnd = edge.indexOf('\nasync function verifiedCandidatePreview', fnStart);
const fn = edge.slice(fnStart, fnEnd)
  .replaceAll('token: string', 'token').replaceAll('item: any', 'item')
  .replaceAll('issueNumber: number', 'issueNumber').replaceAll('testedDevSha: string', 'testedDevSha')
  .replaceAll('prNumber: number', 'prNumber').replaceAll('(comments as any[])', 'comments')
  .replaceAll('(number: number)', '(number)').replaceAll('(file: any)', '(file)')
  .replaceAll('(filename: string)', '(filename)').replaceAll('(comment: any)', '(comment)');
if (fnStart < 0 || fnEnd < 0) throw new Error('External candidate registration helper not found');
const verifyStart = edge.indexOf('async function verifyCandidate(');
const verifyEnd = edge.indexOf('\nasync function registerExternalCandidate', verifyStart);
const verifySource = edge.slice(verifyStart, verifyEnd)
  .replaceAll('token: string', 'token').replaceAll('item: any', 'item').replaceAll('data: any', 'data')
  .replaceAll('(comments as any[])', 'comments').replaceAll('(check: any)', '(check)')
  .replaceAll('(a: any, b: any)', '(a, b)').replaceAll('(number: number)', '(number)')
  .replaceAll('(file: any)', '(file)').replaceAll('(filename: string)', '(filename)');
if (verifyStart < 0 || verifyEnd < 0) throw new Error('Candidate verifier not found');

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const LIVE = 'c'.repeat(40);
const DEV = 'd'.repeat(40);
const PR = 900;
const ISSUE = 901;
const BODY = [
  '- Prepared from LIVE baseline: ' + LIVE,
  '- Source DEV PRs: #867',
  '- Approved DEV test version: ' + DEV,
  '- Exact candidate tree: ' + TREE,
  '- Zeus decision journal: #' + ISSUE,
].join('\n');

function harness({prBase=LIVE, checks='success', preview='https://candidate.alea-crusaders.pages.dev/', issueOwner='olympia-dev-decision-bridge[bot]'}={}) {
  const writes = [];
  const gh = vi.fn(async (_token, path, init={}) => {
    if (init.method) writes.push({ path, init });
    if (path.endsWith('/issues/' + ISSUE) && !path.endsWith('/comments')) return {
      user:{login:issueOwner}, state:'open', body:`- Beslut: PANDORAS ASK\n- Ärende-ID: PR-867\n- Testad DEV-commit (full SHA): ${DEV}`,
      html_url:`https://github.com/o/r/issues/${ISSUE}`,
    };
    if (path.endsWith('/commits/main')) return {sha:LIVE};
    if (path.endsWith('/git/ref/heads/development')) return {object:{sha:DEV}};
    if (path.endsWith('/pulls/' + PR)) return {
      state:'open', draft:false, base:{ref:'main',sha:prBase}, head:{sha:SHA},
      mergeable:true, mergeable_state:'clean', body:BODY, html_url:`https://github.com/o/r/pull/${PR}`,
    };
    if (path.endsWith('/commits/' + SHA)) return {commit:{tree:{sha:TREE}}};
    if (path.endsWith('/pulls/' + PR + '/files?per_page=100')) return [{filename:'features/trophy-room/room.js'}];
    if (path.endsWith('/issues/' + ISSUE + '/comments?per_page=100')) return [];
    if (path.endsWith('/issues/' + ISSUE + '/comments') && init.method==='POST') return {id:99};
    throw Error('Unexpected GitHub call: ' + path);
  });
  const register = new Function('appBotLogin','gh','verifyPublishedManifest','ghReadWithRetry','assessCi','verifiedCandidatePreview','console','OWNER','REPO',
    fn + '; return registerExternalCandidate;')(
    async()=> 'olympia-dev-decision-bridge[bot]', gh, vi.fn(async()=>{}),
    async(_token,path)=>path.endsWith('/check-runs?per_page=100')?{check_runs:[{}],total_count:1}:{statuses:[],state:'success'},
    ()=>({state:checks}), async()=>preview, {warn:vi.fn()}, 'o','r');
  return {register:()=>register('token',{id:'PR-867',release_source_prs:[867],features:['features/trophy-room/room.js']},ISSUE,DEV,PR), gh, writes};
}

function verifierHarness({registered=true,reportOwner='olympia-dev-decision-bridge[bot]'}={}) {
  const appLogin='olympia-dev-decision-bridge[bot]';
  const reportBody=[
    '## OLYMPIA release candidate',
    '- Status: READY_FOR_ZEUS_FINAL_APPROVAL',
    ...(registered?['- Candidate source: OLYMPIA-registered external PR #'+PR]:[]),
    '- Verified DEV SHA: '+DEV,
    '- LIVE rollback baseline: '+LIVE,
    '- Candidate tree SHA: '+TREE,
    '- Release PR: #'+PR+' · https://github.com/o/r/pull/'+PR,
  ].join('\n');
  const candidateBody=BODY;
  const gh=vi.fn(async(_token,path)=>{
    if(path.endsWith('/issues/'+ISSUE))return {user:{login:appLogin},body:`- Ärende-ID: PR-867\n- Testad DEV-commit (full SHA): ${DEV}\n- Beslut: PANDORAS ASK`};
    if(path.endsWith('/issues/'+ISSUE+'/comments?per_page=100'))return [{user:{login:reportOwner},body:reportBody,created_at:'2026-11-15T06:00:00Z'}];
    if(path.endsWith('/commits/main'))return {sha:LIVE};
    if(path.endsWith('/git/ref/heads/development'))return {object:{sha:DEV}};
    if(path.endsWith('/pulls/'+PR))return {number:PR,state:'open',draft:false,base:{ref:'main',sha:LIVE},head:{sha:SHA},user:{login:'manual-builder'},mergeable:true,mergeable_state:'clean',body:candidateBody};
    if(path.endsWith('/commits/'+SHA))return {commit:{tree:{sha:TREE}}};
    if(path.endsWith('/pulls/'+PR+'/files?per_page=100'))return [{filename:'features/trophy-room/room.js'}];
    if(path.endsWith('/commits/'+SHA+'/check-runs?per_page=100'))return {total_count:3,check_runs:[
      {name:'Check',status:'completed',conclusion:'success',head_sha:SHA},
      {name:'Guard',status:'completed',conclusion:'success',head_sha:SHA},
      {name:'Preview',status:'completed',conclusion:'success',head_sha:SHA},
    ]};
    if(path.endsWith('/commits/'+SHA+'/status'))return {state:'success',statuses:[],sha:SHA};
    throw Error('Unexpected GitHub call: '+path);
  });
  const verify=new Function('appBotLogin','gh','verifyPublishedManifest','ghReadWithRetry','OWNER','REPO',
    verifySource+'; return verifyCandidate;')(
      async()=>appLogin,gh,vi.fn(async()=>{}),async(_token,path)=>gh('token',path),'o','r');
  return {verify:()=>verify('token',{id:'PR-867',release_source_prs:[867],features:['features/trophy-room/room.js']},{candidateIssue:ISSUE,candidateTreeSha:TREE,releasePrSha:SHA,testedDevSha:DEV}),gh};
}

describe('OLYMPIA separately built LIVE candidates',()=>{
  it('registers a manually built candidate against the existing Zeus decision only after exact baseline, scope, CI, and preview checks',async()=>{
    const h=harness();
    const result=await h.register();
    expect(result).toMatchObject({candidateTreeSha:TREE,releasePr:{number:PR}});
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].path).toContain('/issues/' + ISSUE + '/comments');
    expect(JSON.parse(h.writes[0].init.body).body).toContain('- Candidate source: OLYMPIA-registered external PR #' + PR);
    expect(JSON.parse(h.writes[0].init.body).body).toContain('LIVE publication: NOT PERFORMED.');
  });
  it('refuses an out-of-date LIVE baseline without creating a registration report',async()=>{
    const h=harness({prBase:'e'.repeat(40)});
    await expect(h.register()).rejects.toThrow('RELEASE_PR_NOT_VALID');
    expect(h.writes).toEqual([]);
  });
  it('refuses red CI and missing preview without creating a registration report',async()=>{
    const red=harness({checks:'failed'});
    await expect(red.register()).rejects.toThrow('CANDIDATE_CHECKS_NOT_GREEN');
    expect(red.writes).toEqual([]);
    const noPreview=harness({preview:null});
    await expect(noPreview.register()).rejects.toThrow('CANDIDATE_PREVIEW_UNVERIFIED');
    expect(noPreview.writes).toEqual([]);
  });
  it('lets final approval re-verify an OLYMPIA-registered external PR against its exact SHA and report',async()=>{
    const h=verifierHarness();
    await expect(h.verify()).resolves.toMatchObject({pr:{number:PR},candidateTreeSha:TREE,liveSha:LIVE});
  });
  it('does not adopt a separately authored PR without an OLYMPIA registration report',async()=>{
    const h=verifierHarness({registered:false});
    await expect(h.verify()).rejects.toThrow('RELEASE_PR_NOT_VALID');
  });
  it('keeps external registration behind Zeus auth and final approval re-verifies it',()=>{
    expect(edge.indexOf('if (data.action === "register_external_candidate")')).toBeGreaterThan(edge.indexOf('user.email_confirmed_at'));
    expect(edge).toContain('githubToken("register_external_candidate")');
    expect(edge).toContain('decision === "register_external_candidate"\n    ? { contents: "read", issues: "write", pull_requests: "read" }');
    expect(edge).toContain('reportBody.includes("- Candidate source: OLYMPIA-registered external PR #" + prMatch[1])');
    expect(edge).toContain('candidateBody.includes("- Exact candidate tree: " + currentTreeSha)');
    expect(edge).toContain('candidate = await verifyCandidate(token, item, data)');
    expect(ui).toContain('action:\'register_external_candidate\'');
    expect(html).toContain('<script src="./dev-approval.js?v=20261115-external-candidate-registration-v1">');
  });
});
