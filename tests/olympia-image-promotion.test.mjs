import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {promoteCoreImageManifest} from '../scripts/olympia/promote-core-assets.mjs';

const bytes=Buffer.from('webp!');
const digest=createHash('sha256').update(bytes).digest('hex');
const image={
  asset_key:'arcane-adventure-medal-dimon-v1',
  webp_sha256:digest,
  webp_path:`hermes/system-asset/arcane-adventure-medal-dimon-v1/${digest}.webp`,
  webp_bytes:5,width:1,height:1,alpha:true,
};
const moonheart={...image,asset_key:'arcane-adventure-medal-manhjartat-v2-v1',
  webp_path:`hermes/system-asset/arcane-adventure-medal-manhjartat-v2-v1/${digest}.webp`};
const manifest={schema:'olympia-image-promotion/v1',issueNumber:123,itemId:'TEST-001',testedDevSha:'b'.repeat(40),images:[image]};
function registryRow(asset=image,overrides={}) {
  return {id:`id-${asset.asset_key}`,asset_key:asset.asset_key,label:asset.asset_key,asset_path:asset.webp_path,
    app_sha256:asset.webp_sha256,app_bytes:asset.webp_bytes,width:asset.width,height:asset.height,
    alpha_preserved:asset.alpha,image_revision:0,...overrides};
}
function harness({assets=[image],devBytes=bytes,liveBytes=null,liveRow=null,devTargets=[],liveTargets=[]}={}) {
  const state={events:[],uploads:0,inserts:0,patches:0,devRows:new Map(assets.map(a=>[a.asset_key,registryRow(a)])),
    liveRows:new Map(liveRow?[ [assets[0].asset_key,liveRow] ]:[]),liveBytes:new Map(liveBytes?[[assets[0].asset_key,liveBytes]]:[]),
    devTargets:new Map(devTargets),liveTargets:new Map(liveTargets)};
  const fetchImpl=async (input,init={})=>{
    const url=new URL(input); const method=init.method||'GET';
    state.events.push(`${method} ${url.host}${url.pathname}`);
    if(url.pathname.includes('/rest/v1/arcane_system_assets')) {
      const isLive=url.host.startsWith('live.');
      const assetKey=new URLSearchParams(url.search).get('asset_key')?.slice(3);
      const rows=isLive?state.liveRows:state.devRows;
      const select=()=>new Response(JSON.stringify(rows.has(assetKey)?[rows.get(assetKey)]:[]),{status:200});
      if(method==='GET') return select();
      if(method==='POST') { state.inserts++; const row=JSON.parse(init.body)[0]; rows.set(row.asset_key,{...row,...registryRow(assets.find(a=>a.asset_key===row.asset_key),{asset_path:null,app_sha256:null,app_bytes:null,width:null,height:null,alpha_preserved:null,image_revision:0})}); return new Response(JSON.stringify([rows.get(row.asset_key)]),{status:201}); }
      if(method==='PATCH') { state.patches++; const current=rows.get(assetKey); rows.set(assetKey,{...current,...JSON.parse(init.body),image_revision:current.image_revision+1}); return new Response(JSON.stringify([rows.get(assetKey)]),{status:200}); }
    }
    if(url.pathname.includes('/rest/v1/honor_definitions')||url.pathname.includes('/rest/v1/honor_relief_variants')) {
      const isLive=url.host.startsWith('live.');
      const rows=isLive?state.liveTargets:state.devTargets;
      const targetId=new URLSearchParams(url.search).get('id')?.slice(3);
      if(method==='GET') return new Response(JSON.stringify(rows.has(targetId)?[rows.get(targetId)]:[]),{status:200});
      if(method==='PATCH') { const current=rows.get(targetId); rows.set(targetId,{...current,...JSON.parse(init.body),image_revision:current.image_revision+1}); return new Response(JSON.stringify([rows.get(targetId)]),{status:200}); }
    }
    const isLive=url.host.startsWith('live.');
    const asset=assets.find(a=>url.pathname.includes(encodeURIComponent(a.asset_key))||url.pathname.includes(a.asset_key))||assets[0];
    if(url.pathname.includes('/storage/v1/object/public/')) {
      const data=state.liveBytes.get(asset.asset_key);
      return new Response(data,{status:data?200:404,headers:{'content-type':'image/webp'}});
    }
    if(method==='POST') { state.uploads++; state.liveBytes.set(asset.asset_key,Buffer.from(init.body)); return new Response('{}',{status:200}); }
    const data=isLive?state.liveBytes.get(asset.asset_key):devBytes;
    return new Response(data??JSON.stringify({code:'NoSuchKey'}),{status:data?200:404,headers:{'content-type':data?'image/webp':'application/json'}});
  };
  return {state,fetchImpl};
}
const args=(h,overrides={})=>({manifest,devUrl:'https://dev.example',liveUrl:'https://live.example',devKey:'dev-key',liveKey:'live-key',fetchImpl:h.fetchImpl,...overrides});

