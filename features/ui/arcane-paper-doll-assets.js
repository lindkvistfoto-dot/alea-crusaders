/* Read-only Supabase adapter for the Workshop/BENGALI systemArt contract.
   No automatic fetch, publication, campaign data, or layout calibration. */
(function(root){
 'use strict';
 const BUCKET='alea-hermes-public';
 const COLUMNS='id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved';
 function toWorkshop(rows,baseUrl){
  const origin=new URL(baseUrl);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
   throw new Error('INVALID_SYSTEM_ASSET_ORIGIN');
  if(!Array.isArray(rows))throw new Error('INVALID_SYSTEM_ASSET_ROWS');
  const assets=[],systemArt={},seen=new Set(),seenIds=new Set();
  for(const row of rows){
   if(!row||typeof row.asset_key!=='string'||(!/^arcane-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.asset_key)&&row.asset_key!=='arcane-trophy-room-v2.2'))continue;
   const key=row.asset_key;
   if(seen.has(key)||seenIds.has(row.id))throw new Error('DUPLICATE_SYSTEM_ASSET');
   seen.add(key);seenIds.add(row.id);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id||'')||!Number.isInteger(row.width)||!Number.isInteger(row.height)||row.width<1||row.height<1||row.width>4096||row.height>4096||row.alpha_preserved!==(key!=='arcane-trophy-room-v2.2')||
    !/^[a-f0-9]{64}$/.test(row.app_sha256||'')||!Number.isSafeInteger(row.app_bytes)||row.app_bytes<1||row.app_bytes>500000||
    row.asset_path!=='hermes/system-asset/'+key+'/'+row.app_sha256+'.webp')continue;
   assets.push(Object.freeze({id:row.id,status:'active',verified:true,bucket:BUCKET,path:row.asset_path,
    app_sha256:row.app_sha256,app_bytes:row.app_bytes,width:row.width,height:row.height,
    alpha_preserved:row.alpha_preserved,layouts:Object.freeze([]),
    src:origin.origin+'/storage/v1/object/public/'+BUCKET+'/'+row.asset_path}));
   systemArt[key]=row.id;
  }
  return Object.freeze({assets:Object.freeze(assets),systemArt:Object.freeze(systemArt)});
 }
 async function load({dbJson,baseUrl}){
  if(typeof dbJson!=='function')throw new Error('SYSTEM_ASSET_READER_REQUIRED');
  const rows=await dbJson('arcane_system_assets?select='+COLUMNS+'&order=asset_key.asc');
  return toWorkshop(rows,baseUrl);
 }
 root.aleaArcanePaperDollAssets=Object.freeze({toWorkshop,load});
})(globalThis);
