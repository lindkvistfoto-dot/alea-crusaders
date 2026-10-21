/* Optional, injected image loader for future Manager previews. No automatic network access. */
(function(api){
 'use strict';
 function safeDeliveryUrl(value){
  // Resolved by the caller using existing authenticated Storage helpers. Never accept script/data URLs.
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}
  catch{return null}
 }
 function createDeliverySession({flags=api.DEFAULT_FLAGS,loadAsset,onChange=()=>{}}={}){
  let generation=0;
  const publish=result=>{onChange(result);return result};
  return {
   clear(){generation++;return publish(api.enabled(flags)?{kind:'marker',tier:5,reason:'session-cleared'}:{kind:'disabled',reason:'feature-disabled'})},
   async select(request={}){
    const token=++generation;
    if(!api.enabled(flags))return publish(api.resolveBattleArt(request,flags));
    // Remove old equipment art synchronously, before signing/decoding any new image.
    publish({kind:'marker',tier:5,reason:'image-pending',key:api.requestKey(request)});
    const unavailable=new Set(api.list(request?.unavailableAssetIds));
    for(;;){
     const result=api.resolveBattleArt({...request,unavailableAssetIds:[...unavailable]},flags);
     if(token!==generation)return {kind:'stale',reason:'request-replaced'};
     if(['marker','disabled'].includes(result.kind))return publish(result);
     const refs=[result.asset,result.stand,result.base].filter(Boolean),urls={};
     let failed=false;
     for(const ref of refs){
      try{
       // loadAsset must obtain authorization, sign if private, fetch AND decode before resolving.
       const url=typeof loadAsset==='function'?safeDeliveryUrl(await loadAsset(ref)):null;
       if(!url)throw Error('image-unavailable');
       urls[ref.id]=url;
      }catch{unavailable.add(ref.id);failed=true;break}
      if(token!==generation)return {kind:'stale',reason:'request-replaced'};
     }
     if(token!==generation)return {kind:'stale',reason:'request-replaced'};
     if(!failed)return publish({...result,urls});
    }
   }
  };
 }
 Object.assign(api,{safeDeliveryUrl,createDeliverySession});
})(globalThis.AleaBattleArt);
