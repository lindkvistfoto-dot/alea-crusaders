// HERMES CORE: isolated image lifecycle; no WASM and no HERMES 4 workflow.
// Drive is primary. Existing private Supabase storage is fallback for failed archives.
export function createHermesCore({archiveOriginal, retainOriginal, queueArchiveRetry, convertToWebP, publishWebP, getTarget, setTarget}) {
 for (const [name,fn] of Object.entries({archiveOriginal,retainOriginal,queueArchiveRetry,convertToWebP,publishWebP,getTarget,setTarget}))
  if (typeof fn !== 'function') throw new TypeError('Missing HERMES CORE adapter: '+name);
 async function put({target,file}) {
  if (!target || !file?.size) throw new Error('Image and target are required');
  let archive;
  try {
   const receipt=await archiveOriginal(file);
   if (!receipt?.id || receipt.verified!==true) throw new Error('Drive archive not verified');
   archive={status:'archived',id:receipt.id};
  } catch (error) {
   const retained=await retainOriginal(file);
   if (!retained?.id || retained.verified!==true) throw new Error('Original not secured in Drive or private storage');
   // Existing GitHub Actions archive process must recognize this fallback reference.
   await queueArchiveRetry({originalId:retained.id,target});
   archive={status:'pending',originalId:retained.id};
  }
  const webp=await convertToWebP(file);
  if (!webp || webp.type!=='image/webp' || !webp.size) throw new Error('Invalid WebP');
  const current=await getTarget(target);
  if (!current) throw new Error('Unknown image target');
  const published=await publishWebP({target,webp,archive});
  if (!published?.key || published.verified!==true) throw new Error('WebP publication not verified');
  const activation=await setTarget({target,expectedRevision:current.revision,expectedKey:current.key??null,key:published.key,metadata:published.metadata});
  return {activation,archive};
 }
 async function remove({target}) {
  if (!target) throw new Error('Image target is required');
  const current=await getTarget(target);
  if (!current) throw new Error('Unknown image target');
  return setTarget({target,expectedRevision:current.revision,expectedKey:current.key??null,key:null});
 }
 return {add:put,replace:put,remove};
}
