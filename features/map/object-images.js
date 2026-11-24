import hermesAlea from '../hermes-alea/asset-resolver.js';

const privatePath = /^map-objects\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/i;

async function privateUrl(path) {
  const response = await window.authFetch('/storage/v1/object/sign/campaign-materials/' + path, {
    method: 'POST', headers: {Authorization: 'Bearer session'}, body: JSON.stringify({expiresIn: 3600}),
  });
  if (!response.ok) return '';
  const result = await response.json();
  const signed = result.signedURL || result.signedUrl;
  const expected = '/object/sign/campaign-materials/' + path + '?token=';
  return typeof signed === 'string' && signed.startsWith(expected) ? SUPABASE_URL + '/storage/v1' + signed : '';
}

export async function objectImageUrls(definitions) {
  const keys = [...new Set(definitions.map(d => d.image_asset_key).filter(Boolean))];
  const system = keys.filter(k => /^arcane-[a-z0-9-]+$/.test(k));
  const managed = keys.filter(k => k.startsWith('hermes-alea:'));
  const [assets, privateEntries] = await Promise.all([
    system.length ? window.dbJson('arcane_system_assets?select=asset_key,asset_path,width,height&asset_key=in.(' + system.join(',') + ')') : [],
    Promise.all(keys.filter(k => privatePath.test(k)).map(async k => [k, await privateUrl(k)])),
    managed.length ? hermesAlea.load() : null,
  ]);
  if (managed.some(k => !hermesAlea.url(k))) await hermesAlea.load(true);
  const urls = new Map(privateEntries);
  for (const a of assets) {
    if (/^hermes\/system-asset\/[\w.-]+\/[a-f0-9]{64}\.webp$/.test(a.asset_path))
      urls.set(a.asset_key, SUPABASE_URL + '/storage/v1/object/public/alea-hermes-public/' + a.asset_path);
  }
  for (const key of managed) urls.set(key, hermesAlea.url(key));
  return urls;
}
