#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const PROJECT = 'wkiuyklzzroavclnsxna';
const TEST_CASE = process.env.ALEA_TEST_CASE || 'evalin-lasso';
const SUPABASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'alea-dev-e2e@alea-crusaders.test';
const EVALIN = 'd6310877-52e8-41c0-b2e5-bd81d5a50bbf';
const EVALIN_CAMPAIGN = '846e8089-24da-4825-af34-32903117152a';
const LASSO = '0795bc2a-6470-4b61-bb97-54e0b22b140c';
const STANDARD = '18cc3c28-d75a-4c98-a0f1-773a75e9cb43';
const FIXTURE = 'tests/fixtures/png-transfer-alpha-smoke.png';
const outputDir = 'test-results/alea-dev-pages-e2e';
const report = { test: TEST_CASE, checks: {}, errors: [], startedAt: new Date().toISOString() };
const serviceKey = process.env.ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY;
let userId = '';
let membershipBefore = null;
let context;
let browser;
let page;

function assert(ok, message) { if (!ok) throw new Error(message); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function api(url, options={}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`DEV_API_${response.status}`);
  return response;
}
const adminHeaders = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' });
async function admin(pathname, method='GET', body) {
  const response = await api(SUPABASE + pathname, { method, headers: adminHeaders(), ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  return response.status === 204 ? null : response.json();
}
async function rest(tablePath, method='GET', body) {
  const response = await api(SUPABASE + '/rest/v1/' + tablePath, {
    method, headers: { ...adminHeaders(), Prefer: 'return=representation' },
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return response.status === 204 ? [] : response.json();
}
async function storage(bucket, objectPath) {
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  return Buffer.from(await (await api(`${SUPABASE}/storage/v1/object/${bucket}/${encoded}`, {headers: adminHeaders()})).arrayBuffer());
}
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
async function prepareIdentity() {
  const password = crypto.randomBytes(36).toString('base64url');
  const users = await admin('/auth/v1/admin/users?page=1&per_page=1000');
  let user = users.users.find(item => item.email?.toLowerCase() === EMAIL);
  if (!user) {
    user = await admin('/auth/v1/admin/users', 'POST', {email:EMAIL, password, email_confirm:true, user_metadata:{display_name:'ALEA DEV automated test'}});
    report.account = 'created';
  } else report.account = 'reused';
  userId = user.id;
  await admin('/auth/v1/admin/users/' + userId, 'PUT', {password, ban_duration:'none', email_confirm:true});
  let rows = await rest('profiles?select=id,is_admin&id=eq.' + userId);
  if (!rows.length) {
    for (let i=0; i<10 && !rows.length; i++) {
      await new Promise(resolve=>setTimeout(resolve,500));
      rows = await rest('profiles?select=id,is_admin&id=eq.' + userId);
    }
  }
  assert(rows.length===1, 'DEV_TEST_PROFILE_MISSING');
  await rest('profiles?id=eq.' + userId, 'PATCH', {is_admin:true});
  const memberships=await rest('campaign_members?select=campaign_id,user_id,role&campaign_id=eq.'+EVALIN_CAMPAIGN+'&user_id=eq.'+userId);
  membershipBefore=memberships[0]||null;
  if(!membershipBefore) await rest('campaign_members','POST',{campaign_id:EVALIN_CAMPAIGN,user_id:userId,role:'gm'});
  else if(membershipBefore.role!=='gm') await rest('campaign_members?campaign_id=eq.'+EVALIN_CAMPAIGN+'&user_id=eq.'+userId,'PATCH',{role:'gm'});
  return password;
}
async function cleanupIdentity() {
  if (!userId) return;
  try {
    const memberPath='campaign_members?campaign_id=eq.'+EVALIN_CAMPAIGN+'&user_id=eq.'+userId;
    if(membershipBefore) await rest(memberPath,'PATCH',{role:membershipBefore.role});
    else await rest(memberPath,'DELETE');
    report.campaignAccessCleanup=membershipBefore?'restored':'removed';
  } catch { report.errors.push('TEST_CAMPAIGN_ACCESS_CLEANUP_FAILED'); }
  try { await rest('profiles?id=eq.' + userId, 'PATCH', {is_admin:false}); }
  catch { report.errors.push('TEST_PROFILE_DEADMIN_FAILED'); }
  try { await admin('/auth/v1/admin/users/' + userId, 'PUT', {ban_duration:'876000h'}); report.accountCleanup='banned-and-demoted'; }
  catch { report.errors.push('TEST_ACCOUNT_BAN_FAILED'); }
}
async function snapshot(id) {
  const rows = await rest('combatant_battle_poses?select=*&id=eq.' + id);
  assert(rows.length===1, 'POSE_ROW_MISSING_' + id);
  return rows[0];
}
async function screenshot(name) {
  if (!page) return;
  try { await page.screenshot({path:path.join(outputDir,name), fullPage:true, animations:'disabled'}); }
  catch { /* Keep the main test error as the report cause. */ }
}
async function main() {
  assert(TEST_CASE==='evalin-lasso', 'UNSUPPORTED_DEV_TEST_CASE');
  assert(serviceKey, 'MISSING_ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY');
  const origin = validatePreview(previewFromInput());
  report.preview = origin;
  report.backend = 'verified-at-runtime';
  const fixture = await fs.readFile(FIXTURE);
  const fixtureHash = sha(fixture);
  const lassoBefore = await snapshot(LASSO);
  const standardBefore = await snapshot(STANDARD);
  assert(lassoBefore.combatant_id===EVALIN && lassoBefore.pose_key==='lasso' &&
    lassoBefore.is_active===false && lassoBefore.publication_status==='draft' &&
    !lassoBefore.image_path && Number(lassoBefore.image_revision)===0,
    'LASSO_NOT_EMPTY_INACTIVE_DRAFT_ABORTED_TO_PROTECT_EXISTING_DATA');
  assert(standardBefore.combatant_id===EVALIN && standardBefore.is_active===true,
    'EVALIN_ACTIVE_STANDARD_POSE_BASELINE_INVALID');
  report.checks.initialPoseSafety = 'pass';

  const password = await prepareIdentity();
  report.checks.testIdentity = 'pass';
  const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: 'en_US.UTF-8' };
  browser = await chromium.launch({headless:true, env});
  context = await browser.newContext({viewport:{width:1440,height:1000}, acceptDownloads:false});
  page = await context.newPage();
  const sanitize = value => String(value).replaceAll(EMAIL,'[redacted]').replaceAll(password,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_.-]{20,}/g,'[redacted]').replace(/sb_(?:service_role|secret|publishable)_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,300);
  page.on('console', message => { if (message.type()==='error') (report.consoleErrors ||= []).push(sanitize(message.text())); });
  page.on('pageerror', error => {
    const message=String(error.message).replaceAll(EMAIL,'[redacted]').replaceAll(password,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_.-]{20,}/g,'[redacted]').replace(/sb_(?:service_role|secret|publishable)_[A-Za-z0-9_-]+/g,'[redacted]');
    report.errors.push('PAGE_ERROR: ' + message.slice(0,300));
  });
  await page.goto(origin, {waitUntil:'domcontentloaded',timeout:60000});
  const backend = await page.evaluate(() => window.ALEA_SUPABASE_CONFIG && ({name:window.ALEA_SUPABASE_CONFIG.name,url:window.ALEA_SUPABASE_CONFIG.url}));
  assert(backend?.name==='development' && backend.url===SUPABASE, 'PREVIEW_BACKEND_IS_NOT_DEV');
  report.checks.devBackend = 'pass';
  await page.locator('#loginEmail').fill(EMAIL);
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit());
  await page.locator('#adminNavBtn').waitFor({state:'visible',timeout:45000});
  report.checks.normalSupabaseLogin = 'pass';
  await screenshot('01-authenticated.png');
  await page.locator('#adminNavBtn').click();
  await page.getByRole('button',{name:/Arcane Paper Doll.*Dockfabriken/}).click();
  await page.locator('#apdwCombatant').waitFor({state:'visible',timeout:30000});
  const options = await page.locator('#apdwCombatant option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,label:o.textContent||''})));
  const evalin = options.find(o=>/Evalin Hugger/i.test(o.label));
  assert(evalin, 'EVALIN_NOT_AVAILABLE_IN_DOCKFABRIKEN');
  await page.locator('#apdwCombatant').selectOption(evalin.value);
  await page.locator('#apdwPoseKey').selectOption('lasso');
  const selectedLabel=await page.locator('#apdwCombatant option:checked').textContent();
  assert(/Evalin Hugger/i.test(selectedLabel||''),'EVALIN_SELECTION_DID_NOT_STICK');
  await page.locator('#apdwCutoutFile').setInputFiles(FIXTURE);
  await screenshot('02-ready-to-publish.png');
  page.on('dialog', async dialog => { report.dialogs ||= []; report.dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.locator('button[data-action="save-pose"]').click();
  await page.waitForFunction(() => {
    const root=document.querySelector('#arcanePaperDollWorkshopMount');
    if(!root)return true;
    const status=document.querySelector('#apdwActionStatus')?.textContent||'';
    return /Bilden är verifierad och sparad via HERMES ALEA|kunde inte publiceras|misslyckades|Ogiltig Battle Pose|Välj en cutout|Autentiserad lagringsanslutning saknas/i.test(status);
  },null,{timeout:90000});
  const publishStatus=await page.locator('#apdwActionStatus').textContent().catch(()=> 'STATUS_ELEMENT_MISSING');
  report.publishStatus=String(publishStatus||'').replaceAll(EMAIL,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_.-]{20,}/g,'[redacted]').slice(0,300);
  assert(/Bilden är verifierad och sparad via HERMES ALEA/i.test(report.publishStatus),'PUBLISH_UI_DID_NOT_CONFIRM_SUCCESS');
  report.checks.pagesPublication = 'pass';
  await screenshot('02-published.png');

  const lassoAfter = await snapshot(LASSO);
  const standardAfter = await snapshot(STANDARD);
  assert(lassoAfter.is_active===false && lassoAfter.publication_status==='draft' &&
    lassoAfter.base_key===lassoBefore.base_key &&
    JSON.stringify(lassoAfter.mounting_profile)===JSON.stringify(lassoBefore.mounting_profile),
    'LASSO_STATE_CHANGED_BEYOND_IMAGE');
  assert(standardAfter.is_active===standardBefore.is_active &&
    standardAfter.image_path===standardBefore.image_path &&
    Number(standardAfter.image_revision)===Number(standardBefore.image_revision),
    'ACTIVE_STANDARD_POSE_WAS_CHANGED');
  assert(typeof lassoAfter.image_path==='string' && lassoAfter.image_path.includes('/'+LASSO+'/') &&
    lassoAfter.image_path.endsWith('.webp') && Number(lassoAfter.image_revision)===1,
    'LASSO_IMAGE_POINTER_OR_REVISION_INVALID');
  report.checks.registerRevisionAndPoseSafety = 'pass';

  const jobs = await rest('hermes_alea_jobs?select=*&target_kind=eq.combatant-pose&target_id=eq.'+LASSO+'&state=eq.activated&order=created_at.desc&limit=5');
  const job = jobs.find(item=>item.source_sha256===fixtureHash);
  assert(job, 'HERMES_ALEA_JOB_NOT_FOUND');
  assert(job.source_sha256===fixtureHash && job.output_sha256 && job.verified_at &&
    job.output_path && job.archive_state, 'HERMES_ALEA_HASH_OR_VERIFICATION_FIELDS_MISSING');
  const original = await storage('hermes-alea-originals',job.source_path);
  const display = await storage('hermes-alea-display',job.output_path);
  const publicOutput = await storage('alea-hermes-public',lassoAfter.image_path);
  assert(sha(original)===job.source_sha256 && sha(display)===job.output_sha256 &&
    sha(publicOutput)===job.output_sha256, 'STORAGE_SHA256_READBACK_FAILED');
  report.checks.storageAndSha256 = 'pass';
  report.archiveState = job.archive_state;
  report.archiveDriveIdPresent = Boolean(job.archive_drive_id);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#adminNavBtn').waitFor({state:'visible',timeout:45000});
  await page.locator('#adminNavBtn').click();
  await page.getByRole('button',{name:/Arcane Paper Doll.*Dockfabriken/}).click();
  await page.locator('#apdwCombatant').waitFor({state:'visible',timeout:30000});
  const refreshedOptions = await page.locator('#apdwCombatant option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,label:o.textContent||''})));
  const refreshedEvalin = refreshedOptions.find(o=>/Evalin Hugger/i.test(o.label));
  assert(refreshedEvalin,'EVALIN_NOT_AVAILABLE_AFTER_RELOAD');
  await page.locator('#apdwCombatant').selectOption(refreshedEvalin.value);
  await page.locator('#apdwPoseKey').selectOption('lasso');
  await page.locator('button[data-action="load-pose"]').click();
  await page.getByText(/Monteringsprofil laddad/i).waitFor({timeout:30000});
  await page.waitForFunction(()=>{const image=document.querySelector('#apdwCutout');return image && !image.hidden && image.complete && image.naturalWidth>0;},{},{timeout:30000});
  report.checks.dockfabrikenDisplayAfterReload = 'pass';
  await screenshot('03-dockfabriken-readback.png');

  assert(job.archive_state==='verified' && job.archive_drive_id && job.archive_verified_at,
    'DEV_ARCHIVE_NOT_VERIFIED');
  report.checks.archiveReadback = 'pass';
  report.result = 'PASS';
}
await fs.mkdir(outputDir,{recursive:true});
try {
  await main();
} catch (error) {
  report.result = 'FAIL';
  report.failure = String(error?.message||'TEST_FAILED').replace(/[^A-Za-z0-9_:\- ]/g,' ').slice(0,300);
  await screenshot('failure.png');
} finally {
  if (context) await context.close().catch(()=>{});
  if (browser) await browser.close().catch(()=>{});
  await cleanupIdentity();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({result:report.result,checks:report.checks,archiveState:report.archiveState,failure:report.failure,account:report.account,accountCleanup:report.accountCleanup}));
if (report.result!=='PASS') process.exitCode=1;
