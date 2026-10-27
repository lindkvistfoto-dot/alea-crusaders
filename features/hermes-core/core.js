// HERMES CORE: developer publishing lifecycle. Original archives live in Drive;
// the web-user HERMES ALEA storage and worker are independent.
export function createHermesCore({archiveOriginal, convertToWebP, publishWebP, getTarget, setTarget, createTarget}) {
 for (const [name,fn] of Object.entries({archiveOriginal,convertToWebP,publishWebP,getTarget,setTarget}))
  if (typeof fn !== 'function') throw new TypeError('Missing HERMES CORE adapter: '+name);
 async function put({target,file}) {
  if (!target || !file?.size) throw new Error('Image and target are required');
  const receipt=await archiveOriginal(file);
  if (!receipt?.id || receipt.verified!==true) throw new Error('Drive archive not verified');
  const archive={status:'archived',id:receipt.id};
  const webp=await convertToWebP(file);
  if (!webp || webp.type!=='image/webp' || !webp.size) throw new Error('Invalid WebP');
  const current=await getTarget(target);
  if (!current && typeof createTarget !== 'function') throw new Error('CREATE adapter required for new image target');
  const published=await publishWebP({target,webp,archive});
  if (!published?.key || published.verified!==true) throw new Error('WebP publication not verified');
  const activation=current
   ? await setTarget({target,expectedRevision:current.revision,expectedKey:current.key??null,key:published.key,metadata:published.metadata})
   : await createTarget({target,key:published.key,metadata:published.metadata});
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
