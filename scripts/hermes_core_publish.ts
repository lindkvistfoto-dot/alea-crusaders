/** HERMES CORE developer publisher. Runs only in trusted GitHub Actions. */
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {createHermesCore} from "../features/hermes-core/core.js";
import {createCoreSystemReservation} from "../features/hermes-core/system-reservation.js";

const [outputDir] = Deno.args;
const repository = Deno.env.get("GITHUB_REPOSITORY") || "";
const ref = Deno.env.get("GITHUB_REF") || "";
const url = Deno.env.get("SUPABASE_URL") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (repository !== "lindkvistfoto-dot/alea-crusaders" || ref !== "refs/heads/main") {
  throw new Error("UNTRUSTED_CORE_ACTION");
}
if (!outputDir || !url || !secret) throw new Error("CORE_PUBLISH_INPUT_MISSING");

const prepared = JSON.parse(await Deno.readTextFile(`${outputDir}/prepared.json`));
const targetKind = prepared.target?.kind ?? "system";
if (!["system","honor-definition","honor-relief"].includes(targetKind)) throw new Error("INVALID_CORE_TARGET");
const originalBytes = await Deno.readFile(`${outputDir}/${prepared.source_file}`);
const webpBytes = await Deno.readFile(`${outputDir}/${prepared.webp_file}`);
const source = new Blob([originalBytes], {type: prepared.source_mime});
const webp = new Blob([webpBytes], {type: "image/webp"});
const db = createClient(url, secret, {auth: {persistSession: false}});
const reserveSystem = createCoreSystemReservation();
const honorTable = targetKind === "honor-definition" ? "honor_definitions" : "honor_relief_variants";
const registryKey = targetKind === "system" ? (prepared.target?.id ?? prepared.asset_key)
  : "arcane-" + targetKind + "-" + prepared.target.id + "-" + prepared.webp_sha256.slice(0,16);
const reserveAsset = async ({metadata}: any) => reserveSystem({target:{kind:"system",id:registryKey},metadata});
const bucket = "alea-hermes-public";

function hex(bytes: Uint8Array) {
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", copy)));
}

function dbMetadata(metadata: any) {
  return {
    asset_path: metadata.path,
    app_sha256: metadata.sha256,
    app_bytes: metadata.bytes,
    width: metadata.width,
    height: metadata.height,
    alpha_preserved: metadata.alphaPreserved,
  };
}

