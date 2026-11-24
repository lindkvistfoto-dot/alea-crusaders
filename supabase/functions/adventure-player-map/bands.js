import { Buffer } from 'node:buffer';
import { pipeline } from 'node:stream/promises';
import { createDeflate } from 'node:zlib';
import { unzipSync } from 'npm:fflate@0.8.2';
import Packer from 'npm:pngjs@7.0.0/lib/packer.js';
import { applyDiscoveryMask, discoveryMask } from './mask.js';

// All input bands stay server-side. Only masked scanlines enter the PNG.
export async function projectBands(bytes, plan) {
  const bands = unzipSync(bytes);
  const [width,height] = JSON.parse(new TextDecoder().decode(bands['size.json']));
  if (![width,height,plan.width,plan.height].every(n => Number.isSafeInteger(n) && n > 0) ||
      Math.max(width,height) > 8192 || width*plan.height !== height*plan.width) throw Error('Invalid map extent');
  const {decode} = await import('npm:@cwasm/webp@0.1.5');

  function* scanlines() {
    for (let top=0; top<height; top+=128) {
      const rows = Math.min(128,height-top);
      const mask = discoveryMask(width,rows,plan.areas,width/plan.width,top);
      const stride = 1+width*4;
      const output = Buffer.alloc(rows*stride); // filter byte 0 precedes each RGBA row
      if (mask.includes(1)) {
        const band = bands[top+'.image'];
        const image = decode(band);
        if (image.width!==width || image.height!==rows) throw Error('Invalid map strip');
        applyDiscoveryMask(image.data,mask);
        for (let y=0; y<rows; y++) {
          output.set(image.data.subarray(y*width*4,(y+1)*width*4),y*stride+1);
        }
      } else {
        for (let y=0; y<rows; y++) output.fill(opaqueBlackRow,y*stride+1,(y+1)*stride);
      }
      yield output;
    }
  }
  const opaqueBlackRow = Buffer.from([0,0,0,255]);
  const packer = new Packer({bitDepth:8,colorType:6});
  const chunks = [Buffer.from([137,80,78,71,13,10,26,10]),packer.packIHDR(width,height)];
  await pipeline(scanlines(), createDeflate({level:2}), async encoded => {
    for await (const chunk of encoded) chunks.push(packer.packIDAT(Buffer.from(chunk)));
  });
  chunks.push(packer.packIEND());
  return Buffer.concat(chunks);
}
