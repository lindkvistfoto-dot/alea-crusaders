/* Read-only Supabase adapter for the Workshop/BENGALI systemArt contract.
   No automatic fetch, publication, campaign data, or layout calibration. */
(function(root){
 'use strict';
 const DEFINITIONS=Object.freeze({
  'arcane-paper-doll-hexagon-base':Object.freeze({id:'2ab9aa61-4b89-4d7f-8905-19ce644d9121',width:1220,height:811}),
  'arcane-portrait-stand':Object.freeze({id:'8aa5641c-f0d2-4f80-bf25-ff616dc2cdce',width:1067,height:1280}),
  'arcane-portrait-stand-generic':Object.freeze({id:'d6ad2f3e-70a6-4c2a-89be-9b02b9fd27e8',width:853,height:1280})
 });
 const BUCKET='alea-hermes-public';
 const COLUMNS='id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved';
 function toWorkshop(rows,baseUrl){
  const origin=new URL(baseUrl);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
   throw new Error('INVALID_SYSTEM_ASSET_ORIGIN');
  if(!Array.isArray(rows))throw new Error('INVALID_SYSTEM_ASSET_ROWS');
  const assets=[],systemArt={},seen=new Set();
  for(const row of rows){
   if(!row||!(Object.hasOwn(DEFINITIONS,row.asset_key)||/^arcane-bronze-ivory-pointed-hex-(high|low)-angle$/.test(row.asset_key)))continue;
   const key=row.asset_key,def=DEFINITIONS[key];
   if(seen.has(key))throw new Error('DUPLICATE_SYSTEM_ASSET');
   seen.add(key);
   if((def&&(row.id!==def.id||row.width!==def.width||row.height!==def.height))||!Number.isInteger(row.width)||!Number.isInteger(row.height)||row.width<1||row.height<1||row.width>4096||row.height>4096||row.alpha_preserved!==true||
    !/^[a-f0-9]{64}$/.test(row.app_sha256||'')||!Number.isSafeInteger(row.app_bytes)||row.app_bytes<1||row.app_bytes>2000000||
    row.asset_path!=='hermes/system-asset/'+key+'/'+row.app_sha256+'.webp')continue;
   assets.push(Object.freeze({id:row.id,status:'active',verified:true,bucket:BUCKET,path:row.asset_path,
    app_sha256:row.app_sha256,app_bytes:row.app_bytes,width:row.width,height:row.height,
    alpha_preserved:true,layouts:Object.freeze([]),
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
 root.aleaArcanePaperDollAssets=Object.freeze({keys:Object.freeze(Object.keys(DEFINITIONS)),toWorkshop,load});
})(globalThis);
