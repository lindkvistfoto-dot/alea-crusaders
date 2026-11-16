export const CLEANUP_LIVE_PROJECT = "wbmosmkirsitkonejzpg";
export const CLEANUP_BUCKET = "alea-hermes-public";
export const CLEANUP_SCHEMA = "hermes-asset-cleanup/v1";

const HEX_256 = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fail(code) { throw new Error(code); }

function validateIdentity(value, projectRef) {
  if (!value || typeof value !== "object") fail("CLEANUP_IDENTITY_REQUIRED");
  const expectedKeys="asset_key,bucket,bytes,image_revision,object_path,project_ref,registry_row_id,sha256,storage_object_id";
  if (Object.keys(value).sort().join(",") !== expectedKeys) fail("CLEANUP_IDENTITY_INVALID");
  const identity = {
    project_ref: value.project_ref,
    bucket: value.bucket,
    asset_key: value.asset_key,
    object_path: value.object_path,
    storage_object_id: value.storage_object_id,
    registry_row_id: value.registry_row_id,
    sha256: value.sha256,
    bytes: value.bytes,
    image_revision: value.image_revision,
  };
  if (identity.project_ref !== CLEANUP_LIVE_PROJECT || identity.project_ref !== projectRef)
    fail("CLEANUP_PROJECT_MISMATCH");
  if (identity.bucket !== CLEANUP_BUCKET) fail("CLEANUP_BUCKET_MISMATCH");
  if (!KEY.test(identity.asset_key || "") || !HEX_256.test(identity.sha256 || ""))
    fail("CLEANUP_IDENTITY_INVALID");
  if (identity.object_path !== `hermes/system-asset/${identity.asset_key}/${identity.sha256}.webp`)
    fail("CLEANUP_PATH_MISMATCH");
  if (typeof identity.storage_object_id !== "string" || !identity.storage_object_id ||
      typeof identity.registry_row_id !== "string" || !identity.registry_row_id ||
      !Number.isSafeInteger(identity.bytes) || identity.bytes <= 0 ||
      !Number.isSafeInteger(identity.image_revision) || identity.image_revision < 0)
    fail("CLEANUP_IDENTITY_INVALID");
  return identity;
}

function canonicalIdentity(identity) {
  return JSON.stringify({
    schema: CLEANUP_SCHEMA,
    project_ref: identity.project_ref,
    bucket: identity.bucket,
    asset_key: identity.asset_key,
    object_path: identity.object_path,
    storage_object_id: identity.storage_object_id,
    registry_row_id: identity.registry_row_id,
    sha256: identity.sha256,
    bytes: identity.bytes,
    image_revision: identity.image_revision,
  });
}

