/** Read-only, bounded SKYLLA verifier. No SDK, external decoder, signing or write API. */
export const PROJECT = 'wbmosmkirsitkonejzpg';
export const BUCKET = 'alea-hermes-source';
const BASE = `https://${PROJECT}.supabase.co`;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 2048 * 2048;
const hex = b => [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, '0')).join('');
export const sha256 = async b => hex(await crypto.subtle.digest('SHA-256', b));
const fail = code => { throw new Error(code); };
const u32 = (b, p) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p);
const crcTable = Array.from({length: 256}, (_, n) => {
  for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(b) {
  let crc = 0xffffffff;
  for (const v of b) crc = crcTable[(crc ^ v) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bound every streamed byte, cancel on failure, and reject redirects at fetch. */
export async function boundedBody(response, limit) {
  if (!response.ok || !response.body) fail('READ_FAILED');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body.cancel(); fail('SIZE_LIMIT');
  }
  const reader = response.body.getReader(), parts = [];
  let size = 0, complete = false, timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 20000);
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) fail('SIZE_LIMIT');
      parts.push(value);
    }
    if (timedOut || (length !== null && size !== Number(length))) fail('INTERRUPTED_READ');
    complete = true;
  } finally {
    clearTimeout(timeout);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Full decode for the allowlisted 8-bit, noninterlaced RGB/RGBA originals.
 * Other PNG modes are blocked, never approximated or labelled verified.
 * Check every chunk CRC, inflate the entire zlib stream (including checksum),
 * reconstruct every pixel scanline, and hash reconstructed pixels for audit.
 */
export async function decodePNG(b) {
  if (b.length < 45 || b.length > MAX_BYTES ||
      ![137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)) fail('INVALID_PNG');
  let pos = 8, width, height, channels, seenIDAT = false, endedIDAT = false, end = false;
  const chunks = [];
  while (pos < b.length) {
    if (pos + 12 > b.length) fail('TRUNCATED_CHUNK');
    const n = u32(b,pos), stop = pos + n + 12;
    if (stop > b.length) fail('TRUNCATED_CHUNK');
    const type = String.fromCharCode(...b.subarray(pos+4,pos+8));
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase() ||
        crc32(b.subarray(pos+4,stop-4)) !== u32(b,stop-4)) fail('CHUNK_CRC_OR_TYPE');
    if (pos === 8 && type !== 'IHDR') fail('IHDR_REQUIRED');
    if (type === 'IHDR') {
      if (pos !== 8 || n !== 13) fail('INVALID_IHDR');
      width = u32(b,pos+8); height = u32(b,pos+12);
      channels = b[pos+17] === 2 ? 3 : b[pos+17] === 6 ? 4 : 0;
      if (!width || !height || width > 4096 || height > 4096 || width*height > MAX_PIXELS ||
          b[pos+16] !== 8 || !channels || b[pos+18] || b[pos+19] || b[pos+20]) fail('UNSUPPORTED_PNG_MODE');
    } else if (type === 'IDAT') {
      if (endedIDAT) fail('NONCONTIGUOUS_IDAT');
      seenIDAT = true; chunks.push(b.subarray(pos+8,stop-4));
    } else {
      if (seenIDAT) endedIDAT = true;
      if (type === 'IEND') {
        if (n !== 0 || !seenIDAT || stop !== b.length) fail('INVALID_IEND');
        end = true;
      } else if (type === 'PLTE') {
        if (seenIDAT || !n || n > 768 || n % 3) fail('INVALID_PLTE');
      } else if (type === 'tRNS' || type === 'acTL' || type === 'fcTL' || type === 'fdAT' || type[0] === type[0].toUpperCase()) {
        fail('UNSUPPORTED_CRITICAL_OR_ANIMATED_PNG');
      }
    }
    pos = stop;
  }
  if (!end || !width) fail('INCOMPLETE_PNG');
  const rowBytes = width * channels, expected = (rowBytes + 1) * height;
  const compressed = new Blob(chunks).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = await boundedBody(new Response(compressed), expected);
  if (raw.length !== expected) fail('INVALID_SCANLINE_LENGTH');
  const pixels = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1), filter = raw[start];
    if (filter > 4) fail('INVALID_SCANLINE_FILTER');
    for (let x = 0; x < rowBytes; x++) {
      const at = y * rowBytes + x;
      const a = x >= channels ? pixels[at-channels] : 0;
      const c = y && x >= channels ? pixels[at-rowBytes-channels] : 0;
      const up = y ? pixels[at-rowBytes] : 0;
      let predict = 0;
      if (filter === 1) predict = a;
      if (filter === 2) predict = up;
      if (filter === 3) predict = Math.floor((a+up)/2);
      if (filter === 4) {
        const p = a+up-c, pa = Math.abs(p-a), pb = Math.abs(p-up), pc = Math.abs(p-c);
        predict = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      pixels[at] = (raw[start+1+x]+predict) & 255;
    }
  }
  return {format:'PNG', width, height, color_mode:channels === 4 ? 'RGBA' : 'RGB',
    pixel_sha256:await sha256(pixels), complete_decode:true};
}

