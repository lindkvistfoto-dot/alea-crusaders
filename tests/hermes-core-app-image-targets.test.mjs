import {describe,it,expect} from "vitest";
import {CORE_APP_IMAGE_KINDS,coreAppImagePath,normalizeCoreAppImageKey,resolveCoreAppImageTarget} from "../features/hermes-core/app-image-targets.js";
import {createCoreActionsTargetAdapter} from "../features/hermes-core/actions-target-adapter.js";
import {CORE_TARGET_KINDS,normalizeCoreQueueTarget} from "../features/hermes-core/queue-target.js";

function fakeDb(tableName,row){
 return {from(table){
  if(table!==tableName)throw new Error("UNEXPECTED_TABLE");
  let op="select",values=null;const filters=[];
  const query={
   select(){return query;},
   update(next){op="update";values=next;return query;},
   eq(column,value){filters.push([column,"eq",value]);return query;},
   is(column,value){filters.push([column,"is",value]);return query;},
   async maybeSingle(){
    const matches=filters.every(([column,kind,value])=>kind==="is"?row[column]===value:row[column]===value);
    if(!matches)return {data:null,error:null};
    if(op==="update")Object.assign(row,values);
    return {data:{...row},error:null};
   }
  };
  return query;
 }};
}

describe("HERMES CORE ALEA image target coverage",()=>{
 it("accepts every existing spell, skill and symbol image kind",()=>{
  expect(CORE_APP_IMAGE_KINDS).toEqual(["spell","spell-cutout","spell-illustration","spell-illustration-wide","symbol","skill","skill-illustration","skill-illustration-wide"]);
  for(const kind of CORE_APP_IMAGE_KINDS){
   expect(resolveCoreAppImageTarget(kind)).toBeTruthy();
   expect(CORE_TARGET_KINDS).toContain(kind);
   expect(normalizeCoreQueueTarget({schema:2,target:{kind,id:"target-key"}}).kind).toBe(kind);
  }
 });
 it("maps app tables, pointer columns, buckets and immutable paths explicitly",()=>{
  expect(resolveCoreAppImageTarget("spell-cutout")).toMatchObject({table:"rule_spells",imageColumn:"cutout_path",bucket:"alea-spell-art"});
  expect(resolveCoreAppImageTarget("skill-illustration-wide")).toMatchObject({table:"rule_skills",imageColumn:"illustration_wide_path",bucket:"alea-skill-art"});
  expect(normalizeCoreAppImageKey("skill","first-aid")).toBe("first_aid");
  expect(coreAppImagePath("spell","eld","b".repeat(64))).toBe(`hermes/core/spell/eld/${"b".repeat(64)}.webp`);
 });
 it("publishes through each configured target's own pointer using compare-and-set",async()=>{
  for(const kind of CORE_APP_IMAGE_KINDS){
   const profile=resolveCoreAppImageTarget(kind),id="target-key",lookup=normalizeCoreAppImageKey(kind,id);
   const row={id:"d1a0ca88-7023-4bd9-8b2c-0c49bdb8c90e",[profile.lookupColumn]:lookup,[profile.imageColumn]:null};
   const prepared={target:{kind,id},label:"test"};
   const adapter=createCoreActionsTargetAdapter({db:fakeDb(profile.table,row),prepared,registryKey:"unused"});
   const before=await adapter.readTarget(prepared.target);
   const path=coreAppImagePath(kind,id,"c".repeat(64));
   const result=await adapter.activate(prepared.target,before.revision,before.key,{path},false);
   expect(row[profile.imageColumn]).toBe(path);
   expect(result.key).toBe(path);
  }
 });
 it("rejects unknown target kinds and unsafe target keys",()=>{
  expect(resolveCoreAppImageTarget("arbitrary-table")).toBeNull();
  expect(()=>normalizeCoreQueueTarget({schema:2,target:{kind:"unknown",id:"x"}})).toThrow("CORE_TARGET_KIND_UNSUPPORTED");
  expect(()=>normalizeCoreQueueTarget({schema:2,target:{kind:"spell",id:"../unsafe"}})).toThrow("INVALID_CORE_TARGET_ID");
 });
});
