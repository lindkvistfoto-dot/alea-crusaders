import {describe,it,expect} from 'vitest';
import contract from '../features/hermes-core/contract.json' with {type:'json'};
import {normalizeCoreQueueTarget} from '../features/hermes-core/queue-target.js';
import {CORE_APP_IMAGE_PROFILES,resolveCoreImageProfile,coreAppImagePath} from '../features/hermes-core/app-image-targets.js';
import {createCoreActionsTargetAdapter} from '../features/hermes-core/actions-target-adapter.js';

describe('HERMES CORE declarative image contract',()=>{
 it('resolves each profile only to a repository-approved adapter',()=>{
  for(const [profileId,profile] of Object.entries(contract.profiles)){
   const resolved=resolveCoreImageProfile(profileId);
   expect(resolved).toBeTruthy();
   expect(resolved.kind).toBe(contract.adapters[profile.adapter].kind);
   expect(['public','private']).toContain(resolved.visibility);
  }
  expect(CORE_APP_IMAGE_PROFILES.length).toBe(9);
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
      ? JSON.stringify(row[key])===JSON.stringify(value) : row[key]===value);
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
 it('keeps earlier schema-2 targets compatible and hashes profile paths immutably',()=>{
  const target=normalizeCoreQueueTarget({schema:2,label:'Skill',target:{kind:'skill',id:'combat-training'}});
  expect(target.profile_id).toBe('skill-icon');
  expect(target.kind).toBe('skill');
  expect(coreAppImagePath('skill-icon','combat-training','a'.repeat(64))).toBe(
   'hermes/core/skill/combat-training/'+ 'a'.repeat(64)+'.webp'
  );
 });
});
