import {it,expect} from 'vitest';
import {resolveImageProfile,DEFAULT_IMAGE_PROFILE} from '../features/hermes-alea/profiles.js';
it('default profile is generic and not tied to relief',()=>{
 expect(resolveImageProfile().requireAlpha).toBe(false);
 expect(DEFAULT_IMAGE_PROFILE.maxBytes).toBe(12_000_000);
});
it('caller can require alpha without changing global default',()=>{
 expect(resolveImageProfile({requireAlpha:true}).requireAlpha).toBe(true);
 expect(resolveImageProfile().requireAlpha).toBe(false);
});
it('profiles cannot bypass server-side bounds',()=>{
 for(const field of ['maxBytes','maxWidth','maxHeight','maxPixels']){
  expect(()=>resolveImageProfile({[field]:DEFAULT_IMAGE_PROFILE[field]+1})).toThrow(/servergränser/);
 }
 expect(()=>resolveImageProfile({allowedMimeTypes:['image/svg+xml']})).toThrow(/bildformat/);
});

it('allows a longer edge only for map objects within the original byte and pixel budgets',()=>{
 const profile=resolveImageProfile({},'map-object');
 expect(profile).toEqual({...DEFAULT_IMAGE_PROFILE,maxWidth:4096,maxHeight:4096});
 expect(()=>resolveImageProfile({maxHeight:4097},'map-object')).toThrow();
 expect(()=>resolveImageProfile({maxWidth:4096},'weapon')).toThrow();
});
