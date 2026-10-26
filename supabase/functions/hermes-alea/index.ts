import {initializeImageMagick} from '@imagemagick/magick-wasm';
import {decodeImage} from './codec.mjs';
import {createVerifyHandler} from './handler.mjs';
// Local, deploy-bundled WASM. No runtime third-party fetch or image conversion service.
await initializeImageMagick(await Deno.readFile(new URL('./magick.wasm',import.meta.url)));
Deno.serve(createVerifyHandler({env:(key:string)=>Deno.env.get(key),decode:decodeImage}));
