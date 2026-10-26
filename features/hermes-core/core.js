// HERMES CORE: isolated orchestration. No imports from HERMES 4 or HERMES ALEA.
// Adapters are supplied by the host; no existing application paths are modified.
export function createHermesCore({archiveOriginal, convertToWebP, publishWebP, getTarget, setTarget}) {
  for (const [name, fn] of Object.entries({archiveOriginal, convertToWebP, publishWebP, getTarget, setTarget})) {
    if (typeof fn !== 'function') throw new TypeError('Missing HERMES CORE adapter: ' + name);
  }
  async function put({target, file}) {
    if (!target || !file || !file.size) throw new Error('Image and target are required');
    const webp = await convertToWebP(file);
    if (!webp || webp.type !== 'image/webp' || !webp.size) throw new Error('Invalid WebP');
    const current = await getTarget(target);
    if (!current) throw new Error('Unknown image target');
    const published = await publishWebP({target, webp});
    if (!published?.key || published.verified !== true) throw new Error('WebP publication not verified');
    // The adapter must compare expected revision atomically and refuse stale writes.
    const activated = await setTarget({target, expectedRevision: current.revision, expectedKey: current.key ?? null, key: published.key});
    let archive;
    try {
      const receipt = await archiveOriginal(file);
      archive = receipt?.id && receipt.verified === true ? {status:'archived', id:receipt.id} : {status:'pending'};
    } catch (error) {
      archive = {status:'pending', error:String(error?.message || error)};
    }
    return {activation:activated, archive};
  }
  async function remove({target}) {
    if (!target) throw new Error('Image target is required');
    const current = await getTarget(target);
    if (!current) throw new Error('Unknown image target');
    // Detach only; original and published objects are never deleted.
    return setTarget({target, expectedRevision: current.revision, expectedKey: current.key ?? null, key: null});
  }
  return {add: put, replace: put, remove};
}
