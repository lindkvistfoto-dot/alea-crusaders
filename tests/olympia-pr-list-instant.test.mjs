import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const frontend = readFileSync(new URL('../olympia-v2/dev-approval.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../olympia-v2/index.html', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/olympia-control/index.ts', import.meta.url), 'utf8');
const refresh = page.slice(page.indexOf('async function refresh('), page.indexOf('let refreshing=false'));
const list = edge.slice(edge.indexOf('if (data.action === "pull_request_list")'), edge.indexOf('if (data.action === "pull_request_history")'));

describe('OLYMPIA instant PR-list recovery', () => {
  it('starts the authenticated PR-list read concurrently with session verification', () => {
    const verify = frontend.slice(frontend.indexOf('async function verify()'), frontend.indexOf('function feedback'));
    expect(verify.indexOf("window.olympiaV2Request({action:'pull_request_list'})")).toBeLessThan(verify.indexOf("call({action:'session_check'}"));
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
    expect(page).toContain('function writeCachedPrList(pullRequests)');
    expect(page).toContain('CI och mergebarhet kontrolleras på nytt');
    expect(page).toContain('showCachedPrList();');
    expect(page).toContain("sessionStorage.setItem(prCacheKey,JSON.stringify({pullRequests:projected,verifiedAt:Date.now()}))");
    expect(page).toContain('const ready=state===\'success\'&&mergeable&&eligible&&fresh');
  });

  it('records correlated client and server timings without changing authorization gates', () => {
    expect(frontend).toContain('diagnostics:{requestId:id,clientStartedAt:new Date().toISOString()}');
    expect(edge).toContain('OLYMPIA request received');
    expect(edge).toContain('OLYMPIA PR list completed');
    expect(edge).toContain('requestId, authElapsedMs');
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

  it('uses the existing allowlisted, origin-reflecting CORS path for OPTIONS and POST', () => {
    expect(edge).toContain('if (!origin || !ALLOWED_ORIGINS.has(origin))');
    expect(edge).toContain('Access-Control-Allow-Origin", origin');
    expect(edge).toContain('Access-Control-Allow-Methods": "POST, OPTIONS"');
  });
});
