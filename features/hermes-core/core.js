// HERMES CORE: isolated orchestration. No imports from HERMES 4 or HERMES ALEA.
// Adapters are supplied by the host; no existing application paths are modified.
export function createHermesCore({archiveOriginal, convertToWebP, publishWebP, getTarget, setTarget}) {
  for (const [name, fn] of Object.entries({archiveOriginal, convertToWebP, publishWebP, getTarget, setTarget})) {
    if (typeof fn !== 'function') throw new TypeError('Missing HERMES CORE adapter: ' + name);
  }
  async function put({target, file}) {
    if (!target || !file || !file.size) throw new Error('Image and target are required');
    // Archive first: never activate an image whose original was not preserved.
    const archive = await archiveOriginal(file);
    if (!archive?.id) throw new Error('Original archive not verified');
    const webp = await convertToWebP(file);
    if (!webp || webp.type !== 'image/webp' || !webp.size) throw new Error('Invalid WebP');
    const current = await getTarget(target);
    if (!current) throw new Error('Unknown image target');
    const published = await publishWebP({target, webp, archiveId: archive.id});
    if (!published?.key) throw new Error('WebP publication not verified');
    // The adapter must compare expected revision atomically and refuse stale writes.
    return setTarget({target, expectedRevision: current.revision, key: published.key});
  }
  async function remove({target}) {
    if (!target) throw new Error('Image target is required');
    const current = await getTarget(target);
    if (!current) throw new Error('Unknown image target');
    // Detach only; original and published objects are never deleted.
    return setTarget({target, expectedRevision: current.revision, key: null});
  }
  return {add: put, replace: put, remove};
}
