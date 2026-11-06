#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const PROJECT = 'wkiuyklzzroavclnsxna';
const SUPABASE = `https://${PROJECT}.supabase.co`;
const EMAIL = process.env.ALEA_DEV_TEST_EMAIL || '';
const PASSWORD = process.env.ALEA_DEV_TEST_PASSWORD || '';
const outputDir = 'test-results/alea-dev-pages-e2e';
const report = { test: 'auth-smoke', checks: {}, errors: [], startedAt: new Date().toISOString() };
let context;
let browser;
let page;

function assert(ok, message) { if (!ok) throw new Error(message); }
function previewFromInput() {
  if (process.env.ALEA_PREVIEW_URL) return process.env.ALEA_PREVIEW_URL.trim();
  const body = process.env.ALEA_PR_BODY || '';
  return body.match(/^ALEA-DEV-PREVIEW:\s*(https:\/\/\S+)\s*$/m)?.[1] || '';
}
function validatePreview(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('PREVIEW_URL_INVALID'); }
  assert(u.protocol === 'https:' && u.hostname.endsWith('.alea-crusaders.pages.dev') &&
    u.hostname !== 'alea-crusaders.pages.dev' && !u.username && !u.password && !u.search && !u.hash,
    'PREVIEW_URL_NOT_AN_ISOLATED_CLOUDFLARE_PREVIEW');
  return u.origin;
}
function sanitize(value) {
  return String(value)
    .replaceAll(EMAIL, '[redacted]')
    .replaceAll(PASSWORD, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[redacted]')
    .replace(/sb_(?:service_role|secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 300);
}
async function currentUserId() {
  return page.evaluate(() => {
    try {
      const user = typeof activeUser === 'function' ? activeUser() : null;
      return user && typeof user.id === 'string' ? user.id : '';
    } catch { return ''; }
  });
}
async function waitForAuthenticatedHome() {
  await page.waitForFunction(() => {
    const user = typeof activeUser === 'function' ? activeUser() : null;
    const home = document.querySelector('#home');
    const login = document.querySelector('#loginForm');
    return Boolean(user?.id && home && !home.classList.contains('hidden') &&
      (!login || login.classList.contains('hidden') || getComputedStyle(login).display === 'none'));
  }, null, { timeout: 45000 });
}
async function main() {
  assert(EMAIL && PASSWORD, 'MISSING_ALEA_DEV_TEST_CREDENTIAL_SECRETS');
  assert(PASSWORD.length >= 16, 'DEV_TEST_PASSWORD_TOO_SHORT');
  const origin = validatePreview(previewFromInput());
  report.preview = origin;

  const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: 'en_US.UTF-8' };
  browser = await chromium.launch({ headless: true, env });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') (report.consoleErrors ||= []).push(sanitize(message.text()));
  });
  page.on('pageerror', error => report.errors.push('PAGE_ERROR: ' + sanitize(error.message)));

  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const backend = await page.evaluate(() => window.ALEA_SUPABASE_CONFIG &&
    ({ name: window.ALEA_SUPABASE_CONFIG.name, url: window.ALEA_SUPABASE_CONFIG.url }));
  assert(backend?.name === 'development' && backend.url === SUPABASE, 'PREVIEW_BACKEND_IS_NOT_DEV');
  report.checks.devBackend = 'pass';

  await page.locator('#loginEmail').fill(EMAIL);
  await page.locator('#loginPassword').fill(PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await waitForAuthenticatedHome();
  const firstUserId = await currentUserId();
  assert(firstUserId, 'SUPABASE_AUTH_SESSION_NOT_ESTABLISHED');
  const activeAdmin = await page.evaluate(() => {
    try { return typeof activeUser === 'function' && activeUser()?.admin === true; }
    catch { return false; }
  });
  assert(activeAdmin, 'DEV_TEST_ACCOUNT_MISSING_PERMANENT_ALEA_ADMIN_ROLE');
  report.checks.normalSupabaseLogin = 'pass';
  report.checks.permanentAdminRole = 'pass';

  const adminVisible = await page.locator('#adminNavBtn').isVisible().catch(() => false);
  assert(adminVisible, 'DEV_ADMIN_NAVIGATION_NOT_AVAILABLE');
  await page.locator('#adminNavBtn').click();
  await page.locator('#admin').waitFor({ state: 'visible', timeout: 15000 });
  report.checks.adminPanel = 'pass';

  const adminData = await page.evaluate(async ({ tag, uid }) => {
    if (typeof dbJson !== 'function') throw new Error('APP_DATABASE_HELPER_UNAVAILABLE');
    let campaignId = '';
    let characterId = '';
    let cleanupOk = true;
    try {
      const existing = await dbJson('campaigns?select=id&name=eq.' + encodeURIComponent(tag));
      if (Array.isArray(existing) && existing.length) throw new Error('ADMIN_PROBE_NAME_ALREADY_EXISTS');
      const campaigns = await dbJson('campaigns', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: tag, description: 'Temporary DEV admin permission check', created_by: uid })
      });
      campaignId = campaigns?.[0]?.id || '';
      if (!campaignId) throw new Error('DEV_ADMIN_CAMPAIGN_INSERT_FAILED');

      const characters = await dbJson('characters', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          campaign_id: campaignId, owner_id: null, name: tag,
          is_npc: true, schema_version: 1,
          data: { identity: { namn: tag }, test_fixture: true },
          created_by: uid
        })
      });
      characterId = characters?.[0]?.id || '';
      if (!characterId) throw new Error('DEV_ADMIN_GAME_DATA_INSERT_FAILED');

      const updated = await dbJson('characters?id=eq.' + encodeURIComponent(characterId), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: tag + '_updated' })
      });
      if (!updated?.[0]?.id) throw new Error('DEV_ADMIN_GAME_DATA_UPDATE_FAILED');
      return { campaignWrite: true, gameDataWrite: true };
    } finally {
      try {
        if (campaignId) {
          await dbJson('characters?campaign_id=eq.' + encodeURIComponent(campaignId), {
            method: 'DELETE', headers: { Prefer: 'return=minimal' }
          });
          await dbJson('campaigns?id=eq.' + encodeURIComponent(campaignId), {
            method: 'DELETE', headers: { Prefer: 'return=minimal' }
          });
        } else {
          await dbJson('campaigns?name=eq.' + encodeURIComponent(tag), {
            method: 'DELETE', headers: { Prefer: 'return=minimal' }
          });
        }
      } catch { cleanupOk = false; }
      if (!cleanupOk) throw new Error('DEV_ADMIN_PROBE_CLEANUP_FAILED');
    }
  }, { tag: '__HEPHAISTOS_DEV_ADMIN_' + crypto.randomUUID(), uid: firstUserId });
  assert(adminData.campaignWrite && adminData.gameDataWrite, 'DEV_ADMIN_WRITE_ACCESS_NOT_VERIFIED');
  report.checks.campaignAndGameDataWrite = 'pass';

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForAuthenticatedHome();
  const reloadedUserId = await currentUserId();
  const adminAfterReload = await page.evaluate(() => {
    try { return typeof activeUser === 'function' && activeUser()?.admin === true; }
    catch { return false; }
  });
  assert(reloadedUserId === firstUserId && adminAfterReload, 'AUTH_ADMIN_SESSION_DID_NOT_SURVIVE_RELOAD');
  report.checks.sessionReload = 'pass';
  report.result = 'PASS';
}
await fs.mkdir(outputDir, { recursive: true });
try {
  await main();
} catch (error) {
  report.result = 'FAIL';
  report.failure = sanitize(error?.message || 'TEST_FAILED').replace(/[^A-Za-z0-9_:\- ]/g, ' ').slice(0, 300);
} finally {
  let cleanupOk = true;
  if (page) {
    cleanupOk = await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      return localStorage.length === 0 && sessionStorage.length === 0;
    }).catch(() => false);
  }
  if (context) {
    await context.clearCookies().catch(() => { cleanupOk = false; });
    const remainingCookies = await context.cookies().catch(() => { cleanupOk = false; return [true]; });
    if (remainingCookies.length) cleanupOk = false;
    await context.close().catch(() => { cleanupOk = false; });
  }
  if (browser) await browser.close().catch(() => { cleanupOk = false; });
  report.checks.browserSessionCleanup = cleanupOk ? 'pass' : 'fail';
  if (!cleanupOk) {
    report.result = 'FAIL';
    report.failure ||= 'BROWSER_SESSION_CLEANUP_FAILED';
  }
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ result: report.result, checks: report.checks, failure: report.failure }));
if (report.result !== 'PASS') process.exitCode = 1;
