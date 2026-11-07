import {createHermesAleaClient} from '../hermes-alea/client.js?v=weapon-list-hermes-v1';

const client=createHermesAleaClient({
  targetPolicies:{weapon:{maxWidth:900,maxHeight:900,maxPixels:810_000,maxOutputBytes:3_145_728,requireAlpha:false}},
  environment:window.ALEA_SUPABASE_CONFIG?.name==='live'?'LIVE':'DEV',
  rpc:(name,args)=>window.dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)}),
  request:(path,options={})=>window.authFetch(path,{...options,headers:{Authorization:'Bearer session',...(options.headers||{})}})
});

async function upload({target,file,onStatus}){
  const result=await client.upload({targetKind:'weapon',target,file,onStatus});
  if(!result.displayBlob)throw Error('HERMES ALEA aktiverade bilden, men förhandsvisningen behöver laddas om innan den kan speglas till vapenregistret.');

  // Vapen används även av rollpersoner och stridsvyer som läser den publika
  // alea-equipment-art-sökvägen. Keep that established path contract while
  // HERMES ALEA owns conversion, verification, activation and source archive.
  const path='weapon/'+target.id+'/'+crypto.randomUUID()+'.webp';
  const response=await window.authFetch('/storage/v1/object/alea-equipment-art/'+path,{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:result.displayBlob
  });
  if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw Error(data?.message||data?.error||'HERMES-bilden aktiverades, men den publika vapenbilden kunde inte uppdateras ('+response.status+').');
  }
  return {...result,compatibilityPath:path};
}

window.aleaHermesAleaWeapons={upload};
