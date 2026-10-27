// Minimal Drive original archive adapter. Caller supplies a binary-capable upload
// function and a metadata lookup. Neither accepts Base64 or image bytes in JSON.
export function createDriveOriginalArchive({uploadFile, getFile}) {
  if (typeof uploadFile !== 'function' || typeof getFile !== 'function')
    throw new TypeError('Drive uploadFile and getFile adapters required');
  return async function archiveOriginal(file) {
    if (!file || !file.size) throw new Error('Original file missing');
    const uploaded = await uploadFile(file);
    if (!uploaded?.id) throw new Error('Drive upload failed');
    const metadata = await getFile(uploaded.id);
    if (metadata?.id !== uploaded.id || Number(metadata?.size) !== file.size ||
        metadata?.trashed === true) throw new Error('Drive archive verification failed');
    return {id:uploaded.id, verified:true};
  };
}
