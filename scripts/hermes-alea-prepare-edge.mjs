import {copyFile} from 'node:fs/promises';
await copyFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')),new URL('../supabase/functions/hermes-alea/magick.wasm',import.meta.url));
console.log('HERMES ALEA local WASM prepared');
