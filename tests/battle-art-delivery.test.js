import {describe,it,expect,vi} from 'vitest';
import {createApi,id,flags,profile,ref,rules,fixture,freeze} from './helpers/battle-art.mjs';

describe('BENGALI image delivery and HERMES boundary',()=>{
 const api=createApi();
 const url=ref=>'https://synthetic.invalid/'+ref.path;
 it('does no IO or selection by default',async()=>{
  const loadAsset=vi.fn(),onChange=vi.fn(),session=api.createDeliverySession({loadAsset,onChange});
  expect((await session.select(fixture(api).request)).kind).toBe('disabled');
  expect(loadAsset).not.toHaveBeenCalled();
 });
 it('shows a safe marker synchronously, then decoded current art',async()=>{
  const onChange=vi.fn(),session=api.createDeliverySession({flags,onChange,loadAsset:async ref=>url(ref)});
  const pending=session.select(fixture(api).request);
  expect(onChange.mock.calls[0][0].kind).toBe('marker');
  expect((await pending)).toMatchObject({kind:'battle_pose',urls:{[id(100)]:'https://synthetic.invalid/battle-art/synthetic/100.webp'}});
 });
 it('rejects late sword art after the current equipment changes',async()=>{
  let finish;const delayed=new Promise(resolve=>{finish=resolve});
  const {request}=fixture(api),updates=[];
  const session=api.createDeliverySession({flags,onChange:result=>updates.push(result),
   loadAsset:ref=>ref.id===id(100)?delayed:Promise.resolve(url(ref))});
  const old=session.select(request),p=profile();p.currentEquipment.rightHand=ref('weapon','dagger');
  const next={...request,loadout:api.readBattleLoadout(p,{}, {ruleWeapons:rules})};
  const current=await session.select(freeze(next));
  expect(current.kind).toBe('portrait');
  finish('https://synthetic.invalid/old-sword.webp');
  expect((await old).kind).toBe('stale');
  expect(updates.at(-1).kind).toBe('portrait');
  expect(updates.some(result=>result.kind==='battle_pose')).toBe(false);
 });
 it('continues down the fallback chain after signing, missing-file or decode failures',async()=>{
  const session=api.createDeliverySession({flags,loadAsset:async ref=>{
   if([id(100),id(101)].includes(ref.id))throw Error('missing or corrupt');return url(ref);
  }});
  expect((await session.select(fixture(api).request)).kind).toBe('initials');
 });
 it('ends with a marker if every image is unavailable, with a finite number of attempts',async()=>{
  const loadAsset=vi.fn(async()=>{throw Error('403')});
  const result=await api.createDeliverySession({flags,loadAsset}).select(fixture(api).request);
  expect(result.kind).toBe('marker');expect(loadAsset.mock.calls.length).toBeLessThanOrEqual(4);
 });
 it.each(['javascript:alert(1)','data:image/png;base64,AA','file:///tmp/x.webp','http://insecure.test/x.webp','https://user:pass@test.invalid/x.webp'])
 ('rejects unsafe delivery URL %s',async value=>{
  const session=api.createDeliverySession({flags,loadAsset:async()=>value});
  expect((await session.select(fixture(api).request)).kind).toBe('marker');
 });
 it('clears pending work on campaign change/logout even with the same equipment',async()=>{
  let finish;const loadAsset=()=>new Promise(resolve=>{finish=resolve}),onChange=vi.fn();
  const session=api.createDeliverySession({flags,loadAsset,onChange});
  const pending=session.select(fixture(api).request);session.clear();
  finish('https://synthetic.invalid/file.webp');expect((await pending).kind).toBe('stale');
  expect(onChange.mock.calls.at(-1)[0].reason).toBe('session-cleared');
 });
 it('bridges existing HERMES metadata to a draft candidate without promoting Inbox art',()=>{
  const metadata=freeze({schema:1,kind:'synthetic',target_key:'synthetic-slot',source_path:'drive://not-a-real-file',
   source_sha256:'b'.repeat(64),app_file:'synthetic/synthetic-slot/'+ 'a'.repeat(64)+'.webp',
   app_sha256:'a'.repeat(64),app_bytes:2048,width:900,height:1000,alpha_preserved:true});
  const candidate=api.readHermesCandidate(metadata,{assetId:id(100),bucket:'campaign-actor-images',path:'battle-art/test.webp'});
  expect(candidate).toMatchObject({status:'draft',verified:false,width:900,height:1000});
  expect(api.validAsset(candidate)).toBe(false);
  expect(candidate.source_path).toBeUndefined();
  const {request,manifest}=fixture(api);manifest.assets[0]=candidate;
  expect(api.resolveBattleArt(request,flags).kind).toBe('portrait');
  expect(api.readHermesCandidate({...metadata,app_sha256:'invalid'},{assetId:id(100)})).toBeNull();
 });
});
