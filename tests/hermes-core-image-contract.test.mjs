import {describe,it,expect} from 'vitest';
import contract from '../features/hermes-core/contract.json' with {type:'json'};
import {normalizeCoreQueueTarget} from '../features/hermes-core/queue-target.js';
import {CORE_APP_IMAGE_PROFILES,resolveCoreImageProfile,coreAppImagePath} from '../features/hermes-core/app-image-targets.js';
import {createCoreActionsTargetAdapter} from '../features/hermes-core/actions-target-adapter.js';

function matchesFilterValue(actual,expected){
 if(actual!==null&&typeof actual==='object'&&typeof expected==='string'){
  try{return JSON.stringify(actual)===JSON.stringify(JSON.parse(expected));}catch{return false;}
 }
 return JSON.stringify(actual)===JSON.stringify(expected);
}

describe('HERMES CORE declarative image contract',()=>{
 it('resolves each profile only to a repository-approved adapter',()=>{
  for(const [profileId,profile] of Object.entries(contract.profiles)){
   const resolved=resolveCoreImageProfile(profileId);
   expect(resolved).toBeTruthy();
   expect(resolved.kind).toBe(contract.adapters[profile.adapter].kind);
   expect(['public','private']).toContain(resolved.visibility);
  }
  expect(CORE_APP_IMAGE_PROFILES.length).toBe(31);
 });
 it('normalizes generic requests without accepting caller-selected destinations',()=>{
  const target=normalizeCoreQueueTarget({schema:3,label:'Portrait',target:{
   kind:'profile',profile_id:'unrestricted-system',id:'arcane-portrait-a',
   bucket:'attacker-bucket',table:'attacker-table',column:'attacker-column'
  }});
  expect(target).toEqual({kind:'system',id:'arcane-portrait-a',profile_id:'unrestricted-system',label:'Portrait'});
  expect(()=>normalizeCoreQueueTarget({schema:3,target:{kind:'profile',profile_id:'missing-profile',id:'abc'}})).toThrow('CORE_PROFILE_UNSUPPORTED');
  expect(()=>normalizeCoreQueueTarget({schema:3,target:{kind:'system',profile_id:'unrestricted-system',id:'arcane-a'}})).toThrow('CORE_PROFILE_TARGET_REQUIRED');
 });

 it('preserves private NPC metadata and verifies the record pointer through its adapter',async()=>{
  const row={id:'npc-row',npc_key:'elder-mage',image_path:null,image_reference:{legacy_note:'preserve'}};
  const db={from(table){
   expect(table).toBe('global_npcs');
   let op='select',values,columns='*';const filters=[];
   const q={
    select(value){columns=value;return q;},
    update(value){op='update';values=value;return q;},
    eq(key,value){filters.push(['eq',key,value]);return q;},
    is(key,value){filters.push(['is',key,value]);return q;},
    maybeSingle(){return run();},
   };
   async function run(){
    const matches=filters.every(([kind,key,value])=>kind==='eq'
      ? matchesFilterValue(row[key],value) : row[key]===value);
    if(!matches)return {data:null,error:null};
    if(op==='update'){Object.assign(row,values);return {data:{id:row.id,image_path:row.image_path},error:null};}
    return {data:{id:row.id,npc_key:row.npc_key,image_path:row.image_path,image_reference:row.image_reference},error:null};
   }
   return q;
  }};
  const prepared={target:{kind:'app-image',id:'elder-mage'},profile_id:'npc-portrait-private',
   source_file_name:'portrait.jpg',drive_file_id:'inbox-file-001',archive_file_id:'archive-file-01',
   source_sha256:'b'.repeat(64),source_mime:'image/jpeg'};
  const adapter=createCoreActionsTargetAdapter({db,prepared,registryKey:'unused'});
  const result=await adapter.activate(prepared.target,0,null,{
   path:'global-npc/elder-mage/'+ 'a'.repeat(64)+'.webp',sha256:'a'.repeat(64),bytes:2000,
   width:800,height:1200,alphaPreserved:false
  },false);
  expect(result.key).toBe(row.image_path);
  expect(row.image_reference.legacy_note).toBe('preserve');
  expect(row.image_reference.source_sha256).toBe(prepared.source_sha256);
  expect(row.image_reference.verified).toBe(true);
 });
 it('updates only the approved campaign map pointer and output dimensions',async()=>{
  const row={id:'123e4567-e89b-42d3-a456-426614174000',campaign_id:'987e6543-e21b-43d2-b654-426614174111',
   image_path:'old-map.webp',width:1200,height:800};
  const db={from(table){
   expect(table).toBe('campaign_maps');
   let op='select',values;const filters=[];
   const q={select(){return q;},update(value){op='update';values=value;return q;},
    eq(key,value){filters.push(['eq',key,value]);return q;},is(key,value){filters.push(['is',key,value]);return q;},
    maybeSingle(){return run();}};
   async function run(){
    const matches=filters.every(([kind,key,value])=>kind==='eq'
     ?matchesFilterValue(row[key],value):row[key]===value);
    if(!matches)return {data:null,error:null};
    if(op==='update'){Object.assign(row,values);return {data:{id:row.id,image_path:row.image_path},error:null};}
    return {data:{...row},error:null};
   }
   return q;
  }};
  const prepared={target:{kind:'app-image',id:row.id},profile_id:'campaign-map'};
  const adapter=createCoreActionsTargetAdapter({db,prepared,registryKey:'unused'});
  const result=await adapter.activate(prepared.target,0,row.image_path,{
   path:'new-map.webp',sha256:'a'.repeat(64),bytes:3200,width:2048,height:1365,alphaPreserved:false,
  },false);
  expect(result.key).toBe('new-map.webp');
  expect(row).toMatchObject({campaign_id:'987e6543-e21b-43d2-b654-426614174111',image_path:'new-map.webp',width:2048,height:1365});
 });
 it('keeps earlier schema-2 targets compatible and hashes profile paths immutably',()=>{
  const target=normalizeCoreQueueTarget({schema:2,label:'Skill',target:{kind:'skill',id:'combat-training'}});
  expect(target.profile_id).toBe('skill-icon');
  expect(target.kind).toBe('skill');
  expect(coreAppImagePath('skill-icon','combat-training','a'.repeat(64))).toBe(
   'hermes/core/skill/combat-training/'+ 'a'.repeat(64)+'.webp'
  );
 });
 it('binds UUID app targets to their approved row and campaign-scoped paths',()=>{
  const mapId='123e4567-e89b-42d3-a456-426614174000';
  const campaignId='987e6543-e21b-43d2-b654-426614174111';
  const target=normalizeCoreQueueTarget({schema:3,label:'Dev map',target:{
   kind:'profile',profile_id:'campaign-map',id:mapId,bucket:'attacker-bucket',
  }});
  expect(target).toEqual({kind:'app-image',id:mapId,profile_id:'campaign-map',label:'Dev map'});
  const path=coreAppImagePath('campaign-map',mapId,'a'.repeat(64),{campaign_id:campaignId});
  expect(path).toMatch(new RegExp(`^${campaignId}/${mapId}/image-[0-9a-f-]{36}\\.webp$`));
  expect(()=>coreAppImagePath('campaign-map',mapId,'a'.repeat(64),{})).toThrow('CORE_APP_IMAGE_PATH_CONTEXT_MISSING');
  expect(()=>normalizeCoreQueueTarget({schema:3,target:{kind:'profile',profile_id:'weapon-art',id:'not-a-uuid'}}))
   .toThrow('INVALID_CORE_TARGET_ID');
  expect(resolveCoreImageProfile('weapon-art').visibility).toBe('public');
  expect(resolveCoreImageProfile('campaign-map').visibility).toBe('private');
  expect(resolveCoreImageProfile('hit-figure').bucket).toBe('alea-hit-figures');
 });
});
