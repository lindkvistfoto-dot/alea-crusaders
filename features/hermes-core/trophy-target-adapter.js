// HERMES CORE Trophy Room adapter: fail-closed target routing.
// Registry and CAS operations are supplied by the authenticated host.
// No direct Storage-path writes to honor image_asset_id are permitted.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLES=Object.freeze({'honor-definition':'honor_definitions','honor-relief':'honor_relief_variants'});
export function createTrophyTargetAdapter({readRow,registerImage,compareAndSwap}) {
 for(const [name,fn] of Object.entries({readRow,registerImage,compareAndSwap}))
  if(typeof fn!=='function') throw new TypeError('Missing authenticated Trophy adapter: '+name);
 function resolve(target) {
  const table=TABLES[target?.kind];
  if(!table||typeof target.id!=='string'||!UUID.test(target.id)) throw new Error('INVALID_TROPHY_TARGET');
  return {table,id:target.id};
 }
 async function read(target) {
  const {table,id}=resolve(target);
  const row=await readRow({table,id});
  if(!row) throw new Error('TROPHY_TARGET_NOT_FOUND');
  if(target.kind==='honor-relief' && target.material && row.material!==target.material)
   throw new Error('TROPHY_RELIEF_MATERIAL_MISMATCH');
  return {key:row.image_asset_id??null,revision:Number(row.image_revision??0),row};
 }
 async function write({target,expectedRevision,expectedKey,key,metadata}) {
  const {table,id}=resolve(target);
  const previous=await read(target);
  if(previous.revision!==expectedRevision||previous.key!==expectedKey)
   throw new Error('TROPHY_TARGET_CHANGED');
  // The image registry owns image IDs; Storage paths must never be written into UUID references.
  const imageId=key===null?null:await registerImage({target,storagePath:key,metadata});
  if(imageId!==null && (typeof imageId!=='string'||!UUID.test(imageId)))
   throw new Error('INVALID_REGISTERED_IMAGE_ID');
  const result=await compareAndSwap({table,id,expectedRevision,expectedImageId:expectedKey,imageId});
  if(!result?.updated) throw new Error('TROPHY_TARGET_CHANGED');
  return {key:imageId,revision:result.revision};
 }
 return {read,write,resolve};
}
