import { describe, expect, it, vi } from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../features/material/storage.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261008_gimli_material_storage.sql',import.meta.url),'utf8');
const cid='123e4567-e89b-42d3-a456-426614174000',id='123e4567-e89b-42d3-a456-426614174001';
function build(overrides={}){
 const urls=[],writes=[];
 const context={
  window:{},centralCampaignId:cid,centralCampaignRole:'gm',
  activeUser:()=>({admin:false}),crypto:{randomUUID:()=>id},
  console,Blob,Uint8Array,
  mapStorageFetch:async (url,opts)=>{
   urls.push({url,opts});
   return {ok:true,blob:async()=>new Blob([])}
  },
  encodeStoragePath:p=>p.split('/').map(encodeURIComponent).join('/'),
  dbJson:async (path,opts)=>{writes.push({path,opts});return[{id,title:'Bild'}]},
  $:()=>null,escAttr:String,...overrides
 };
 runInNewContext(source+\'\nthis.api={gimliMime,gimliSignature,gimliValidate,gimliPath,gimliFilename,gimliCanUpload,gimliUploadMaterial,gimliRollbackFiles,gimliReadFile,gimliMountAdmin};\',context);
 return {api:context.api,urls,writes,context}
}
function file(name,type,bytes){
 const b=new Blob([Uint8Array.from(bytes)],{type});
 return {name,type,size:b.size,slice:(a,z)=>b.slice(a,z),arrayBuffer:()=>b.arrayBuffer()}
}
const png=file('By.png','image/png',[137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]);
const pdf=file('Brev.pdf','application/pdf',[37,80,68,70,45,49,46,55,10,10]);

describe('Gimli privata materiallagring',()=>{
 it('kontrollerar storlek, format och filsignatur',async()=>{
  const {api}=build();
  expect((await api.gimliValidate(png)).kind).toBe('image');
  expect((await api.gimliValidate(pdf)).kind).toBe('document');
  await expect(api.gimliValidate(file('evil.png','image/png',[65,66,67]))).rejects.toThrow(/innehåll/);
  await expect(api.gimliValidate(file('script.exe','application/octet-stream',[65]))).rejects.toThrow(/Tillåtna/);
  await expect(api.gimliValidate({name:'large.pdf',size:20971521})).rejects.toThrow(/20 MB/);
 });
 it('kampanjprefixade sökvägar och unikt uppladdnings-ID',()=>{
  const {api}=build();
  expect(api.gimliPath(cid,id,'skelettbyn.png')).toBe(cid+'/'+id+'/skelettbyn.png');
  expect(()=>api.gimliPath(cid,id,'../hemligt')).toThrow();
  expect(()=>api.gimliPath('annan',id,'bild.png')).toThrow();
  expect(api.gimliFilename('Blå dörr!.png','png')).toBe('Bla-dorr-.png')
 });
 it('sparar blob först och registrerar därefter metadata',async()=>{
  const {api,urls,writes}=build();
  const item=await api.gimliUploadMaterial({campaignId:cid,file:png,title:'Bild',category:'location'});
  expect(item.id).toBe(id);
  expect(urls[0].opts.method).toBe('POST');
  expect(urls[0].url).toContain('campaign-materials');
  expect(writes).toHaveLength(1);
  const json=JSON.parse(writes[0].opts.body);
  expect(json.campaign_id).toBe(cid);expect(json.storage_bucket).toBe('campaign-materials');
  expect(json.storage_path).toContain('/'+id+'/');
  expect(json.mime_type).toBe('image/png');
  expect(json.thumbnail_path).toBe(null)
 });
 it('städar den privata originalfilen om databasskrivningen misslyckas',async()=>{
  const {api,urls}=build({dbJson:async()=>{throw Error('databasfel')}});
  await expect(api.gimliUploadMaterial({campaignId:cid,file:png,title:'Bild'})).rejects.toThrow('databasfel');
  expect(urls.map(x=>x.opts.method)).toEqual(['POST','DELETE'])
 });
 it('förhindrar uppladdning utan SL-roll eller till annan kampanj',async()=>{
  const {api,urls}=build({activeUser:()=>({admin:false}),centralCampaignRole:'player'});
  await expect(api.gimliUploadMaterial({campaignId:cid,file:png,title:'Bild'})).rejects.toThrow(/Endast SL/);
  expect(urls).toHaveLength(0);
  const gm=build();
  await expect(gm.api.gimliUploadMaterial({campaignId:id,file:png,title:'Bild'})).rejects.toThrow(/kampanj/)
 });
 it('läsning sker genom privata storage-endpointen',async()=>{
  const {api,urls}=build();
  await api.gimliReadFile({storage_bucket:'campaign-materials',storage_path:cid+'/'+id+'/bild.png'});
  expect(urls[0].opts.method).toBe('GET');
  await expect(api.gimliReadFile({storage_bucket:'campaign-actor-images'})).rejects.toThrow(/privata/)
 });
 it('schema håller bucket privat med RLS och saknar UPDATE-policy',()=>{
  expect(migration).toContain("'campaign-materials','campaign-materials',false");
  expect(migration).toContain('20971520');
  for(const action of ['insert','select','delete'])expect(migration).toContain('campaign_materials_storage_'+action);
  expect(migration).not.toMatch(/create policy campaign_materials_storage_update/);
  expect(migration).toContain('private.is_campaign_gm(c.id)');
  expect(migration).toContain('private.is_campaign_member(c.id)');
  expect(migration).toContain('m.archived_at is null');
  expect(migration).toContain('s.revoked_at is null');
 });
});