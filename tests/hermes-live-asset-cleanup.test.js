import { describe, it, expect, vi } from "vitest";
import {
  createHermesAssetCleanup,
  CLEANUP_LIVE_PROJECT,
  CLEANUP_BUCKET,
  CLEANUP_SCHEMA,
} from "../features/hermes-core/asset-cleanup-live.js";
import { routeChangedPaths } from "../scripts/hermes_core_workflow_paths_live.mjs";

const assetKey = "arcane-hermes-core-live-pilot-20261105";
const sha256 = "9a6e0d0f11eaae66b702859d46a9f6a01559d62ae6c80afa19d060213af8341b";
const identity = {
  project_ref: CLEANUP_LIVE_PROJECT,
  bucket: CLEANUP_BUCKET,
  asset_key: assetKey,
  object_path: `hermes/system-asset/${assetKey}/${sha256}.webp`,
  storage_object_id: "495f658d-0aa8-42ab-af84-d5b2a1d167f9",
  registry_row_id: "ac8dd8a2-fa0b-48c3-9a40-eea204d298f0",
  sha256,
  bytes: 3142,
  image_revision: 0,
};

function fixture({ references = [], now = () => Date.now() } = {}) {
  let row = {
    id: identity.registry_row_id, asset_key: assetKey, asset_path: identity.object_path,
    app_sha256: sha256, app_bytes: identity.bytes, image_revision: identity.image_revision,
  };
  let object = {
    id: identity.storage_object_id, bucket: CLEANUP_BUCKET, path: identity.object_path,
    sha256, bytes: identity.bytes, mime_type: "image/webp",
  };
  const registry = {
    read: vi.fn(async () => row),
    deleteIfUnchanged: vi.fn(async expected => {
      if (!row || row.id !== expected.registry_row_id) return false;
      row = null;
      return true;
    }),
  };
  const storage = {
    inspect: vi.fn(async () => object),
    remove: vi.fn(async (_bucket, path) => {
      if (path !== identity.object_path) throw new Error("wrong path");
      object = null;
    }),
  };
  const referenceScanner = { find: vi.fn(async () => references) };
  const cleanup = createHermesAssetCleanup({
    projectRef: CLEANUP_LIVE_PROJECT, targetEnv: "LIVE",
    registry, storage, references: referenceScanner, now,
  });
  return { cleanup, registry, storage, referenceScanner };
}

const dryRun = { schema: CLEANUP_SCHEMA, action: "dry_run", identity };

describe("HERMES CORE LIVE asset cleanup", () => {
  it("routes only LIVE cleanup requests to asset-cleanup", () => {
    expect(routeChangedPaths(["hermes/core/cleanup/live/pilot.json"]))
      .toEqual({ publish: false, asset_cleanup: true });
  });

  it("routes normal CORE publication requests only to publish", () => {
    expect(routeChangedPaths(["hermes/core/queue/pilot.json"]))
      .toEqual({ publish: true, asset_cleanup: false });
  });

  it("creates an exact LIVE dry-run plan without invoking deletion", async () => {
    const f = fixture();
    const result = await f.cleanup.preflight(dryRun);
    expect(result.status).toBe("dry_run_clear");
    expect(result.identity).toEqual(identity);
    expect(result.plan_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(f.storage.remove).not.toHaveBeenCalled();
    expect(f.registry.deleteIfUnchanged).not.toHaveBeenCalled();
  });

  it("rejects DEV or any other project before adapters can run", () => {
    const adapters = { registry: {}, storage: {}, references: {} };
    expect(() => createHermesAssetCleanup({
      projectRef: "wkiuyklzzroavclnsxna", targetEnv: "LIVE", ...adapters,
    })).toThrow("CLEANUP_LIVE_ONLY");
    expect(() => createHermesAssetCleanup({
      projectRef: CLEANUP_LIVE_PROJECT, targetEnv: "DEV", ...adapters,
    })).toThrow("CLEANUP_LIVE_ONLY");
  });

  it("blocks references and never invokes deletion", async () => {
    const f = fixture({ references: [{ source: "honor_definitions.image_asset_id", id: "honor-1" }] });
    const result = await f.cleanup.preflight(dryRun);
    expect(result.status).toBe("blocked_references");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });

  it("deletes only the approved exact path after a current valid plan", async () => {
    const f = fixture();
    const plan = await f.cleanup.preflight(dryRun);
    const approval = {
      schema: CLEANUP_SCHEMA, identity: plan.identity,
      expires_at: plan.expires_at, plan_sha256: plan.plan_sha256,
    };
    const request = { schema: CLEANUP_SCHEMA, action: "delete", identity, approval };
    const result = await f.cleanup.execute(request, approval, "lindkvistfoto-dot");
    expect(result.status).toBe("deleted_verified_absent");
    expect(result.delete_api_invoked).toBe(true);
    expect(f.storage.remove).toHaveBeenCalledTimes(1);
    expect(f.storage.remove).toHaveBeenCalledWith(CLEANUP_BUCKET, identity.object_path);
    expect(f.registry.deleteIfUnchanged).toHaveBeenCalledWith(identity);
  });

  it("rejects an expired plan before deletion", async () => {
    let clock = Date.now();
    const f = fixture({ now: () => clock });
    const plan = await f.cleanup.preflight(dryRun);
    const approval = {
      schema: CLEANUP_SCHEMA, identity: plan.identity,
      expires_at: plan.expires_at, plan_sha256: plan.plan_sha256,
    };
    clock += 10 * 60 * 1000;
    await expect(f.cleanup.execute(
      { schema: CLEANUP_SCHEMA, action: "delete", identity, approval },
      approval, "lindkvistfoto-dot",
    )).rejects.toThrow("CLEANUP_APPROVAL_MISMATCH");
    expect(f.storage.remove).not.toHaveBeenCalled();
  });
});
