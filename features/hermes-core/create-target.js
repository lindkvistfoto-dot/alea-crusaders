// Connect HERMES CORE CREATE to the installed system-image RPC.
// This adapter does not alter existing ALEA image records.
export function createCoreSystemTarget({createSystemImage}) {
 if(typeof createSystemImage!=='function') throw new TypeError('System CREATE adapter required');
 return async function createTarget({target,key,metadata}) {
  if(target?.kind!=='system') throw new Error('Target CREATE adapter not configured');
  if(!metadata) throw new Error('Image metadata missing');
  return createSystemImage({
   id:target.id,label:target.label||target.id,path:key,metadata
  });
 };
}
