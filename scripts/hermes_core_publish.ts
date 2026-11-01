/** HERMES CORE developer publisher. Runs only in trusted GitHub Actions. */
import {resolveHermesPublicationEnvironment} from "./hermes_publication_environment.js";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {createHermesCore} from "../features/hermes-core/core.js";
import {createCoreActionsTargetAdapter} from "../features/hermes-core/actions-target-adapter.js";
import {createCoreSystemReservation} from "../features/hermes-core/system-reservation.js";

const [outputDir] = Deno.args;
const repository = Deno.env.get("GITHUB_REPOSITORY") || "";
const ref = Deno.env.get("GITHUB_REF") || "";
const targetEnv = Deno.env.get("HERMES_TARGET_ENV") || "";
const url = Deno.env.get("SUPABASE_URL") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const environment = resolveHermesPublicationEnvironment({repository, ref, targetEnv, url});
if (!outputDir || !secret) throw new Error("CORE_PUBLISH_INPUT_MISSING");

const prepared = JSON.parse(await Deno.readTextFile(`${outputDir}/prepared.json`));
const targetKind = prepared.target?.kind ?? "system";
if (!["system","honor-definition","honor-relief"].includes(targetKind)) throw new Error("INVALID_CORE_TARGET");
const originalBytes = await Deno.readFile(`${outputDir}/${prepared.source_file}`);
const webpBytes = await Deno.readFile(`${outputDir}/${prepared.webp_file}`);
const source = new Blob([originalBytes], {type: prepared.source_mime});
const webp = new Blob([webpBytes], {type: "image/webp"});
const db = createClient(url, secret, {auth: {persistSession: false}});
const reserveSystem = createCoreSystemReservation();
const registryKey = targetKind === "system" ? (prepared.target?.id ?? prepared.asset_key)
  : "arcane-" + targetKind + "-" + prepared.target.id + "-" + prepared.webp_sha256.slice(0,16);
const reserveAsset = async ({metadata}: any) => reserveSystem({target:{kind:"system",id:registryKey},metadata});
const bucket = "alea-hermes-public";
const {readTarget, activate} = createCoreActionsTargetAdapter({db,prepared,registryKey});

function hex(bytes: Uint8Array) {
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", copy)));
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
const publication = {
  schema: "hermes-core-publication/v1",
  environment,
  asset_key: registryKey,
  archive_file_id: prepared.archive_file_id,
  olympia_item_id: prepared.olympia_item_id ?? null,
  source_pr_number: prepared.source_pr_number ?? null,
  source_dev_sha: prepared.source_dev_sha ?? null,
  target,
  image_reference: result.activation.key,
  path: `hermes/system-asset/${registryKey}/${prepared.webp_sha256}.webp`,
  webp_sha256: prepared.webp_sha256,
  webp_bytes: prepared.webp_bytes,
  width: prepared.width,
  height: prepared.height,
  alpha: prepared.alpha_preserved,
  status: "verified",
};
await Deno.writeTextFile(`${outputDir}/publication.json`, JSON.stringify(publication, null, 2) + "\n");
console.log("HERMES_CORE_ACTIVE", JSON.stringify(publication));
