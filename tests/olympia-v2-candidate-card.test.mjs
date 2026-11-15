import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const html=readFileSync(new URL('../olympia-v2/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../olympia-v2/dev-approval.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/olympia-control/index.ts',import.meta.url),'utf8');
describe('OLYMPIA candidate attached to original PR',()=>{
 it('uses each PR merge SHA rather than the latest development SHA',()=>{
  expect(html).toContain('data-merge-sha=');
  expect(html).toContain('p.liveCandidateActive');
  expect(js).toContain('sha=node.dataset.mergeSha');
  expect(js).not.toContain('const sha=await currentDevSha();');
 });
 it('verifies release readiness on server before presenting candidate',()=>{
  expect(edge).toContain('candidate = await inspectCandidate(token, item, issue.number, testedDevSha)');
  expect(js).toContain('candidate?.ready===true');
  expect(js).toContain('candidate.releasePr');
  expect(js).toContain('candidate.releaseUrl');
 });
 it('revalidates the mutable release PR HEAD and binds approval to the exact SHA',()=>{
  expect(edge).toContain('const reportTreeMatch = body.match(/- Candidate tree SHA: ([0-9a-f]{40})/i)');
  expect(edge).toContain('currentTreeSha !== data.candidateTreeSha');
  expect(edge).toContain('pr.head.sha !== data.releasePrSha');
  expect(edge).toContain('verifiedCandidatePreview(token, verified.pr.head.sha)');
  expect(edge).toContain('const requiredChecks = [/^check$/i, /^guard$/i, /^preview$/i]');
  expect(edge).toContain('releaseBeforeMerge.head?.sha !== data.releasePrSha');
  expect(edge).toContain('body: JSON.stringify({ sha: data.releasePrSha, merge_method: "squash" })');
  expect(js).toContain('releasePrSha:candidate.releasePrSha');
  expect(js).toContain('setInterval(()=>{if(!document.hidden&&verified)window.olympiaV2CheckCandidateStatuses?.()},180000)');
  expect(js).toContain('candidateCacheUntil.get(requestKey)');
  expect(js).toContain('Math.min(2,targets.length)');
 });
 it('exposes approval only for verified candidates',()=>{
  expect(js).toContain('LIVE-beslut är låsta.');
  expect(js).toContain('Number.isInteger(number)&&number>0&&Number.isInteger(candidate.releasePr)&&candidate.releasePr>0');
  expect(js).toContain('approve.disabled=!candidateReady');
  expect(js).toContain("decision:'final_approval',itemId:'PR-'+number");
  expect(html).not.toContain('data-live-accept');
 });

 it('keeps the #867 LIVE-parent lifecycle independent of candidate latency and hidden history',()=>{
  const start=html.indexOf('const prCacheKey=');
  const end=html.indexOf('function showCachedPrList()',start);
  const cacheSource=html.slice(start,end);
  const storage=new Map();
  const sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const filter={value:'all',innerHTML:''};
  const state=new Function('sessionStorage','filter','safe',cacheSource+';return {cachedActiveCandidateParents,writeCachedPrList,activePrRows,activePrFilterState,activePrCountLabel,syncPrFilter};')(sessionStorage,filter,value=>String(value));
  const parent={number:867,title:'Troférum',base:{ref:'development'},head:{sha:'a'.repeat(40)},state:'closed',merged_at:'2026-11-15T13:57:21Z',merge_commit_sha:'b'.repeat(40),liveCandidateActive:true};
  const openPr={number:900,title:'Open DEV PR',base:{ref:'development'},head:{sha:'c'.repeat(40)},state:'open'};
  const devOnly={number:866,title:'DEV-only',base:{ref:'development'},head:{sha:'d'.repeat(40)},state:'closed',merged_at:'2026-11-15T13:00:00Z',liveCandidateActive:false};
  state.writeCachedPrList([openPr],[parent]);

  // 1. Active PANDORAS ASK parent shows despite the UPPSLAG hidden-number list.
  let rows=state.activePrRows([openPr,devOnly],state.cachedActiveCandidateParents(),[867]);
  expect(rows.map(pr=>pr.number)).toContain(867);
  expect(state.activePrRows([parent],[],[867]).map(pr=>pr.number)).toContain(867);

  // 2–3. The fast refresh can render immediately; a pending or failed
  // candidate-parent request leaves the last verified parent in session cache.
  state.writeCachedPrList([openPr]);
  rows=state.activePrRows([openPr],state.cachedActiveCandidateParents(),[867]);
  expect(rows.map(pr=>pr.number)).toContain(867);

  // 4. A successful journal response keeps the parent in both the full
  // active count and the filter choices while the user views another PR.
  state.writeCachedPrList([openPr],[parent]);
  rows=state.activePrRows([openPr,devOnly],state.cachedActiveCandidateParents(),[867]);
  expect(rows.map(pr=>pr.number)).toContain(867);
  const filtered=state.activePrFilterState(rows,'900');
  expect(filtered.selected).toBe('900');
  expect(filtered.visibleRows.map(pr=>pr.number)).toEqual([900]);
  const renderedFilter=state.syncPrFilter(rows,'900');
  expect(filter.innerHTML).toContain('#867');
  expect(renderedFilter.selected).toBe('900');
  expect(renderedFilter.visibleRows.map(pr=>pr.number)).toEqual([900]);
  expect(state.activePrCountLabel(rows.length,renderedFilter.visibleRows.length)).toBe('1 av 2 aktiva DEV/LIVE-ärenden');

  // 5. A confirmed closed LIVE process is removed; 6. a DEV-only merge
  // has no active journal and stays out of the list.
  state.writeCachedPrList([openPr],[]);
  rows=state.activePrRows([openPr,devOnly],state.cachedActiveCandidateParents(),[867]);
  expect(rows.map(pr=>pr.number)).not.toContain(867);
  expect(rows.map(pr=>pr.number)).not.toContain(866);
  expect(state.syncPrFilter(rows,'867').selected).toBe('all');
  expect(html).toContain('activePrRows(cached.pullRequests,[],window.olympiaV2HiddenPrNumbers||[])');
  expect(html).toContain('writeCachedPrList(data.pullRequests||[],freshCandidateParents)');
  expect(html).toContain('activePrCountLabel(updatedPrs.length,updatedFilter.visibleRows.length)');
 });
 it('keeps candidate lookup separate from PR-list rendering and replaces cached parents only on a successful response',()=>{
  expect(html).toContain("action:'pull_request_list',includeCandidateParents:false");
  expect(html).toContain("candidateData?.ok!==true||!Array.isArray(candidateData.pullRequests)");
  expect(html).toContain('writeCachedPrList(data.pullRequests||[],freshCandidateParents)');
  expect(html).toContain('data-live-parent="true"');
 });
});
