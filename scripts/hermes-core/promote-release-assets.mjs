import fs from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const BUCKET = 'alea-hermes-public';
const ASSET_KEY = /^[a-z0-9][a-z0-9_.-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message) { throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function authHeaders(key, extra = {}) {
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}
function objectUrl(base, path) {
  return `${base.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
async function readRegistry(base, key, assetKey, fetchImpl) {
  const query = new URLSearchParams({
    asset_key: `eq.${assetKey}`,
    select: 'id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision',
  });
  const response = await fetchImpl(`${base}/rest/v1/arcane_system_assets?${query}`, {
    headers: authHeaders(key),
  });
  if (!response.ok) fail(`Registry read failed for ${assetKey} (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) fail(`Registry identity is ambiguous for ${assetKey}.`);
  return rows[0] ?? null;
}
async function storageRead(base, key, path, fetchImpl) {
  return fetchImpl(objectUrl(base, path), {headers: authHeaders(key), cache: 'no-store'});
}
async function verifiedBytes(base, key, image, fetchImpl, {allowMissing = false} = {}) {
  const response = await storageRead(base, key, image.webp_path, fetchImpl);
  if (!response.ok && allowMissing && response.status === 404) {
    const error = await response.clone().json().catch(() => ({}));
    if (error.code === 'NoSuchKey') return null;
  }
  if (!response.ok) fail(`Storage read failed for ${image.asset_key} (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.headers.get('content-type')?.split(';')[0] !== 'image/webp') {
    fail(`Storage object is not reported as WebP for ${image.asset_key}.`);
  }
  if (bytes.length !== image.webp_bytes || sha256(bytes) !== image.webp_sha256) {
    fail(`Storage bytes do not match the HERMES CORE manifest for ${image.asset_key}.`);
  }
  return bytes;
}
function validateManifest(manifest) {
  if (!manifest || manifest.schema !== 'olympia-image-promotion/v1' || !Array.isArray(manifest.images)) {
    fail('Invalid OLYMPIA image promotion manifest.');
  }
  const seen = new Set();
  for (const image of manifest.images) {
    if (!image || typeof image.asset_key !== 'string' || !ASSET_KEY.test(image.asset_key) ||
        !SHA256.test(image.webp_sha256 || '') ||
        image.webp_path !== `hermes/system-asset/${image.asset_key}/${image.webp_sha256}.webp` ||
        !Number.isSafeInteger(image.webp_bytes) || image.webp_bytes <= 0 ||
        !Number.isSafeInteger(image.width) || image.width <= 0 ||
        !Number.isSafeInteger(image.height) || image.height <= 0 ||
        typeof image.alpha !== 'boolean' ||
        !['system', 'honor-definition', 'honor-relief'].includes(image.target_kind || 'system') ||
        typeof (image.target_id || image.asset_key) !== 'string' ||
        ((image.target_kind || 'system') !== 'system' && !UUID.test(image.target_id || '')) ||
        ((image.target_kind || 'system') === 'honor-relief' && !['enamel', 'metal', 'wood', 'stone', 'other'].includes(image.target_material))) {
      fail('Invalid or incomplete HERMES CORE asset metadata in the OLYMPIA manifest.');
    }
    if (seen.has(image.asset_key)) fail(`Duplicate image identity in the OLYMPIA manifest: ${image.asset_key}.`);
    seen.add(image.asset_key);
  }
}

async function registerLiveAsset(base, key, image, fetchImpl) {
  const headers = authHeaders(key, {'content-type': 'application/json', prefer: 'return=representation'});
  let live = await readRegistry(base, key, image.asset_key, fetchImpl);
  if (!live) {
    const response = await fetchImpl(`${base}/rest/v1/arcane_system_assets`, {
      method: 'POST', headers,
      body: JSON.stringify([{id: randomUUID(), asset_key: image.asset_key, label: image.label || image.asset_key}]),
    });
    if (!response.ok && response.status !== 409) fail(`Could not create LIVE image identity ${image.asset_key} (${response.status}).`);
    live = await readRegistry(base, key, image.asset_key, fetchImpl);
    if (!live) fail(`LIVE image identity was not readable after registration for ${image.asset_key}.`);
  }

  if (live.asset_path === image.webp_path && live.app_sha256 === image.webp_sha256 &&
      Number(live.app_bytes) === image.webp_bytes && Number(live.width) === image.width &&
      Number(live.height) === image.height && live.alpha_preserved === image.alpha) return 'already-current';

  const revision = Number(live.image_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) fail(`LIVE image revision is missing for ${image.asset_key}.`);
  const query = new URLSearchParams({asset_key: `eq.${image.asset_key}`, image_revision: `eq.${revision}`});
  if (live.asset_path === null) query.set('asset_path', 'is.null');
  else query.set('asset_path', `eq.${live.asset_path}`);
  const response = await fetchImpl(`${base}/rest/v1/arcane_system_assets?${query}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({
      asset_path: image.webp_path,
      app_sha256: image.webp_sha256,
      app_bytes: image.webp_bytes,
      width: image.width,
      height: image.height,
      alpha_preserved: image.alpha,
    }),
  });
  if (!response.ok) fail(`LIVE image reference update failed for ${image.asset_key} (${response.status}).`);
  const changed = await response.json();
  if (!Array.isArray(changed) || changed.length !== 1) {
    fail(`LIVE image reference changed concurrently for ${image.asset_key}; no deployment may proceed.`);
  }
  const confirmed = await readRegistry(base, key, image.asset_key, fetchImpl);
  if (confirmed?.asset_path !== image.webp_path || confirmed?.app_sha256 !== image.webp_sha256) {
    fail(`LIVE image reference readback failed for ${image.asset_key}.`);
  }
  return 'registered';
}

