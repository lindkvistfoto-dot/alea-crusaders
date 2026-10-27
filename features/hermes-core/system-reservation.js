// System asset reservation uses existing ALEA public path layout.
export function createCoreSystemReservation() {
 return async function reserveAsset({target,metadata}) {
  if(target?.kind!=='system'||!/^[a-z0-9][a-z0-9_-]*$/.test(target.id||''))
   throw new Error('System image target required');
  if(!/^[a-f0-9]{64}$/.test(metadata?.sha256||''))
   throw new Error('Verified WebP digest required');
  const path='hermes/system-asset/'+target.id+'/'+metadata.sha256+'.webp';
  return {key:path,path,metadata};
 };
}
