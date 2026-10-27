import {createArchivedSystemPublisher} from './publish-from-drive.js';

// Direct publication from an original already archived in Drive.
// The image Blob comes from the caller's existing upload, so no second Drive
// download or background job is necessary. Supabase uses the caller's session.
export function createCoreDirectPublisher({supabase,convertToWebP}) {
 if(typeof supabase?.rpc!=='function'||!supabase?.storage?.from)
  throw new TypeError('Authenticated Supabase client required');
 return async function publish({original,driveFileId,assetKey,label}) {
  if(!original?.size||!['image/png','image/jpeg','image/webp'].includes(original.type))
   throw new Error('Original image Blob required');
  if(typeof driveFileId!=='string'||!driveFileId.trim())
   throw new Error('Verified Drive archive ID required');
  const publishArchived=createArchivedSystemPublisher({
   supabase,downloadOriginal:async()=>original,
   ...(convertToWebP?{convertToWebP}:{})
  });
  return publishArchived({driveFileId,assetKey,label});
 };
}
