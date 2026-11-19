import { previewFlood, wallPixels } from './kartakademin-mask.js';

let image;
let cachedWalls;
let cachedSensitivity;

self.onmessage = ({ data }) => {
  if (data.image) {
    image = data.image;
    cachedWalls = undefined;
  }
  const { request, mask, point, options } = data;
  try {
    if (options.detectWalls && (!cachedWalls || options.wallSensitivity !== cachedSensitivity)) {
      cachedWalls = wallPixels(mask, image, options.wallSensitivity);
      cachedSensitivity = options.wallSensitivity;
    }
    const cells = previewFlood(mask, image, point, options, cachedWalls);
    self.postMessage({ request, cells }, [cells.buffer]);
  } catch (error) {
    self.postMessage({ request, error: error.message });
  }
};
