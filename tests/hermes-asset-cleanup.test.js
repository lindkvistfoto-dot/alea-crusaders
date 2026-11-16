import {describe,it,expect,vi} from "vitest";
import {createHermesAssetCleanup,CLEANUP_DEV_PROJECT,CLEANUP_BUCKET,CLEANUP_SCHEMA} from "../features/hermes-core/asset-cleanup.js";

const assetKey="arcane-hermes-core-cleanup-test-20261116";
const sha256="9a6e0d0f11eaae66b702859d46a9f6a01559d62ae6c80afa19d060213af8341b";
const identity={
  project_ref:CLEANUP_DEV_PROJECT,
  bucket:CLEANUP_BUCKET,
  asset_key:assetKey,
  object_path:`hermes/system-asset/${assetKey}/${sha256}.webp`,
  storage_object_id:"1d692adb-2dc1-45fd-b2ae-8f8de96e1280",
  registry_row_id:"2dba9c27-7885-4672-bce5-03e34d7c8112",
  sha256,bytes:3142,image_revision:0,
};

function fixture({references=[],removeMode="success",registryDeleteMode="success",revision=0,now=()=>Date.now()}={}) {
  let row={id:identity.registry_row_id,asset_key:assetKey,asset_path:identity.object_path,
    app_sha256:sha256,app_bytes:identity.bytes,image_revision:revision};
  let object={id:identity.storage_object_id,bucket:CLEANUP_BUCKET,path:identity.object_path,
    sha256,bytes:identity.bytes,mime_type:"image/webp"};
  let deleted=false;
  const registry={
    read:vi.fn(async key=>key===assetKey?row:null),
    deleteIfUnchanged:vi.fn(async expected=>{
      if(registryDeleteMode==="throw-after-delete"){row=null;throw new Error("transport lost after delete");}
      if(!row||row.id!==expected.registry_row_id||row.image_revision!==expected.image_revision)return false;
      row=null;return true;
    }),
  };
  const storage={
    inspect:vi.fn(async (_bucket,path)=>path===identity.object_path?object:null),
    remove:vi.fn(async (_bucket,path)=>{
      if(path!==identity.object_path)throw new Error("wrong path");
      if(removeMode==="throw-before")throw new Error("network error");
      object=null;deleted=true;
      if(removeMode==="throw-after")throw new Error("response lost");
    }),
  };
  const referenceScanner={find:vi.fn(async()=>references)};
  const cleanup=createHermesAssetCleanup({projectRef:CLEANUP_DEV_PROJECT,targetEnv:"DEV",registry,storage,references:referenceScanner,now});
  return {cleanup,registry,storage,referenceScanner,get row(){return row;},get object(){return object;},get deleted(){return deleted;},mutateStorage(change){object={...object,...change};}};
}

const dryRun={schema:CLEANUP_SCHEMA,action:"dry_run",identity};

async function approvalFor(cleanup) {
  const plan=await cleanup.preflight(dryRun);
  return {schema:CLEANUP_SCHEMA,identity:plan.identity,expires_at:plan.expires_at,plan_sha256:plan.plan_sha256};
}