async function readHonorTarget(base, key, image, fetchImpl) {
  const table = image.target_kind === 'honor-definition' ? 'honor_definitions' : 'honor_relief_variants';
  const query = new URLSearchParams({
    id: `eq.${image.target_id}`,
    select: 'id,image_asset_id,image_revision' + (table === 'honor_relief_variants' ? ',material' : ''),
  });
  const response = await fetchImpl(`${base}/rest/v1/${table}?${query}`, {headers: authHeaders(key)});
  if (!response.ok) fail(`HERMES CORE target read failed for ${image.target_id} (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) fail(`HERMES CORE target is missing or ambiguous for ${image.target_id}.`);
  if (table === 'honor_relief_variants' && rows[0].material !== image.target_material) {
    fail(`HERMES CORE target material changed for ${image.target_id}.`);
  }
  return {table, row: rows[0]};
}

async function activateHonorTarget(base, key, image, fetchImpl) {
  const dev = await readHonorTarget(base.dev, key.dev, image, fetchImpl);
  if (dev.row.image_asset_id !== image.asset_key) {
    fail(`DEV HERMES CORE target does not point to ${image.asset_key}; LIVE reference was not changed.`);
  }
  const live = await readHonorTarget(base.live, key.live, image, fetchImpl);
  if (live.row.image_asset_id === image.asset_key) return 'already-current';
  const revision = Number(live.row.image_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) fail(`LIVE target revision is missing for ${image.target_id}.`);
  const query = new URLSearchParams({id: `eq.${image.target_id}`, image_revision: `eq.${revision}`});
  if (live.row.image_asset_id == null) query.set('image_asset_id', 'is.null');
  else query.set('image_asset_id', `eq.${live.row.image_asset_id}`);
  const response = await fetchImpl(`${base.live}/rest/v1/${live.table}?${query}`, {
    method: 'PATCH',
    headers: authHeaders(key.live, {'content-type': 'application/json', prefer: 'return=representation'}),
    body: JSON.stringify({image_asset_id: image.asset_key}),
  });
  if (!response.ok) fail(`LIVE HERMES CORE target update failed for ${image.target_id} (${response.status}).`);
  const changed = await response.json();
  if (!Array.isArray(changed) || changed.length !== 1) fail(`LIVE HERMES CORE target changed concurrently for ${image.target_id}.`);
  const confirmed = await readHonorTarget(base.live, key.live, image, fetchImpl);
  if (confirmed.row.image_asset_id !== image.asset_key) fail(`LIVE HERMES CORE target readback failed for ${image.target_id}.`);
  return 'registered';
}

export async function promoteCoreImageManifest({manifest, devUrl, liveUrl, devKey, liveKey, fetchImpl = fetch}) {
  validateManifest(manifest);
  if (!manifest.images.length) return {status: 'skipped', promoted: [], reason: 'no-image-changes'};
  for (const [name, value] of Object.entries({devUrl, liveUrl, devKey, liveKey})) {
    if (typeof value !== 'string' || !value) fail(`Missing ${name} for HERMES CORE image promotion.`);
  }

  const prepared = [];
  // Transfer and verify every immutable WebP before touching any LIVE registry reference.
  for (const image of manifest.images) {
    const devRow = await readRegistry(devUrl.replace(/\/$/, ''), devKey, image.asset_key, fetchImpl);
    if (!devRow || devRow.asset_path !== image.webp_path || devRow.app_sha256 !== image.webp_sha256 ||
        Number(devRow.app_bytes) !== image.webp_bytes || Number(devRow.width) !== image.width ||
        Number(devRow.height) !== image.height || devRow.alpha_preserved !== image.alpha) {
      fail(`DEV HERMES CORE registry does not match the approved image manifest for ${image.asset_key}.`);
    }
    const devBytes = await verifiedBytes(devUrl.replace(/\/$/, ''), devKey, image, fetchImpl);
    const existing = await verifiedBytes(liveUrl.replace(/\/$/, ''), liveKey, image, fetchImpl, {allowMissing: true});
    if (!existing) {
      const upload = await fetchImpl(objectUrl(liveUrl.replace(/\/$/, ''), image.webp_path), {
        method: 'POST',
        headers: authHeaders(liveKey, {'content-type': 'image/webp', 'x-upsert': 'false'}),
        body: devBytes,
      });
      if (!upload.ok) {
        const error = await upload.clone().json().catch(() => ({}));
        const duplicate = [409, 400].includes(upload.status) &&
          (error.code === 'ResourceAlreadyExists' || /already exists|asset already exists/i.test(String(error.message || error.error || '')));
        if (!duplicate) fail(`LIVE WebP upload failed for ${image.asset_key} (${upload.status}).`);
      }
      await verifiedBytes(liveUrl.replace(/\/$/, ''), liveKey, image, fetchImpl);
    }
    const publicResponse = await fetchImpl(`${liveUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${image.webp_path.split('/').map(encodeURIComponent).join('/')}`, {cache: 'no-store'});
    if (!publicResponse.ok || publicResponse.headers.get('content-type')?.split(';')[0] !== 'image/webp' ||
        sha256(Buffer.from(await publicResponse.arrayBuffer())) !== image.webp_sha256) {
      fail(`LIVE public WebP readback failed for ${image.asset_key}.`);
    }
    prepared.push({...image, label: devRow.label});
  }

  const promoted = [];
  for (const image of prepared) {
    const reference = await registerLiveAsset(liveUrl.replace(/\/$/, ''), liveKey, image, fetchImpl);
    promoted.push({asset_key: image.asset_key, path: image.webp_path, sha256: image.webp_sha256, reference});
  }
  const devBase = devUrl.replace(/\/$/, '');
  const liveBase = liveUrl.replace(/\/$/, '');
  for (const image of prepared.filter(item => (item.target_kind || 'system') !== 'system')) {
    const targetReference = await activateHonorTarget({dev: devBase, live: liveBase}, {dev: devKey, live: liveKey}, image, fetchImpl);
    promoted.find(item => item.asset_key === image.asset_key).target_reference = targetReference;
  }
  return {status: 'verified', issueNumber: manifest.issueNumber, itemId: manifest.itemId, promoted};
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) return console.log(JSON.stringify({status: 'skipped', reason: 'no-image-manifests'}));
  const required = ['SUPABASE_DEV_URL', 'SUPABASE_LIVE_URL', 'SUPABASE_DEV_SERVICE_ROLE_KEY', 'SUPABASE_LIVE_SERVICE_ROLE_KEY'];
  for (const name of required) if (!process.env[name]) fail(`Missing ${name}.`);
  const results = [];
  for (const file of files) {
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    results.push(await promoteCoreImageManifest({
      manifest,
      devUrl: process.env.SUPABASE_DEV_URL,
      liveUrl: process.env.SUPABASE_LIVE_URL,
      devKey: process.env.SUPABASE_DEV_SERVICE_ROLE_KEY,
      liveKey: process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
    }));
  }
  console.log(JSON.stringify({status: 'verified', results}, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(`OLYMPIA image promotion failed: ${error.message}`); process.exitCode = 1; });
}
