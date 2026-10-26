/**
 * Resolve only HERMES-published public assets. The stable image_asset_id stored
 * on an honor definition matches arcane_system_assets.asset_key.
 * Private Drive originals and guessed paths are never used as image fallbacks.
 */
const PUBLIC_BASE='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/';

export function verifiedHonorImageUrl(record){
  if(!record) return null;
  if(record.publication_status && record.publication_status!=='published') return null;
  if(typeof record.asset_key==='string' && record.asset_key.startsWith('hermes-alea:')){
    const path=record.hermes_alea_signed_path;
    if(typeof path!=='string'||!/^\/object\/sign\/hermes-alea-display\/trophy\/[a-f0-9-]{36}\.webp\?token=[A-Za-z0-9_.-]+$/.test(path))return null;
    return 'https://wbmosmkirsitkonejzpg.supabase.co/storage/v1'+path;
  }

  let value=record.public_url||record.optimized_public_url;
  if(!value && typeof record.asset_path==='string'){
    const path=record.asset_path.replace(/^\/+/, '');
    if(!path.startsWith('hermes/')) return null;
    value=PUBLIC_BASE+path.split('/').map(encodeURIComponent).join('/');
  }
  if(typeof value!=='string') return null;

  try{
    const parsed=new URL(value);
    if(parsed.protocol!=='https:' || !parsed.href.startsWith(PUBLIC_BASE) ||
       parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if(!/\.(webp|avif|png)$/i.test(parsed.pathname)) return null;
    return parsed.href;
  }catch{
    return null;
  }
}

export function createHonorImageResolver(assets=[]){
  const map=new Map((Array.isArray(assets)?assets:[])
    .filter(asset=>asset?.asset_key)
    .map(asset=>[String(asset.asset_key),asset]));
  return definition=>verifiedHonorImageUrl(map.get(String(definition?.image_asset_id||'')));
}
