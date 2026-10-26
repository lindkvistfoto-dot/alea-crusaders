import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveImageProfile,DEFAULT_IMAGE_PROFILE} from '../features/hermes-alea/profiles.js';
test('default profile is generic and not tied to relief',()=>{
 assert.equal(resolveImageProfile().requireAlpha,false);
 assert.equal(DEFAULT_IMAGE_PROFILE.maxBytes,12_000_000);
});
test('caller can require alpha without changing the global default',()=>{
 assert.equal(resolveImageProfile({requireAlpha:true}).requireAlpha,true);
 assert.equal(resolveImageProfile().requireAlpha,false);
});
test('profiles cannot bypass server-side bounds',()=>{
 for(const field of ['maxBytes','maxWidth','maxHeight','maxPixels']){
  assert.throws(()=>resolveImageProfile({[field]:DEFAULT_IMAGE_PROFILE[field]+1}),/servergränser/);
 }
 assert.throws(()=>resolveImageProfile({allowedMimeTypes:['image/svg+xml']}),/bildformat/);
});
