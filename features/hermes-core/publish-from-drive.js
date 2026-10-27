import {convertCoreImageToWebP} from './webp.js';
import {createWebPPublisher} from './publish.js';
import {createCoreStorageTransport} from './storage-transport.js';
import {createCoreSystemReservation} from './system-reservation.js';
import {createSystemImageRpcAdapter} from './system-rpc.js';
import {createSystemImageCreator} from './system-create.js';

// Publish an original already archived in Drive. No duplicate archive upload.
// A trusted caller supplies its existing authenticated Drive download and
// Supabase client. Activation happens only after verified Storage publication.
export function createArchivedSystemPublisher({supabase,downloadOriginal,convertToWebP=convertCoreImageToWebP}) {
 if(typeof downloadOriginal!=='function'||typeof convertToWebP!=='function'||typeof supabase?.rpc!=='function')
  throw new TypeError('Authenticated Drive download and Supabase RPC required');
 const storage=createCoreStorageTransport({supabase});
 const publishWebP=createWebPPublisher({
  reserveAsset:createCoreSystemReservation(),...storage
 });
 const rpc=async(name,args)=>{
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
 };
 const system=createSystemImageRpcAdapter({rpc});
 const createSystem=createSystemImageCreator({rpc});
 return async function publishArchivedSystem({driveFileId,assetKey,label}) {
  if(typeof driveFileId!=='string'||!driveFileId.trim()||
     !/^[a-z0-9][a-z0-9_-]*$/.test(assetKey||'')||
     typeof label!=='string'||!label.trim())
   throw new Error('Drive file, asset key and label required');
  const original=await downloadOriginal(driveFileId);
  if(!original?.size||!['image/png','image/jpeg','image/webp'].includes(original.type))
   throw new Error('Drive original unavailable');
  // A verified WebP original can be published unchanged; no lossy recompression.
  const webp=original.type==='image/webp'?original:await convertToWebP(original);
  const target={kind:'system',id:assetKey,label};
  const current=await system.readSystem(assetKey);
  const published=await publishWebP({target,webp,archive:{status:'archived',id:driveFileId}});
  if(!published?.verified||!published?.metadata) throw new Error('Publication not verified');
  const activation=current
   ? await system.writeSystem({id:assetKey,expectedRevision:current.revision,
       expectedKey:current.key??null,key:published.key,metadata:published.metadata})
   : await createSystem({id:assetKey,label,path:published.key,metadata:published.metadata});
  return {activation,archive:{status:'archived',id:driveFileId},key:published.key};
 };
}