async function readTarget(target: any) {
  if (targetKind !== "system") {
    const {data,error} = await db.from(honorTable).select("id,image_asset_id,image_revision,material").eq("id",target.id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("HONOR_TARGET_NOT_FOUND");
    if(targetKind==="honor-relief" && prepared.target.material !== data.material) throw new Error("RELIEF_MATERIAL_MISMATCH");
    return {key:data.image_asset_id??null,revision:Number(data.image_revision??0),row:data};
  }
  const {data, error} = await db.from("arcane_system_assets")
    .select("id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision")
    .eq("asset_key", target.id).maybeSingle();
  if (error) throw error;
  return data ? {key: data.asset_path ?? null, revision: Number(data.image_revision ?? 0), row: data} : null;
}

async function publishWebP({target, webp: image}: any) {
  const metadata = {
    sha256: await sha256(new Uint8Array(await image.arrayBuffer())),
    bytes: image.size,
    width: prepared.width,
    height: prepared.height,
    alphaPreserved: prepared.alpha_preserved,
  };
  if (metadata.sha256 !== prepared.webp_sha256 || metadata.bytes !== prepared.webp_bytes) {
    throw new Error("WEBP_PREPARATION_MISMATCH");
  }
  const asset = await reserveAsset({target, metadata});
  const storage = db.storage.from(bucket);
  const {error: uploadError} = await storage.upload(asset.path, image, {
    contentType: "image/webp", upsert: false, cacheControl: "31536000",
  });
  if (uploadError && !/already exists|duplicate|409|resource already/i.test(uploadError.message || "")) {
    throw new Error("SUPABASE_UPLOAD_FAILED " + uploadError.message);
  }
  const {data: downloaded, error: downloadError} = await storage.download(asset.path);
  if (downloadError || !downloaded) throw new Error("SUPABASE_READBACK_FAILED");
  if (await sha256(new Uint8Array(await downloaded.arrayBuffer())) !== metadata.sha256) {
    throw new Error("SUPABASE_READBACK_HASH_MISMATCH");
  }
  const publicUrl = storage.getPublicUrl(asset.path).data?.publicUrl;
  const response = publicUrl ? await fetch(publicUrl, {cache: "no-store"}) : null;
  if (!response?.ok || await sha256(new Uint8Array(await response.arrayBuffer())) !== metadata.sha256) {
    throw new Error("SUPABASE_PUBLIC_IMAGE_READBACK_FAILED");
  }
  return {key: asset.key, verified: true, metadata};
}

async function activate(target: any, expectedRevision: number, expectedKey: string | null,
                        metadata: any, create: boolean) {
  if (targetKind !== "system") {
    if (create) throw new Error("HONOR_TARGET_MUST_EXIST");
    // Register the verified WebP as a normal system asset, then switch only the requested honor pointer.
    const {data: existing,error: lookupError} = await db.from("arcane_system_assets").select("id,asset_key,asset_path,app_sha256,image_revision").eq("asset_key",registryKey).maybeSingle();
    if(lookupError) throw lookupError;
    if (!existing) {
      const {error: insertError} = await db.from("arcane_system_assets").insert({
        id:crypto.randomUUID(),asset_key:registryKey,label:prepared.label,...dbMetadata(metadata)
      });
      if(insertError && insertError.code!=="23505") throw insertError;
    } else if(existing.asset_path!==metadata.path || existing.app_sha256!==metadata.sha256) {
      const {data: changed,error: updateError} = await db.from("arcane_system_assets")
        .update(dbMetadata(metadata)).eq("asset_key",registryKey).eq("image_revision",existing.image_revision)
        .select("id").maybeSingle();
      if(updateError || !changed) throw new Error("REGISTRY_CONCURRENT_CHANGE");
    }
    let update = db.from(honorTable).update({image_asset_id:registryKey})
      .eq("id",target.id).eq("image_revision",expectedRevision);
    update = expectedKey===null ? update.is("image_asset_id",null) : update.eq("image_asset_id",expectedKey);
    const {data,error}=await update.select("image_asset_id,image_revision").maybeSingle();
    if(error) throw error;
    if(!data) {
      const current=await readTarget(target);
      if(current.key===registryKey) return {key:registryKey,revision:current.revision};
      throw new Error("HONOR_TARGET_CONCURRENT_CHANGE");
    }
    return {key:data.image_asset_id,revision:Number(data.image_revision??0)};
  }
  const values = dbMetadata(metadata);
  if (create) {
    const {error: insertError} = await db.from("arcane_system_assets").insert({
      id: crypto.randomUUID(), asset_key: target.id, label: target.label,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }
  let query = db.from("arcane_system_assets").update(values)
    .eq("asset_key", target.id).eq("image_revision", expectedRevision);
  query = expectedKey === null ? query.is("asset_path", null) : query.eq("asset_path", expectedKey);
  const {data, error} = await query.select("asset_path,image_revision").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await readTarget(target);
    if (current && current.key === metadata.path && current.row?.app_sha256 === metadata.sha256) {
      return {key: current.key, revision: current.revision};
    }
    throw new Error("SYSTEM_IMAGE_CHANGED_DURING_PUBLICATION");
  }
  return {key: data.asset_path ?? null, revision: Number(data.image_revision ?? 0)};
}

const core = createHermesCore({
  archiveOriginal: async () => ({id: prepared.archive_file_id, verified: true}),
  convertToWebP: async () => webp,
  publishWebP,
  getTarget: readTarget,
  setTarget: ({target, expectedRevision, expectedKey, key, metadata}: any) =>
    activate(target, expectedRevision, expectedKey, {...metadata, path: key}, false),
  createTarget: ({target, key, metadata}: any) =>
    activate(target, 0, null, {...metadata, path: key}, true),
});

const target = {kind:targetKind, id:prepared.target?.id ?? prepared.asset_key,label:prepared.label};
const result = await core.add({target, file: source});
console.log("HERMES_CORE_ACTIVE", JSON.stringify({
  asset_key: registryKey,
  archive_file_id: prepared.archive_file_id,
  path: result.activation.key,
  webp_sha256: prepared.webp_sha256,
  webp_bytes: prepared.webp_bytes,
}));
