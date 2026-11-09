import {createHermesAleaClient} from './client.js';

const assetKeyPattern=/^hermes-alea:[a-f0-9-]{36}$/i;
const assetPathPattern=/^trophy\/[a-f0-9-]{36}\.webp$/i;
const signedPathPattern=/^\/object\/sign\/hermes-alea-display\/trophy\/[a-f0-9-]{36}\.webp\?token=[A-Za-z0-9_.-]+$/;
let client=null,assets=new Map(),expiresAt=0,inFlight=null;

function origin(){
 return String(globalThis.ALEA_SUPABASE_CONFIG?.url||'https://wbmosmkirsitkonejzpg.supabase.co').replace(/\/$/,'');
}
function prime(rows=[]){
 const next=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!assetKeyPattern.test(String(row?.asset_key||''))||
     !assetPathPattern.test(String(row?.asset_path||''))||
     row?.publication_status&&row.publication_status!=='published'||
     !signedPathPattern.test(String(row?.hermes_alea_signed_path||'')))continue;
  next.set(String(row.asset_key),row);
 }
 assets=next;
 expiresAt=Date.now()+45*60*1000;
 return assets;
}
function getClient(){
 if(client)return client;
 if(typeof window.dbJson!=='function'||typeof window.authFetch!=='function')
  throw new Error('HERMES ALEA:s gemensamma bildtjänst är ännu inte tillgänglig.');
 client=createHermesAleaClient({
  targetPolicies:{},
  environment:window.ALEA_SUPABASE_CONFIG?.name==='live'?'LIVE':'DEV',
  rpc:(name,args)=>window.dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)}),
  request:(path,options={})=>window.authFetch(path,{...options,headers:{Authorization:'Bearer session',...(options.headers||{})}})
 });
 return client;
}
async function load(force=false){
 if(!force&&Date.now()<expiresAt)return assets;
 if(inFlight)return inFlight;
 inFlight=getClient().loadAssets(window.dbJson).then(rows=>prime(rows)).finally(()=>{inFlight=null});
 return inFlight;
}
function url(key){
 const row=assets.get(String(key||''));
 const path=row?.hermes_alea_signed_path;
 if(!row||!signedPathPattern.test(String(path||'')))return '';
 return origin()+'/storage/v1'+path;
}
function reference(record){
 const key=String(record?.image_asset_id||'');
 if(key.startsWith('hermes-alea:'))return key;
 return record?.image_path||null;
}

const resolver=Object.freeze({load,prime,url,reference});
globalThis.aleaHermesAssetResolver=resolver;
export {load,prime,url,reference};
export default resolver;
