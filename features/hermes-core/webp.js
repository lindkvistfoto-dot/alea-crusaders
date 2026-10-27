// HERMES CORE browser WebP encoder. Native browser APIs only; no WASM.
export async function convertCoreImageToWebP(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type))
    throw new Error('Unsupported image format');
  if (!file.size || file.size > 12_000_000) throw new Error('Image exceeds 12 MB');
  const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 2048 || bitmap.height > 2048 ||
        bitmap.width * bitmap.height > 4_194_304) throw new Error('Image dimensions exceed limits');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const result = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',0.92));
    if (!result || result.type !== 'image/webp' || !result.size || result.size > 12_000_000)
      throw new Error('WebP conversion failed');
    const check = await createImageBitmap(result);
    try {
      if (check.width !== bitmap.width || check.height !== bitmap.height)
        throw new Error('WebP dimensions changed');
    } finally { check.close(); }
    return result;
  } finally { bitmap.close(); }
}
