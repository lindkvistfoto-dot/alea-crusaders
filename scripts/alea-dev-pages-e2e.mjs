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
  report.checks.normalSupabaseLogin = 'pass';

  const adminVisible = await page.locator('#adminNavBtn').isVisible().catch(() => false);
  assert(!adminVisible, 'DEV_TEST_ACCOUNT_HAS_UNEXPECTED_ADMIN_UI_ACCESS');
  report.checks.leastPrivilegeUi = 'pass';

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForAuthenticatedHome();
  const reloadedUserId = await currentUserId();
  assert(reloadedUserId === firstUserId, 'AUTH_SESSION_DID_NOT_SURVIVE_RELOAD');
  report.checks.sessionReload = 'pass';
  report.result = 'PASS';
}
await fs.mkdir(outputDir, { recursive: true });
try {
  await main();
} catch (error) {
  report.result = 'FAIL';
  report.failure = sanitize(error?.message || 'TEST_FAILED').replace(/[^A-Za-z0-9_:\- ]/g, ' ').slice(0, 300);
  if (page) await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  if (page) await page.evaluate(() => localStorage.clear()).catch(() => {});
  if (context) await context.clearCookies().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ result: report.result, checks: report.checks, failure: report.failure }));
if (report.result !== 'PASS') process.exitCode = 1;
