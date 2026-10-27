// HERMES CORE: explicit target adapters for the Troferummet pilot.
// No arbitrary table or column names may be supplied by a caller.
// The backend must implement atomic compare-and-swap for each adapter.
export function createTrophyTargetAdapter({readHonor,writeHonor,readSystem,writeSystem}) {
 for(const [name,fn] of Object.entries({readHonor,writeHonor,readSystem,writeSystem}))
  if(typeof fn!=='function') throw new TypeError('Missing target adapter: '+name);
 function classify(target) {
  if(!target||!['definition','relief','system'].includes(target.kind)||!target.id)
   throw new Error('Unsupported image target');
  return target.kind;
 }
 async function getTarget(target) {
  const kind=classify(target);
  return kind==='system' ? readSystem(target.id) : readHonor(kind,target.id);
 }
 async function setTarget({target,expectedRevision,expectedKey,key}) {
  const kind=classify(target);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
   throw new Error('Invalid image revision');
  const args={id:target.id,expectedRevision,expectedKey,key};
  // These functions must reject stale revisions and unauthorized updates atomically.
  return kind==='system'?writeSystem(args):writeHonor({...args,kind});
 }
 return {getTarget,setTarget};
}