describe("HERMES CORE asset cleanup",()=>{
  it("returns an exact dry-run plan without invoking deletion",async()=>{
    const f=fixture();
    const result=await f.cleanup.preflight(dryRun);
    expect(result.status).toBe("dry_run_clear");
    expect(result.identity).toEqual(identity);
    expect(result.plan_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(f.storage.remove).not.toHaveBeenCalled();
    expect(f.registry.deleteIfUnchanged).not.toHaveBeenCalled();
  });

  it("refuses a wrong project before reading or deleting",()=>{
    expect(()=>createHermesAssetCleanup({projectRef:"wbmosmkirsitkonejzpg",targetEnv:"LIVE",registry:{},storage:{},references:{}}))
      .toThrow("CLEANUP_DEV_ONLY");
  });

  it("fails closed when the approved hash or revision changed",async()=>{
    const f=fixture();
    const approval=await approvalFor(f.cleanup);
    const changedSha="0".repeat(64);
    const changed={...identity,sha256:changedSha,object_path:`hermes/system-asset/${assetKey}/${changedSha}.webp`};
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity:changed,approval},approval,"lindkvistfoto-dot"))
      .rejects.toThrow("CLEANUP_APPROVAL_MISMATCH");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("refuses changed object bytes after the dry-run",async()=>{
    const f=fixture();
    const approval=await approvalFor(f.cleanup);
    f.mutateStorage({sha256:"0".repeat(64)});
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot"))
      .rejects.toThrow("CLEANUP_STORAGE_CHANGED");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("fails closed when the registry revision changed after the dry-run",async()=>{
    const f=fixture({revision:1});
    await expect(f.cleanup.preflight(dryRun)).rejects.toThrow("CLEANUP_REGISTRY_CHANGED");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("requires the Zeus GitHub actor for the delete step",async()=>{
    const f=fixture();
    const approval=await approvalFor(f.cleanup);
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"openai[bot]"))
      .rejects.toThrow("CLEANUP_APPROVAL_MISMATCH");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("rejects an expired dry-run approval",async()=>{
    let clock=Date.now();
    const f=fixture({now:()=>clock});
    const approval=await approvalFor(f.cleanup);
    clock+=11*60*1000;
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot"))
      .rejects.toThrow("CLEANUP_APPROVAL_MISMATCH");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("refuses active or historical references",async()=>{
    const f=fixture({references:[{source:"honor_definitions.image_asset_id",id:"honor-1",state:"active"}]});
    const result=await f.cleanup.preflight(dryRun);
    expect(result.status).toBe("blocked_references");
    expect(result.references[0].state).toBe("active");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("rechecks references after the dry-run and refuses a concurrent new reference",async()=>{
    const references=[];
    const f=fixture({references});
    const approval=await approvalFor(f.cleanup);
    references.push({source:"honor_relief_variants.image_asset_id",id:"relief-2",state:"draft"});
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot"))
      .rejects.toThrow("CLEANUP_REFERENCED");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("removes one exact Storage object before its conditional registry row",async()=>{
    const f=fixture();
    const approval=await approvalFor(f.cleanup);
    const result=await f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot");
    expect(result.status).toBe("deleted_verified_absent");
    expect(f.storage.remove).toHaveBeenCalledTimes(1);
    expect(f.storage.remove).toHaveBeenCalledWith(CLEANUP_BUCKET,identity.object_path);
    expect(f.registry.deleteIfUnchanged).toHaveBeenCalledTimes(1);
    expect(f.registry.deleteIfUnchanged).toHaveBeenCalledWith(identity);
    expect(f.row).toBeNull();
    expect(f.object).toBeNull();
  });

  it("reconciles an ambiguous Storage response without a blind second DELETE",async()=>{
    const f=fixture({removeMode:"throw-after"});
    const approval=await approvalFor(f.cleanup);
    const result=await f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot");
    expect(result.status).toBe("deleted_verified_absent");
    expect(f.storage.remove).toHaveBeenCalledTimes(1);
    expect(f.registry.deleteIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it("keeps registry metadata when the Storage result remains unknown",async()=>{
    const f=fixture({removeMode:"throw-before"});
    const approval=await approvalFor(f.cleanup);
    await expect(f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot"))
      .rejects.toThrow("CLEANUP_STORAGE_OUTCOME_UNKNOWN");
    expect(f.registry.deleteIfUnchanged).not.toHaveBeenCalled();
    expect(f.row).not.toBeNull();
  });

  it("recovers after Storage deletion when registry cleanup had a lost response",async()=>{
    const f=fixture({registryDeleteMode:"throw-after-delete"});
    const approval=await approvalFor(f.cleanup);
    const result=await f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot");
    expect(result.status).toBe("deleted_verified_absent");
    expect(f.storage.remove).toHaveBeenCalledTimes(1);
    expect(f.row).toBeNull();
  });

  it("treats a repeated, approved call as idempotent",async()=>{
    const f=fixture();
    const approval=await approvalFor(f.cleanup);
    await f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot");
    const result=await f.cleanup.execute({schema:CLEANUP_SCHEMA,action:"delete",identity,approval},approval,"lindkvistfoto-dot");
    expect(result.status).toBe("already_absent");
    expect(f.storage.remove).toHaveBeenCalledTimes(1);
  });
});
