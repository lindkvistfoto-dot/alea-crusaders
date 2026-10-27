// HERMES CORE: explicit Troferummet target categories.
// These are logical image destinations, not MIME types or material types.
// Actual database bindings must be registered and authorized server-side.
export const TROPHY_IMAGE_TARGETS=Object.freeze({
 award:'definition',
 badge:'definition',
 medal:'definition',
 relief:'relief',
 badge_frame:'system',
 background:'system',
 system_image:'system'
});
export function resolveTrophyImageTarget(target) {
 if(!target || typeof target!=='object') throw new Error('Image target required');
 const kind=TROPHY_IMAGE_TARGETS[target.category];
 if(!kind) throw new Error('Unknown Trophy Room image category');
 if(typeof target.id!=='string'||!target.id.trim()) throw new Error('Image target ID required');
 if(kind==='system' && !/^[a-z0-9][a-z0-9_-]*$/.test(target.id))
  throw new Error('Invalid system image key');
 return {kind,id:target.id,category:target.category};
}
