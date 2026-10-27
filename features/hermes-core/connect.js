import {createHermesCore} from './core.js';
import {createDriveOriginalArchive} from './drive.js';
import {createOriginalRetention} from './retention.js';
import {convertCoreImageToWebP} from './webp.js';
import {createWebPPublisher} from './publish.js';
import {createCoreStorageTransport} from './storage-transport.js';
import {createCoreSystemReservation} from './system-reservation.js';
import {createSystemImageRpcAdapter} from './system-rpc.js';
import {createSystemImageCreator} from './system-create.js';
import {createCoreSystemTarget} from './create-target.js';

// Single integration entrypoint. Callers supply their existing authenticated
// Drive and Supabase connections; no new credentials, workers or WASM.
export function connectHermesCore({supabase,driveUpload,driveGet,queueArchiveRetry}) {
 if(typeof driveUpload!=='function'||typeof driveGet!=='function'||
    typeof queueArchiveRetry!=='function'||typeof supabase?.rpc!=='function')
  throw new TypeError('Authenticated Drive, Supabase and archive retry adapters required');
 const storage=createCoreStorageTransport({supabase});
 const archiveOriginal=createDriveOriginalArchive({uploadFile:driveUpload,getFile:driveGet});
 const retainOriginal=createOriginalRetention(storage);
 const rpc=async(name,args)=>{
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
 };
 const system=createSystemImageRpcAdapter({rpc});
 const createSystemImage=createSystemImageCreator({rpc});
 const createTarget=createCoreSystemTarget({createSystemImage});
 const publishWebP=createWebPPublisher({
  reserveAsset:createCoreSystemReservation(),...storage
 });
 return createHermesCore({
  archiveOriginal,retainOriginal,queueArchiveRetry,
  convertToWebP:convertCoreImageToWebP,publishWebP,
  getTarget:async target=>{
   if(target?.kind!=='system') throw new Error('Target adapter not yet connected');
   return system.readSystem(target.id);
  },
  setTarget:async({target,...rest})=>{
   if(target?.kind!=='system') throw new Error('Target adapter not yet connected');
   return system.writeSystem({id:target.id,...rest});
  },
  createTarget
 });
}