async function digest(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalPlan(identity, expiresAt) {
  return JSON.stringify({identity:JSON.parse(canonicalIdentity(identity)),expires_at:expiresAt});
}

function matchRegistry(row, identity) {
  if (!row || row.id !== identity.registry_row_id || row.asset_key !== identity.asset_key ||
      row.asset_path !== identity.object_path || row.app_sha256 !== identity.sha256 ||
      Number(row.app_bytes) !== identity.bytes || Number(row.image_revision) !== identity.image_revision)
    fail("CLEANUP_REGISTRY_CHANGED");
}

function matchStorage(object, identity) {
  if (!object || object.id !== identity.storage_object_id || object.bucket !== identity.bucket ||
      object.path !== identity.object_path || object.sha256 !== identity.sha256 ||
      Number(object.bytes) !== identity.bytes || object.mime_type !== "image/webp")
    fail("CLEANUP_STORAGE_CHANGED");
}

function assertNoReferences(references) {
  if (!Array.isArray(references)) fail("CLEANUP_REFERENCE_SCAN_FAILED");
  if (references.length) fail("CLEANUP_REFERENCED");
}

/**
 * HERMES CORE's exact-object cleanup protocol. Adapters are server-side only;
 * this module never accepts SQL, table names, Storage paths, or environments
 * from a caller beyond the single, fully identified LIVE object tuple.
 */
export function createHermesAssetCleanup({ projectRef, targetEnv, registry, storage, references, now = () => Date.now() }) {
  if (projectRef !== CLEANUP_LIVE_PROJECT || targetEnv !== "LIVE") fail("CLEANUP_LIVE_ONLY");
  for (const [name, adapter] of Object.entries({ registry, storage, references }))
    if (!adapter || typeof adapter !== "object") throw new TypeError(`Missing cleanup adapter: ${name}`);

  async function snapshot(identity) {
    const [row, object, refs] = await Promise.all([
      registry.read(identity.asset_key),
      storage.inspect(identity.bucket, identity.object_path),
      references.find(identity.asset_key, identity.object_path),
    ]);
    if (row) matchRegistry(row, identity);
    if (object) matchStorage(object, identity);
    return { row, object, refs };
  }

  async function preflight(request) {
    if (!request || request.schema !== CLEANUP_SCHEMA || request.action !== "dry_run")
      fail("CLEANUP_DRY_RUN_REQUIRED");
    if (Object.keys(request).sort().join(",") !== "action,identity,schema") fail("CLEANUP_DRY_RUN_REQUIRED");
    const identity = validateIdentity(request.identity, projectRef);
    const { row, object, refs } = await snapshot(identity);
    if (!row) fail("CLEANUP_REGISTRY_MISSING");
    if (!object) fail("CLEANUP_STORAGE_MISSING");
    if (refs.length) return {schema:CLEANUP_SCHEMA,status:"blocked_references",identity,references:refs,delete_api_invoked:false};
    const expiresAt = new Date(now() + 10 * 60 * 1000).toISOString();
    return {
      schema: CLEANUP_SCHEMA,
      status: "dry_run_clear",
      identity,
      expires_at: expiresAt,
      plan_sha256: await digest(canonicalPlan(identity,expiresAt)),
      delete_api_invoked: false,
    };
  }

  async function execute(request, approval, approvedBy) {
    if (!request || request.schema !== CLEANUP_SCHEMA || request.action !== "delete")
      fail("CLEANUP_DELETE_REQUEST_REQUIRED");
    if (Object.keys(request).sort().join(",") !== "action,approval,identity,schema") fail("CLEANUP_DELETE_REQUEST_REQUIRED");
    const identity = validateIdentity(request.identity, projectRef);
    const approvedIdentity = approval?.identity && validateIdentity(approval.identity, projectRef);
    const expiresAt = Date.parse(approval?.expires_at ?? "");
    if (!approval || approval.schema !== CLEANUP_SCHEMA ||
        Object.keys(approval).sort().join(",") !== "expires_at,identity,plan_sha256,schema" ||
        !Number.isFinite(expiresAt) || now() >= expiresAt ||
        approval.plan_sha256 !== await digest(canonicalPlan(identity,approval.expires_at)) ||
        !approvedIdentity || canonicalIdentity(approvedIdentity) !== canonicalIdentity(identity) ||
        approvedBy !== "lindkvistfoto-dot")
      fail("CLEANUP_APPROVAL_MISMATCH");

    let { row, object, refs } = await snapshot(identity);
    assertNoReferences(refs);
    if (!row && !object) return { schema: CLEANUP_SCHEMA, status: "already_absent", identity, delete_api_invoked: false };
    if (!row) fail("CLEANUP_REGISTRY_MISSING");

    let deleteApiInvoked = false;
    if (object) {
      deleteApiInvoked = true;
      try {
        await storage.remove(identity.bucket, identity.object_path);
      } catch (error) {
        // An interrupted response is ambiguous. Reconcile by exact path and
        // object ID; never repeat the DELETE blindly in the same invocation.
        const afterError = await storage.inspect(identity.bucket, identity.object_path);
        if (afterError) matchStorage(afterError, identity);
        else object = null;
        if (object) throw new Error("CLEANUP_STORAGE_OUTCOME_UNKNOWN", { cause: error });
      }
      const afterDelete = await storage.inspect(identity.bucket, identity.object_path);
      if (afterDelete) {
        matchStorage(afterDelete, identity);
        fail("CLEANUP_STORAGE_DELETE_NOT_VERIFIED");
      }
    }

    // Storage is confirmed absent before conditionally removing only the row
    // whose complete identity and revision were approved.
    let removed = false;
    try {
      removed = await registry.deleteIfUnchanged(identity);
    } catch (error) {
      // PostgREST may commit but lose its response. Read the exact key back
      // before deciding whether the operation needs manual reconciliation.
      if (await registry.read(identity.asset_key))
        throw new Error("CLEANUP_REGISTRY_OUTCOME_UNKNOWN", { cause: error });
      removed = true;
    }
    if (!removed && await registry.read(identity.asset_key)) fail("CLEANUP_REGISTRY_CONCURRENT_CHANGE");
    const [remainingRow, remainingObject, remainingRefs] = await Promise.all([
      registry.read(identity.asset_key),
      storage.inspect(identity.bucket, identity.object_path),
      references.find(identity.asset_key, identity.object_path),
    ]);
    if (remainingRow || remainingObject) fail("CLEANUP_DELETE_READBACK_FAILED");
    assertNoReferences(remainingRefs);
    return {
      schema: CLEANUP_SCHEMA,
      status: "deleted_verified_absent",
      identity,
      delete_api_invoked: deleteApiInvoked,
    };
  }

  return { preflight, execute };
}
