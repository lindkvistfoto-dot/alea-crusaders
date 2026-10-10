import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../features/inn/inn.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inn=readFileSync(new URL('../features/inn/inn.js',import.meta.url),'utf8');
const portrait=readFileSync(new URL('../assets/innkeeper-hero.jpg',import.meta.url));
describe('Innkeeper portrait does not become a blurry stretched banner',()=>{
 it('caps the portrait size on desktop and mobile',()=>{
  expect(css).toContain('grid-template-columns:minmax(0,320px) minmax(0,1fr)');
  expect(css).toContain('width:min(100%,320px)');
  expect(css).toContain('max-height:240px');
  expect(css).toContain('min-height:0');
  expect(css).toContain('@media(max-width:820px)');
 });
 it('cache-busts the inn CSS after release',()=>{
  expect(html).toContain('href="./features/inn/inn.css?v='+JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version+'"');
 });

 it('uses the new high-resolution innkeeper photo and cache-busts its URL',()=>{
  expect(inn).toContain("const INN_HERO_SRC='./assets/innkeeper-hero.jpg?v=0.35.05'");
  // JPEG Start of Image.
  expect(portrait[0]).toBe(0xff);
  expect(portrait[1]).toBe(0xd8);
  let dimensions=null;
  for(let i=2;i+9<portrait.length;){
   if(portrait[i]!==0xff){i++;continue}
   const marker=portrait[i+1];
   if(marker===0xda||marker===0xd9)break;
   const length=portrait.readUInt16BE(i+2);
   if(length<2)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    dimensions={width:portrait.readUInt16BE(i+7),height:portrait.readUInt16BE(i+5)};
    break;
   }
   i+=2+length;
  }
  expect(dimensions).toEqual({width:1536,height:1152});
  expect(portrait.length).toBeGreaterThan(100000);
 });
});