function validEntry(e) {
  return e.bucket === BUCKET && /^[a-f0-9]{64}$/.test(e.id) &&
    /^[a-f0-9]{64}$/.test(e.sha256) && Number.isInteger(e.size_bytes) &&
    e.size_bytes > 0 && e.size_bytes <= MAX_BYTES &&
    /^(spell(?:-cutout|-illustration(?:-wide)?)?|skill(?:-illustration(?:-wide)?)?)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{64}\.png$/.test(e.object_path) &&
    e.object_path.endsWith('/'+e.sha256+'.png') &&
    /^[A-Za-z0-9_-]{10,}$/.test(e.permanent_drive_file_id) &&
    e.drive_sha256 === e.sha256 && e.drive_complete_decode === true;
}

export function createHandler({plan, env, fetcher = fetch, now = Date.now}) {
  const reply = (value, status = 200, origin = '') => new Response(JSON.stringify(value), {
    status, headers:{'content-type':'application/json','cache-control':'no-store',
      'x-content-type-options':'nosniff',...(origin ? {'access-control-allow-origin':origin,
        'vary':'Origin','access-control-allow-methods':'POST, OPTIONS',
        'access-control-allow-headers':'authorization, apikey, content-type'} : {})}});
  return async req => {
    const origin = req.headers.get('origin') || '';
    if (origin && origin !== env('SKYLLA_OPERATOR_ORIGIN')) return reply({error:'ORIGIN_DENIED'},403);
    const until = Date.parse(env('SKYLLA_ENABLED_UNTIL') || ''), start = Date.parse(env('SKYLLA_ENABLED_FROM') || '');
    if (env('SKYLLA_ENABLED') !== 'true' || !Number.isFinite(start) || !Number.isFinite(until) ||
        until-start > 3600000 || start > now() || until <= now() || until <= start) {
      return reply({error:'VERIFIER_DISABLED_OR_EXPIRED'},503,origin);
    }
    if (req.method === 'OPTIONS') return reply({},200,origin);
    if (req.method !== 'POST') return reply({error:'POST_REQUIRED'},405,origin);
    const auth = req.headers.get('authorization') || '';
    const operator = env('SKYLLA_OPERATOR_ID') || '';
    if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(auth) ||
        !/^[a-f0-9-]{36}$/.test(operator)) return reply({error:'AUTH_REQUIRED'},401,origin);
    // No JWT payload is trusted locally. Auth verifies the token; profiles uses
    // that user's own RLS context, never service-role for authorization.
    const get = (path, authorization, apikey) => fetcher(BASE+path, {method:'GET',
      redirect:'error', signal:AbortSignal.timeout(20000), headers:{authorization,apikey}});
    let entry;
    try {
      const anon = env('SUPABASE_ANON_KEY');
      if (!anon || !env('SUPABASE_SERVICE_ROLE_KEY')) return reply({error:'SERVER_CONFIGURATION_REQUIRED'},503,origin);
      const user = JSON.parse(new TextDecoder().decode(await boundedBody(await get('/auth/v1/user',auth,anon),65536)));
      if (user.id !== operator) return reply({error:'OPERATOR_DENIED'},403,origin);
      const profiles = JSON.parse(new TextDecoder().decode(await boundedBody(await get(
        '/rest/v1/profiles?select=id,is_admin&id=eq.'+operator,auth,anon),65536)));
      if (profiles.length !== 1 || profiles[0].id !== operator || profiles[0].is_admin !== true) {
        return reply({error:'ADMIN_REQUIRED'},403,origin);
      }
      if (!(req.headers.get('content-type') || '').startsWith('application/json')) return reply({error:'JSON_REQUIRED'},400,origin);
      const body = JSON.parse(new TextDecoder().decode(await boundedBody(new Response(req.body),512)));
      if (Object.keys(body).sort().join(',') !== 'id,plan_sha256' || body.plan_sha256 !== plan.plan_sha256) {
        return reply({error:'FIXED_PLAN_REQUIRED'},400,origin);
      }
      if (plan.schema !== 'skylla-server-allowlist/v1' || plan.project_id !== PROJECT ||
          await sha256(new TextEncoder().encode(JSON.stringify(plan.entries))) !== plan.plan_sha256 ||
          !plan.entries.every(validEntry) || new Set(plan.entries.map(e=>e.id)).size !== plan.entries.length) {
        return reply({error:'INVALID_SERVER_PLAN'},503,origin);
      }
      entry = plan.entries.find(e=>e.id === body.id);
      if (!entry) return reply({error:'OBJECT_NOT_ALLOWLISTED'},403,origin);
      if (now() >= until) return reply({error:'VERIFIER_EXPIRED'},503,origin);
      // Fixed project, bucket and bundled path: caller cannot choose a URL,
      // bucket, checksum, size, write action or signing operation.
      const service = env('SUPABASE_SERVICE_ROLE_KEY');
      const response = await get('/storage/v1/object/authenticated/'+BUCKET+'/'+entry.object_path,
        'Bearer '+service,service);
      const bytes = await boundedBody(response,entry.size_bytes);
      if (bytes.length !== entry.size_bytes) fail('SOURCE_SIZE_MISMATCH');
      const actual = await sha256(bytes);
      if (actual !== entry.sha256) fail('SOURCE_SHA256_MISMATCH');
      const image = await decodePNG(bytes);
      if (now() >= until) return reply({error:'VERIFIER_EXPIRED'},503,origin);
      const wide = entry.object_path.split('/')[0].endsWith('-wide');
      const ratio = image.width/image.height;
      if ((!wide && image.width !== image.height) || (wide &&
          (entry.object_path.startsWith('skill') ? Math.abs(ratio-16/9)/(16/9)>0.003 : ratio<1.25 || ratio>2.4))) fail('CATEGORY_SHAPE_MISMATCH');
      return reply({schema:'skylla-server-verification/v1',plan_sha256:plan.plan_sha256,
        id:entry.id,project_id:PROJECT,system:'supabase',bucket:BUCKET,object_path:entry.object_path,
        sha256:actual,size_bytes:bytes.length,...image,status:'verified_complete',
        permanent_drive_file_id:entry.permanent_drive_file_id,drive_sha256:entry.drive_sha256,
        verified_at:new Date(now()).toISOString(),safe_to_delete:false,
        deletion_authorized:false},200,origin);
    } catch {
      // Never reflect fetch errors, request headers, response bodies or secrets.
      return reply({error:'VERIFICATION_FAILED',id:entry?.id || null,safe_to_delete:false},422,origin);
    }
  };
}
