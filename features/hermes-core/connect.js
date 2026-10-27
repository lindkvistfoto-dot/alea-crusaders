import {createHermesCore} from './core.js';
import {createDriveOriginalArchive} from './drive.js';
import {convertCoreImageToWebP} from './webp.js';
import {createWebPPublisher} from './publish.js';
import {createCoreStorageTransport} from './storage-transport.js';
import {createCoreSystemReservation} from './system-reservation.js';
import {createSystemImageRpcAdapter} from './system-rpc.js';
import {createSystemImageCreator} from './system-create.js';
import {createCoreSystemTarget} from './create-target.js';

// Single integration entrypoint. Callers supply their existing Drive and
// Supabase connections; CORE archives originals in Drive and has no ALEA
// private-storage fallback or shared ALEA archive job.
export function connectHermesCore({supabase,driveUpload,driveGet,targets={}}) {
 if(typeof driveUpload!=='function'||typeof driveGet!=='function'||typeof supabase?.rpc!=='function')
  throw new TypeError('Authenticated Drive and Supabase adapters required');
 const storage=createCoreStorageTransport({supabase});
 const archiveOriginal=createDriveOriginalArchive({uploadFile:driveUpload,getFile:driveGet});
 const rpc=async(name,args)=>{
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
 };
 const system=createSystemImageRpcAdapter({rpc});
 const createSystemImage=createSystemImageCreator({rpc});
 const createTarget=createCoreSystemTarget({createSystemImage});
 const publishWebP=createWebPPublisher({
  reserveAsset:async args=>args.target?.kind==='system'
   ? createCoreSystemReservation()(args)
   : await targets.reserveAsset?.(args),...storage
 });
 return createHermesCore({
  archiveOriginal,
  convertToWebP:convertCoreImageToWebP,publishWebP,
  getTarget:async target=>{
   if(target?.kind==='system') return system.readSystem(target.id);
   if(typeof targets.read!=='function') throw new Error('Target adapter not configured');
   return targets.read(target);
  },
  setTarget:async({target,...rest})=>{
   if(target?.kind==='system') return system.writeSystem({id:target.id,...rest});
   if(typeof targets.write!=='function') throw new Error('Target adapter not configured');
   return targets.write({target,...rest});
  },
  createTarget:async args=>args.target?.kind==='system'
   ? createTarget(args)
   : typeof targets.create==='function'
    ? targets.create(args)
    : Promise.reject(new Error('Target CREATE adapter not configured'))
 });
}
