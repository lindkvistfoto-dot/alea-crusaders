/** ARCANE HONORS image resolver. Only published HERMES asset records may supply URLs.
 * An image_asset_id is a stable reference, NEVER a URL or guessed storage path.
 * No browser credentials, private buckets, or fallback to Drive originals.
 */
const PUBLIC_BASE='https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/alea-hermes-public/';
export function verifiedHonorImageUrl(record){
 if(!record || record.publication_status!=='published')return null;
 const url=record.public_url||record.optimized_public_url;
 if(typeof url!=='string')return null;
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!parsed.href.startsWith(PUBLIC_BASE)||parsed.username||parsed.password||parsed.search||parsed.hash)return null;
  if(!/\\.(webp|avif|png)$/i.test(parsed.pathname))return null;
  return parsed.href;
 }catch{return null}
}
export function createHonorImageResolver(assets=[]){
 const map=new Map((Array.isArray(assets)?assets:[]).filter(a=>a?.asset_key).map(a=>[String(a.asset_key),a]));
 return definition=>verifiedHonorImageUrl(map.get(String(definition?.image_asset_id||'')));
}
