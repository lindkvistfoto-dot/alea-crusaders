import {createHermesAleaClient} from '../hermes-alea/client.js?v=weapon-list-hermes-v1';

const client=createHermesAleaClient({
  targetPolicies:{weapon:{maxWidth:900,maxHeight:900,maxPixels:810_000,maxOutputBytes:3_145_728,requireAlpha:false}},
  environment:window.ALEA_SUPABASE_CONFIG?.name==='live'?'LIVE':'DEV',
  rpc:(name,args)=>window.dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)}),
  request:(path,options={})=>window.authFetch(path,{...options,headers:{Authorization:'Bearer session',...(options.headers||{})}})
});

async function upload({target,file,onStatus}){
  const result=await client.upload({targetKind:'weapon',target,file,onStatus});
  // Refresh the shared read model after activation. A signing/list refresh failure
  // must not turn a successful HERMES ALEA publication into a reported failure.
  try{await window.aleaHermesAssetResolver?.load(true)}catch(error){console.warn('HERMES ALEA-bilden är aktiverad; den gemensamma bildvyn uppdateras vid nästa laddning.',error)}
  return result;
}

window.aleaHermesAleaWeapons={upload};
