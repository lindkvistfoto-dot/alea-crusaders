import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readAleaImageZip} from '../features/material/zip-import.js';

const campaign='846e8089-24da-4825-af34-32903117152a';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const utf8=new TextEncoder();

function zipStored(items){
 const local=[],central=[];
 let offset=0,centralSize=0;
 for(const [name,content] of items){
  const encoded=utf8.encode(name);
  const bytes=typeof content==='string'?utf8.encode(content):content;
  const localHeader=new Uint8Array(30);
  const localView=new DataView(localHeader.buffer);
  localView.setUint32(0,0x04034b50,true);
  localView.setUint16(4,20,true);
  localView.setUint16(6,2048,true);
  localView.setUint32(18,bytes.length,true);
  localView.setUint32(22,bytes.length,true);
  localView.setUint16(26,encoded.length,true);
  local.push(localHeader,encoded,bytes);
  const centralHeader=new Uint8Array(46);
  const centralView=new DataView(centralHeader.buffer);
  centralView.setUint32(0,0x02014b50,true);
  centralView.setUint16(4,20,true);
  centralView.setUint16(6,20,true);
  centralView.setUint16(8,2048,true);
  centralView.setUint32(20,bytes.length,true);
  centralView.setUint32(24,bytes.length,true);
  centralView.setUint16(28,encoded.length,true);
  centralView.setUint32(42,offset,true);
  central.push(centralHeader,encoded);
  centralSize+=centralHeader.length+encoded.length;
  offset+=localHeader.length+encoded.length+bytes.length;
 }
 const eocd=new Uint8Array(22),end=new DataView(eocd.buffer);
 end.setUint32(0,0x06054b50,true);
 end.setUint16(8,items.length,true);
 end.setUint16(10,items.length,true);
 end.setUint32(12,centralSize,true);
 end.setUint32(16,offset,true);
 return new File([...local,...central,eocd],'Skelettbyn.zip',{type:'application/zip'});
}
function pack({image='Plats 01 – Kyrkan.png',size=png.length,category='location',campaignId=campaign}={}){
 const json=JSON.stringify({schema_version:1,campaign_id:campaignId,
  images:[{filename:image,title:'Plats 01 – Kyrkan',category,
   description:'Kyrkan i Skelettbyn',size_bytes:size}]});
 return zipStored([['manifest.json',json],[image,png]]);
}

describe('Skelettbyn — ZIP-import till privata platsbilder',()=>{
 it('extracts metadata and a Blob backed by one image entry',async()=>{
  const result=await readAleaImageZip(pack());
  expect(result.campaignId).toBe(campaign);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].name).toBe('Plats 01 – Kyrkan.png');
  expect(result.entries[0].title).toBe('Plats 01 – Kyrkan');
  expect(result.entries[0].file.type).toBe('image/png');
  expect(result.entries[0].file.size).toBe(png.length);
  expect([...new Uint8Array(await result.entries[0].file.arrayBuffer())]).toEqual([...png]);
 });
 it('does not permit path traversal or unsafe ZIP names',async()=>{
  await expect(readAleaImageZip(pack({image:'../secret.png'}))).rejects.toThrow(/filnamn/);
  await expect(readAleaImageZip(pack({image:'secret/x.png'}))).rejects.toThrow(/filnamn/);
 });
 it('rejects mismatched manifest and unsafe categories',async()=>{
  await expect(readAleaImageZip(pack({size:999}))).rejects.toThrow(/matchar/);
  await expect(readAleaImageZip(pack({category:'gm_notes'}))).rejects.toThrow(/manifest/);
 });
 it('rejects a corrupt or incomplete ZIP file',async()=>{
  const zip=pack();
  await expect(readAleaImageZip(new File([await zip.slice(0,zip.size-20).arrayBuffer()],'cut.zip'))).rejects.toThrow();
  await expect(readAleaImageZip(new File([png],'bad.zip'))).rejects.toThrow();
 });
 it('requires a manifest rather than importing arbitrary archives',async()=>{
  await expect(readAleaImageZip(zipStored([['Plats 1.png',png]]))).rejects.toThrow(/manifest/);
 });
 it('Gimli importer remains GM-authorized and never publishes original PNG files',()=>{
  const gimli=readFileSync(new URL('../features/material/storage.js',import.meta.url),'utf8');
  const library=readFileSync(new URL('../features/material/library.js',import.meta.url),'utf8');
  expect(gimli).toContain('if(!gimliCanUpload()||!centralCampaignId)');
  expect(gimli).toContain('window.aleaReadImageZip(zip)');
  expect(gimli).toContain("category:'location',description:entry.description");
  expect(gimli).toContain('original_filename=eq.');
  expect(gimli).toContain('gimliUploadMaterial({campaignId:campaign,file:entry.file');
  expect(gimli).toContain('Bilderna är privata.');
  expect(gimli).toContain('id="gimliZipFile"');
  expect(library).toContain("import './zip-import.js?v=0.34.92'");
 });
});