describe('OLYMPIA CORE image promotion',()=>{
it('copies and verifies every immutable WebP before updating the LIVE asset reference',async()=>{
  const h=harness();
  const result=await promoteCoreImageManifest(args(h));
  expect(result.status).toBe('verified');
  expect(h.state.uploads).toBe(1);
  expect(h.state.inserts).toBe(1);
  expect(h.state.patches).toBe(1);
  const lastUpload=h.state.events.findIndex(x=>x.startsWith('POST live.example/storage/'));
  const firstDbWrite=h.state.events.findIndex(x=>x.startsWith('POST live.example/rest/')||x.startsWith('PATCH live.example/rest/'));
  expect(lastUpload>=0 && firstDbWrite>lastUpload).toBe(true);
  expect(h.state.liveRows.get(image.asset_key).asset_path).toBe(image.webp_path);
  expect(h.state.liveRows.get(image.asset_key).app_sha256).toBe(image.webp_sha256);
});

it('retry reuses the existing WebP and LIVE reference without duplicates',async()=>{
  const h=harness({liveBytes:bytes,liveRow:registryRow(image,{image_revision:2})});
  const result=await promoteCoreImageManifest(args(h));
  expect(result.promoted[0].reference).toBe('already-current');
  expect(h.state.uploads).toBe(0);
  expect(h.state.inserts).toBe(0);
  expect(h.state.patches).toBe(0);
});

it('a missing or changed DEV object fails before any LIVE write',async()=>{
  const h=harness({devBytes:Buffer.from('wrong')});
  await expect(promoteCoreImageManifest(args(h))).rejects.toThrow(/Storage bytes do not match/);
  expect(h.state.uploads).toBe(0);
  expect(h.state.inserts).toBe(0);
  expect(h.state.patches).toBe(0);
});

it('a PR with no images passes without accessing either environment',async()=>{
  const h=harness();
  const result=await promoteCoreImageManifest(args(h,{manifest:{...manifest,images:[]}}));
  expect(result).toEqual({status:'skipped',promoted:[],reason:'no-image-changes'});
  expect(h.state.events.length).toBe(0);
});

it('Dimön and Månhjärtat V2 use the same generic CORE promotion path',async()=>{
  const h=harness({assets:[image,moonheart]});
  const result=await promoteCoreImageManifest(args(h,{manifest:{...manifest,images:[image,moonheart]}}));
  expect(result.promoted.length).toBe(2);
  expect(result.promoted.map(item=>item.asset_key)).toEqual([image.asset_key,moonheart.asset_key]);
  expect(h.state.uploads).toBe(2);
  expect(h.state.patches).toBe(2);
  const firstWrite=h.state.events.findIndex(x=>x.startsWith('POST live.example/rest/')||x.startsWith('PATCH live.example/rest/'));
  const secondUpload=h.state.events.findIndex((x,i)=>i>h.state.events.findIndex(e=>e.startsWith('POST live.example/storage/'))&&x.startsWith('POST live.example/storage/'));
  expect(firstWrite>secondUpload).toBe(true);
});

it('honor image references update only after the LIVE registry image is verified',async()=>{
  const targetId='123e4567-e89b-42d3-a456-426614174000';
  const honorImage={...image,asset_key:`arcane-honor-definition-${targetId}-${digest.slice(0,16)}`,
    webp_path:`hermes/system-asset/arcane-honor-definition-${targetId}-${digest.slice(0,16)}/${digest}.webp`,
    target_kind:'honor-definition',target_id:targetId};
  const targetRow={id:targetId,image_asset_id:null,image_revision:0};
  const h=harness({assets:[honorImage],devTargets:[[targetId,{...targetRow,image_asset_id:honorImage.asset_key}]],liveTargets:[[targetId,targetRow]]});
  const result=await promoteCoreImageManifest(args(h,{manifest:{...manifest,images:[honorImage]}}));
  expect(result.promoted[0].target_reference).toBe('registered');
  expect(h.state.liveTargets.get(targetId).image_asset_id).toBe(honorImage.asset_key);
});
});
