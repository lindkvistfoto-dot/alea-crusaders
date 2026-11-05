import {describe,it,expect} from 'vitest';
import {CORE_APP_IMAGE_PROFILES,coreAppImagePath,resolveCoreImageProfile} from '../features/hermes-core/app-image-targets.js';
import {createCoreActionsTargetAdapter} from '../features/hermes-core/actions-target-adapter.js';

const UUID='6a67121d-67ee-4943-82a3-83a15334d815';
const CAMPAIGN='c45228b1-c692-4a4c-9f15-4ed97da9b57c';
const HASH='a'.repeat(64);

function dbFor(profile,row){
 return {from(table){
  if(table!==profile.table)throw new Error('UNEXPECTED_TABLE');
  let operation='select',values={};const filters=[];
  const q={
   select(){return q;},
   update(next){operation='update';values=next;return q;},
   eq(column,value){filters.push([column,'eq',value]);return q;},
   is(column,value){filters.push([column,'is',value]);return q;},
   async maybeSingle(){
    if(!filters.every(([column,operator,value])=>operator==='is'?row[column]===value:row[column]===value))return {data:null,error:null};
    if(operation==='update')Object.assign(row,values);
    return {data:{...row},error:null};
   }
  };
  return q;
 }};
}

const targets=[
 ['combatant-pose-published',{publication_status:'published',staging_path:'old-staging.png',pending_staging_path:null,pending_base_key:null,pending_mounting_profile:null,is_active:true,base_key:'hex-base',mounting_profile:{scale:1}}],
 ['combatant-pose-draft',{publication_status:'draft',staging_path:null,pending_staging_path:null,pending_base_key:null,pending_mounting_profile:null,is_active:false,base_key:'hex-base',mounting_profile:{scale:1}}],
 ['race-pose-published',{publication_status:'published',staging_path:'old-staging.png',pending_staging_path:null,pending_base_key:null,pending_mounting_profile:null,is_active:true,base_key:'hex-base',mounting_profile:{scale:1}}],
 ['race-pose-draft',{publication_status:'draft',staging_path:null,pending_staging_path:null,pending_base_key:null,pending_mounting_profile:null,is_active:false,base_key:'hex-base',mounting_profile:{scale:1}}],
 ['campaign-npc-portrait',{campaign_id:CAMPAIGN}],
 ['campaign-monster-portrait',{campaign_id:CAMPAIGN}],
 ['campaign-material-image',{campaign_id:CAMPAIGN,asset_kind:'image',storage_bucket:'campaign-materials',archived_at:null,thumbnail_path:null,sha256:null,file_size_bytes:null,mime_type:'image/png'}],
 ['campaign-gallery-image',{campaign_id:CAMPAIGN,storage_bucket:'campaign-location-assets',mime_type:'image/png'}],
 ['campaign-location-asset',{campaign_id:CAMPAIGN,location_id:'e2e4567b-67de-4c63-a057-e8cc9ec44266',asset_type:'image',asset_kind:'image',player_visible:false}],
 ['round-background-catalog',{archived_at:null,is_active:false}],
];

describe('Universal HERMES CORE adapters',()=>{
 it('keeps each destination, visibility and immutable path in the approved profile',()=>{
  for(const [profileId,rowValues] of targets){
   const profile=resolveCoreImageProfile(profileId);
   expect(profile?.kind).toBe('app-image');
   expect(['public','private']).toContain(profile.visibility);
   expect(profile.bucket).not.toBe('attacker-bucket');
   const path=coreAppImagePath(profileId,UUID,HASH,{id:UUID,...rowValues});
   expect(path).toMatch(/\.webp$/);
   expect(path).not.toContain('..');
  }
  expect(CORE_APP_IMAGE_PROFILES).toEqual(expect.arrayContaining(targets.map(([id])=>id)));
 });

 it('writes only the image pointer and declared provenance while preserving state',async()=>{
  for(const [profileId,extras] of targets){
   const profile=resolveCoreImageProfile(profileId),row={id:UUID,[profile.lookup_column]:UUID,[profile.image_column]:'old.webp',...extras};
   const prepared={target:{kind:'app-image',id:UUID,profile_id:profileId},profile_id:profileId,source_sha256:HASH,archive_file_id:'drive-archive-id',source_file_name:'source.png',drive_file_id:'drive-inbox-id'};
   const adapter=createCoreActionsTargetAdapter({db:dbFor(profile,row),prepared,registryKey:'unused'});
   const before=await adapter.readTarget(prepared.target);
   const path=coreAppImagePath(profileId,UUID,HASH,before.row);
   await adapter.activate(prepared.target,before.revision,before.key,{path,sha256:HASH,bytes:2048,width:640,height:640,alphaPreserved:true},false);
   expect(row[profile.image_column]).toBe(path);
   if(profileId.includes('pose')){
    expect(row.publication_status).toBe(extras.publication_status);
    expect(row.is_active).toBe(extras.is_active);
    expect(row.base_key).toBe('hex-base');
    expect(row.mounting_profile).toEqual({scale:1});
    expect(row.source_sha256).toBe(HASH);
    expect(row.source_drive_file_id).toBe('drive-archive-id');
   }
   if(profileId==='campaign-material-image'){
    expect(row.sha256).toBe(HASH);
    expect(row.file_size_bytes).toBe(2048);
    expect(row.mime_type).toBe('image/webp');
    expect(row.archived_at).toBeNull();
    expect(row.thumbnail_path).toBeNull();
   }
   if(profileId==='round-background-catalog')expect(row.is_active).toBe(false);
  }
 });

 it('refuses pose records claimed by the ALEA staging lifecycle',async()=>{
  const profile=resolveCoreImageProfile('combatant-pose-draft');
  const row={id:UUID,[profile.lookup_column]:UUID,[profile.image_column]:null,publication_status:'draft',staging_path:'battle-pose/claimed.png',pending_staging_path:null,pending_base_key:null,pending_mounting_profile:null,is_active:false,base_key:'hex-base',mounting_profile:{}};
  const prepared={target:{kind:'app-image',id:UUID,profile_id:'combatant-pose-draft'},profile_id:'combatant-pose-draft'};
  const adapter=createCoreActionsTargetAdapter({db:dbFor(profile,row),prepared,registryKey:'unused'});
  await expect(adapter.readTarget(prepared.target)).rejects.toThrow('CORE_APP_TARGET_BUSY');
 });
});
