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
let logoutStatus = 0;

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
    return Boolean(user?.id);
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
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/auth/v1/logout') logoutStatus = response.status();
  });

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


  let hermesPublication = null;
  const liveRequests = [];
  const legacyPublisherPosts = [];
  let capturePublicationRequests = false;
  page.on('request', request => {
    try {
      const u = new URL(request.url());
      if (u.hostname === 'wbmosmkirsitkonejzpg.supabase.co' || u.hostname === 'alea-crusaders.pages.dev')
        liveRequests.push({ host: u.hostname, path: u.pathname });
      if (capturePublicationRequests && request.method() === 'POST' &&
          (/\/rest\/v1\/hermes_web_jobs(?:\?|$)/i.test(u.pathname + u.search) ||
           /\/functions\/v1\/hermes-(?:web|4\.1)/i.test(u.pathname)))
        legacyPublisherPosts.push({ path: u.pathname });
    } catch {}
  });

  async function publishEvalinLassoThroughPages() {
    const fixtureText = await fs.readFile('tests/fixtures/hermes-alea-evalin-lasso.png.b64', 'utf8');
    const fixture = Buffer.from(fixtureText.trim(), 'base64');
    assert(fixture.length > 0 && fixture.length <= 12_000_000, 'HERMES_FIXTURE_SIZE_INVALID');
    const sourceSha256 = crypto.createHash('sha256').update(fixture).digest('hex');
    const before = await page.evaluate(async () => {
      if (typeof dbJson !== 'function') throw new Error('APP_DATABASE_HELPER_UNAVAILABLE');
      const people = await dbJson('characters?select=id,name&name=eq.' + encodeURIComponent('Evalin Hugger'));
      const person = Array.isArray(people) ? people.find(row => row.name === 'Evalin Hugger') : null;
      if (!person?.id) throw new Error('EVALIN_TEST_CHARACTER_NOT_FOUND');
      const personDataRows = await dbJson('characters?select=id,data&id=eq.' + encodeURIComponent(person.id));
      const query = 'combatant_type=eq.character-npc&combatant_id=eq.' + encodeURIComponent(person.id);
      const poses = await dbJson('combatant_battle_poses?select=*&' + query + '&pose_key=eq.lasso&limit=2');
      const standards = await dbJson('combatant_battle_poses?select=*&' + query + '&pose_key=eq.standard&limit=2');
      if (!Array.isArray(poses) || poses.length !== 1 || !Array.isArray(standards) || standards.length !== 1)
        throw new Error('EVALIN_POSE_REGISTRY_NOT_UNIQUE');
      return { person, personData: personDataRows?.[0], pose: poses[0], standard: standards[0] };
    });
    assert(before.pose.publication_status === 'draft' && before.pose.is_active === false &&
      before.pose.image_path === null && before.pose.pending_staging_path === null,
      'EVALIN_LASSO_DRAFT_NOT_SAFE_FOR_FIRST_PUBLICATION');

    const adminSectionButton = page.locator('button[onclick="openAdminSection(\'paperDollWorkshop\')"]');
    await adminSectionButton.click();
    await page.locator('#apdwCutoutFile').waitFor({ state: 'visible', timeout: 30000 });
    const combatantValue = await page.locator('#apdwCombatant option').evaluateAll(options =>
      options.find(option => option.textContent?.includes('Evalin Hugger'))?.value || '');
    assert(combatantValue, 'EVALIN_NOT_AVAILABLE_IN_DOCKFABRIKEN');
    await page.locator('#apdwCombatant').selectOption(combatantValue);
    await page.locator('#apdwPoseKey').selectOption('lasso');
    await page.locator('#apdwCutoutFile').setInputFiles({
      name: 'evalin-lasso.png', mimeType: 'image/png', buffer: fixture
    });
    const fileReady = await page.evaluate(() => {
      const input = document.querySelector('#apdwCutoutFile');
      const image = document.querySelector('#apdwCutout');
      return input?.files?.[0]?.type === 'image/png' && Boolean(image?.src);
    });
    assert(fileReady, 'EVALIN_LASSO_IMAGE_NOT_SELECTED_IN_PAGES');
    capturePublicationRequests = true;
    const startedAt = new Date().toISOString();
    await page.getByRole('button', { name: 'Publicera posebild via ALEA', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('#apdwActionStatus')?.textContent?.includes('Bilden är verifierad och sparad via HERMES ALEA.'),
      null, { timeout: 120000 });
    capturePublicationRequests = false;

    const after = await page.evaluate(async ({ personId, poseId, startedAt, sourceSha256 }) => {
      const encodePath = value => String(value || '').split('/').map(encodeURIComponent).join('/');
      const getRow = async (id) => {
        const rows = await dbJson('combatant_battle_poses?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
        return Array.isArray(rows) ? rows[0] : null;
      };
      const pose = await getRow(poseId);
      const standardRows = await dbJson('combatant_battle_poses?select=*&combatant_type=eq.character-npc&combatant_id=eq.' +
        encodeURIComponent(personId) + '&pose_key=eq.standard&limit=1');
      const personRows = await dbJson('characters?select=id,data&id=eq.' + encodeURIComponent(personId));
      const jobs = await dbJson('hermes_alea_jobs?select=*&target_kind=eq.combatant-pose&target_id=eq.' +
        encodeURIComponent(poseId) + '&created_at=gte.' + encodeURIComponent(startedAt) + '&order=created_at.desc&limit=5');
      const env = window.ALEA_SUPABASE_CONFIG;
      const token = typeof supabaseSession !== 'undefined' ? supabaseSession?.access_token : '';
      if (!token || env?.name !== 'development') throw new Error('DEV_AUTH_OR_BACKEND_LOST');
      const sourcePath = jobs?.[0]?.source_path;
      const outputPath = jobs?.[0]?.output_path;
      const sourceResponse = sourcePath && await authFetch('/storage/v1/object/hermes-alea-originals/' + encodePath(sourcePath), {
        headers: { Authorization: 'Bearer ' + token }
      });
      const outputResponse = outputPath && await fetch(env.url + '/storage/v1/object/public/alea-hermes-public/' + encodePath(outputPath));
      const sourceBytes = sourceResponse?.ok ? await sourceResponse.arrayBuffer() : null;
      const outputBlob = outputResponse?.ok ? await outputResponse.blob() : null;
      const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(n => n.toString(16).padStart(2, '0')).join('');
      let raster = null;
      if (outputBlob) {
        const bitmap = await createImageBitmap(outputBlob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let transparent = 0, visible = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] === 0) transparent++;
          if (pixels[i] > 0) visible++;
        }
        raster = { width: bitmap.width, height: bitmap.height, transparent, visible };
        bitmap.close();
      }
      return {
        pose, standard: standardRows?.[0], person: personRows?.[0], jobs,
        sourceStatus: sourceResponse?.status || 0, outputStatus: outputResponse?.status || 0,
        sourceSha256Actual: sourceBytes ? await digest(sourceBytes) : '',
        outputSha256Actual: outputBlob ? await digest(await outputBlob.arrayBuffer()) : '',
        sourceBytesActual: sourceBytes?.byteLength || 0,
        outputBytesActual: outputBlob?.size || 0,
        outputMime: outputBlob?.type || '',
        raster, backend: env?.url
      };
    }, { personId: before.person.id, poseId: before.pose.id, startedAt, sourceSha256 });
    const job = after.jobs?.[0];
    assert(after.jobs?.length === 1, 'HERMES_ALEA_JOB_MISSING_OR_DUPLICATED');
    assert(job.requested_by === firstUserId && job.target_kind === 'combatant-pose' &&
      job.target_id === before.pose.id && job.operation === 'CREATE' && job.state === 'activated',
      'HERMES_ALEA_JOB_TARGET_OR_STATE_INVALID');
    assert(job.source_sha256 === sourceSha256 && after.sourceSha256Actual === sourceSha256 &&
      job.source_bytes === fixture.length && after.sourceStatus === 200,
      'PRIVATE_ORIGINAL_SHA256_READBACK_FAILED');
    assert(job.output_sha256 && after.outputSha256Actual === job.output_sha256 &&
      after.outputStatus === 200 && after.outputMime === 'image/webp' &&
      job.output_bytes === after.outputBytesActual,
      'PUBLIC_WEBP_SHA256_READBACK_FAILED');
    assert(job.alpha_preserved === true && after.raster?.transparent > 0 &&
      after.raster?.visible > 0 && after.raster?.width <= 1280 && after.raster?.height <= 1280,
      'OUTPUT_ALPHA_DIMENSIONS_OR_IMAGE_CONTENT_INVALID');
    assert(job.verified_at && job.result_revision === before.pose.image_revision + 1 &&
      after.pose?.image_revision === job.result_revision &&
      after.pose.image_path === job.output_path, 'POSE_REVISION_OR_REGISTER_INVALID');
    assert(after.pose.publication_status === before.pose.publication_status &&
      after.pose.is_active === before.pose.is_active && after.pose.base_key === before.pose.base_key &&
      JSON.stringify(after.pose.mounting_profile) === JSON.stringify(before.pose.mounting_profile) &&
      after.pose.pending_staging_path === null,
      'POSE_STATUS_BASE_OR_MOUNTING_CHANGED');
    assert(after.standard?.image_path === before.standard.image_path &&
      after.standard?.image_revision === before.standard.image_revision &&
      after.standard?.is_active === before.standard.is_active &&
      JSON.stringify(after.standard?.mounting_profile) === JSON.stringify(before.standard.mounting_profile),
      'EVALIN_STANDARD_POSE_CHANGED');
    assert(after.person?.id === before.person.id &&
      JSON.stringify(after.person?.data) === JSON.stringify(before.personData?.data),
      'EVALIN_CHARACTER_OR_EQUIPMENT_DATA_CHANGED');
    assert(legacyPublisherPosts.length === 0, 'LEGACY_HERMES_4_1_PUBLISH_REQUEST_OBSERVED');
    assert(liveRequests.length === 0 && after.backend === SUPABASE, 'LIVE_BACKEND_REQUEST_OBSERVED');

    report.checks.hermesAleaEdge = 'pass';
    report.checks.hermesAleaStorageAndSha256 = 'pass';
    report.checks.poseRegistryAndMetadata = 'pass';
    report.checks.imageIntegrityAndTransparency = 'pass';
    report.checks.noMountingOrStandardPoseChange = 'pass';
    report.checks.noLegacyPublication = 'pass';
    report.checks.devIsolation = 'pass';
    report.hermesAlea = {
      jobId: job.id, poseId: before.pose.id, outputPath: job.output_path,
      sourceSha256, outputSha256: job.output_sha256,
      sourceBytes: job.source_bytes, outputBytes: job.output_bytes,
      width: job.width, height: job.height, alphaPreserved: job.alpha_preserved,
      archiveState: job.archive_state, archiveDriveIdPresent: Boolean(job.archive_drive_id),
      legacyPublisherPosts: legacyPublisherPosts.length, liveRequests: liveRequests.length
    };
    await page.screenshot({ path: path.join(outputDir, 'hermes-alea-evalin-lasso.png'), fullPage: true });
    hermesPublication = { poseId: before.pose.id, personId: before.person.id, outputPath: job.output_path };
  }

  if (process.env.ALEA_HERMES_PUBLICATION === 'YES') await publishEvalinLassoThroughPages();

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForAuthenticatedHome();
  const reloadedUserId = await currentUserId();
  const adminAfterReload = await page.evaluate(() => {
    try { return typeof activeUser === 'function' && activeUser()?.admin === true; }
    catch { return false; }
  });
  assert(reloadedUserId === firstUserId && adminAfterReload, 'AUTH_ADMIN_SESSION_DID_NOT_SURVIVE_RELOAD');
  report.checks.sessionReload = 'pass';

  if (hermesPublication) {
    await page.locator('#adminNavBtn').click();
    await page.locator('button[onclick="openAdminSection(\'paperDollWorkshop\')"]').click();
    await page.locator('#apdwCutoutFile').waitFor({ state: 'visible', timeout: 30000 });
    const combatantValue = await page.locator('#apdwCombatant option').evaluateAll(options =>
      options.find(option => option.textContent?.includes('Evalin Hugger'))?.value || '');
    assert(combatantValue, 'EVALIN_NOT_AVAILABLE_AFTER_RELOAD');
    await page.locator('#apdwCombatant').selectOption(combatantValue);
    await page.locator('#apdwPoseKey').selectOption('lasso');
    await page.getByRole('button', { name: 'Ladda sparad profil', exact: true }).click();
    await page.waitForFunction(() => {
      const image = document.querySelector('#apdwCutout');
      return image?.src?.includes('hermes/battle-pose-cutout/') &&
        image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }, null, { timeout: 30000 });
    const restored = await page.locator('#apdwCutout').evaluate(image => ({
      src: image.src, width: image.naturalWidth, height: image.naturalHeight
    }));
    assert(restored.src.endsWith(hermesPublication.outputPath), 'POSE_CLIENT_READBACK_PATH_MISMATCH');
    report.checks.clientReadbackAfterReload = 'pass';
    report.hermesAlea.clientReadback = { width: restored.width, height: restored.height };
    await page.screenshot({ path: path.join(outputDir, 'hermes-alea-evalin-lasso-restored.png'), fullPage: true });
  }



  const logoutState = await page.evaluate(async () => {
    if (typeof logoutUser !== 'function') throw new Error('APP_LOGOUT_UNAVAILABLE');
    await logoutUser();
    return {
      authenticated: Boolean(typeof activeUser === 'function' && activeUser()),
      loginScreenHidden: Boolean(document.querySelector('#loginScreen')?.classList.contains('hidden')),
      sessionStored: Boolean(localStorage.getItem('alea_supabase_session_dev'))
    };
  });
  assert(logoutStatus >= 200 && logoutStatus < 300, 'SUPABASE_AUTH_LOGOUT_FAILED');
  assert(!logoutState.authenticated && !logoutState.loginScreenHidden && !logoutState.sessionStored,
    'APP_LOGOUT_DID_NOT_CLEAR_DEV_SESSION');
  report.checks.normalSupabaseLogout = 'pass';
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
