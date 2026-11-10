import {createHermesAleaClient} from '../hermes-alea/client.js?v=weapon-list-hermes-v1';

const client=createHermesAleaClient({
  targetPolicies:{weapon:{maxOutputBytes:3_145_728,requireAlpha:false},
    ...Object.fromEntries(['head','arms','torso','legs'].map(zone=>['armor_'+zone,{}]))},
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

// Armor uses the same client and lifecycle; only the destination slot differs.
async function saveArmor({id,record={},pieces,onStatus=()=>{}}){
  try{
    for(const piece of pieces){
      if(!piece.file&&!piece.removed)continue;
      const prefix='image_'+piece.zone;
      const target={id,image_asset_id:record[prefix+'_asset_id']||null,image_revision:record[prefix+'_revision']||0};
      const args={targetKind:'armor_'+piece.zone,target};
      const result=piece.removed?await client.remove(args):await client.upload({...args,file:piece.file,onStatus:stage=>onStatus(piece.zone,stage)});
      // Keep completed slots current if a later slot fails and the editor retries.
      record[prefix+'_asset_id']=piece.removed?null:'hermes-alea:'+result.id;
      record[prefix+'_revision']=result.result_revision;
      piece.completed?.();
      onStatus(piece.zone,'completed');
    }
  }finally{
    try{await window.aleaHermesAssetResolver?.load(true)}catch(error){console.warn('HERMES ALEA-bildvyn kunde inte uppdateras.',error)}
  }
}
window.aleaHermesAleaArmors={save:saveArmor};
