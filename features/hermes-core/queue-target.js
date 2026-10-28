// HERMES CORE queue target normalization. Pure validation: no production writes.
// Legacy schema 1 remains system-only; Trophy Room requires schema 2.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYSTEM=/^[a-z0-9][a-z0-9_.-]*$/;
export const CORE_TARGET_KINDS=Object.freeze(['system','honor-definition','honor-relief']);
export function normalizeCoreQueueTarget(request) {
 if(!request || typeof request!=='object' || Array.isArray(request)) throw new Error('INVALID_CORE_REQUEST');
 if(request.schema===1) {
  if(typeof request.asset_key!=='string'||!SYSTEM.test(request.asset_key)) throw new Error('INVALID_ASSET_KEY');
  return {kind:'system',id:request.asset_key,label:request.label};
 }
 if(request.schema!==2) throw new Error('UNSUPPORTED_CORE_SCHEMA');
 const target=request.target;
 if(!target||typeof target!=='object'||Array.isArray(target)) throw new Error('CORE_TARGET_REQUIRED');
 if(!CORE_TARGET_KINDS.includes(target.kind)) throw new Error('CORE_TARGET_KIND_UNSUPPORTED');
 if(typeof target.id!=='string'||!(target.kind==='system'?SYSTEM:UUID).test(target.id)) throw new Error('INVALID_CORE_TARGET_ID');
 if(target.kind==='honor-relief' && target.material!==undefined && !['enamel','metal_relief','carved_wood','other'].includes(target.material)) throw new Error('INVALID_RELIEF_MATERIAL');
 return {kind:target.kind,id:target.id,label:request.label, ...(target.material?{material:target.material}:{})};
}
