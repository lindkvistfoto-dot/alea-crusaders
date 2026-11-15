import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const frontend = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const refresh = page.slice(page.indexOf('async function refresh('), page.indexOf('let refreshing=false'));
const list = edge.slice(edge.indexOf('if (data.action === "pull_request_list")'), edge.indexOf('if (data.action === "pull_request_candidate_parents")'));
const candidateHelper = edge.slice(edge.indexOf('async function fetchActiveCandidateParents'), edge.indexOf('Deno.serve'));

describe('OLYMPIA instant PR-list recovery', () => {
  it('uses the authenticated PR-list response as the normal Zeus verification and checks session separately only after list failure', () => {
    const verify = frontend.slice(frontend.indexOf('async function verify()'), frontend.indexOf('function feedback'));
    expect(verify.indexOf("window.olympiaV2Request({action:'pull_request_list'})")).toBeLessThan(verify.indexOf('await prListPromise'));
    expect(verify.indexOf("call({action:'session_check'}")).toBeGreaterThan(verify.indexOf('catch(listError)'));
    expect(verify).toContain('Zeus verifierades av servern vid den skyddade PR-listan.');
    expect(verify).toContain('window.olympiaV2Refresh?.(prListPromise)');
    expect(frontend).toContain('new AbortController()');
  });

  it('does not wait for idea_list before drawing the PR list', () => {
    expect(refresh.indexOf("const registryPromise=window.olympiaV2Request({action:'idea_list'})")).toBeLessThan(refresh.indexOf('const data=await'));
    expect(refresh.indexOf('const data=await')).toBeLessThan(refresh.indexOf("cards.innerHTML=shown.map"));
    expect(refresh).toContain('const statusRefresh=mapLimit(shown,5,async(pr,index)=>');
    expect(refresh).not.toContain('Promise.all([window.olympiaV2Request({action:\'pull_request_list\'}),window.olympiaV2Request({action:\'idea_list\'})])');
    expect(refresh).toContain("registryPromise.then(registryResult=>");
  });

  it('renders only a clearly stale, decision-disabled metadata snapshot from session cache', () => {
    expect(page).toContain("const prCacheKey='olympia-v2-pr-list-v1'");
    expect(page).toContain('function readCachedPrList()');
    expect(page).toContain('function writeCachedPrList(pullRequests,activeCandidateParents)');
    expect(page).toContain('CI och mergebarhet kontrolleras på nytt');
    expect(page).toContain('showCachedPrList();');
    expect(page).toContain("sessionStorage.setItem(prCacheKey,JSON.stringify({pullRequests:projected,verifiedAt:Date.now()}))");
    expect(page).toContain('const ready=state===\'success\'&&mergeable&&eligible&&fresh');
  });

  it('returns the PR list without waiting for candidate or LIVE publication diagnostics', () => {
    expect(list).toContain('/pulls?state=open&per_page=100&page=');
    expect(list).not.toContain('/issues?');
    expect(list).not.toContain('/search/issues');
    expect(list).not.toContain('liveMergePublicationStatus');
    expect(list).not.toContain('verifyPublishedManifest');
    expect(list).not.toContain('check-runs');
    expect(list).toContain('data.includeCandidateParents === false');
    expect(list).toContain('fetchActiveCandidateParents(token, botLogin)');
    expect(candidateHelper).toContain('is:issue is:open PANDORAS');
    expect(candidateHelper).not.toContain('is:issue is:open creator:');
    expect(candidateHelper).toContain('issue.user?.login === botLogin');
    expect(candidateHelper).toContain('includes("- Beslut: PANDORAS ASK")');
    expect(list).toContain('OLYMPIA legacy candidate relation unavailable');
    expect(list).toContain('return []');
    expect(refresh).toContain("action:'pull_request_candidate_parents'");
    expect(refresh).toContain("action:'pull_request_list',includeCandidateParents:false");
    expect(frontend).toContain("action:'pull_request_list',includeCandidateParents:false");
    expect(refresh).toContain("global.textContent+=' · LIVE-kandidatstatus ej verifierad'");
  });

  it('keeps list rendering independent of session classification when the list fails', () => {
    const verify = frontend.slice(frontend.indexOf('async function verify()'), frontend.indexOf('function feedback'));
    expect(verify.indexOf('window.olympiaV2Refresh?.(prListPromise)')).toBeLessThan(verify.indexOf("call({action:'session_check'}"));
    expect(verify).toContain('await listDisplay');
    expect(verify).toContain('detta bekräftar inte att behörighet saknas');
    expect(page).toContain("data-status-ready=\"'+String(ready)+'\"");
    expect(page).toContain('window.olympiaV2SetZeusVerified=verified=>');
    expect(page).toContain('now-Number(button.dataset.ciVerifiedAt)<120000');
  });

  it('records correlated client and server timings without changing authorization gates', () => {
    expect(frontend).toContain('diagnostics:{requestId:id,clientStartedAt:new Date().toISOString()}');
    expect(edge).toContain('OLYMPIA request received');
    expect(edge).toContain('OLYMPIA PR list completed');
    expect(edge).toContain('authElapsedMs: Math.round(performance.now() - requestStartedAt)');
    expect(edge).toContain('listElapsedMs: Math.round(performance.now() - listStartedAt)');
    expect(edge).toContain('authError || !user || !user.email_confirmed_at || user.email?.toLowerCase() !== allowedEmail');
  });

  it('keeps pagination, separate lazy history and fresh approval checks intact', () => {
    expect(list).toContain('/pulls?state=open&per_page=100&page=');
    expect(list).toContain('page === 100');
    expect(page).toContain("historyPanel.addEventListener('toggle'");
    expect(refresh).not.toContain("action:'pull_request_history'");
    expect(frontend).toContain("action:'pull_request_status'");
    expect(frontend).toContain('assessment.state!==\'success\'');
  });

  it('allows only this Cloudflare Pages preview host pattern through the existing CORS gate', () => {
    expect(edge).toContain('const PR_PREVIEW_ORIGIN = /^https:\\/\\/[a-f0-9]{8}\\.alea-crusaders\\.pages\\.dev$/;');
    expect(edge).toContain('const isAllowedOrigin = (origin: string) => ALLOWED_ORIGINS.has(origin) || PR_PREVIEW_ORIGIN.test(origin);');
    expect(edge).toContain('if (!origin || !isAllowedOrigin(origin))');
    expect(edge).toContain('if (!isAllowedOrigin(req.headers.get("Origin") || ""))');
    expect(edge).toContain('Access-Control-Allow-Origin", origin');
    expect(edge).toContain('Access-Control-Allow-Methods": "POST, OPTIONS"');
  });
});
