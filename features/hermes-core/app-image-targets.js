// Declarative HERMES CORE profiles are shared with the Python preparation step.
import contract from "./contract.json" with {type: "json"};

const PROFILES = contract.profiles;
export const LEGACY_KIND_PROFILES = Object.freeze(contract.legacy_kind_profiles);
const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validKey(target, value) {
  return target.key_pattern === "uuid" ? UUID.test(value) : SLUG.test(value) && !UUID.test(value);
}

function imageUuidFromSha256(sha256) {
  const hex = sha256.slice(0, 32).split("");
  // UUIDv8 gives a stable RFC 9562-shaped identifier derived from the content hash.
  hex[12] = "8";
  hex[16] = (Number.parseInt(hex[16], 16) & 0x3 | 0x8).toString(16);
  const compact = hex.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export function resolveCoreImageProfile(profileId) {
  if (typeof profileId !== "string" || !Object.hasOwn(PROFILES, profileId)) return null;
  const profile = PROFILES[profileId];
  const adapter = contract.adapters[profile.adapter];
  if (!adapter) throw new Error("CORE_PROFILE_ADAPTER_MISSING");
  const conditions={
    required_row_values:{...(profile.required_row_values??{}),...(adapter.required_row_values??{})},
    required_null_columns:[...new Set([...(adapter.required_null_columns??[]),...(profile.required_null_columns??[])])],
    guard_columns:[...new Set([...(adapter.guard_columns??[]),...(profile.guard_columns??[])])],
  };
  return Object.freeze({
    profile_id: profileId, ...profile, ...adapter, ...conditions,
    lookupColumn: adapter.lookup_column,
    imageColumn: adapter.image_column,
    normalizeKey: adapter.normalize_key === "hyphen-to-underscore",
  });
}

export function resolveCoreAppImageTarget(kind, profileId) {
  if (kind === "app-image") {
    const profile = resolveCoreImageProfile(profileId);
    return profile?.kind === "app-image" ? profile : null;
  }
  const legacyProfileId = LEGACY_KIND_PROFILES[kind];
  if (!legacyProfileId || (profileId && profileId !== legacyProfileId)) return null;
  const profile = resolveCoreImageProfile(legacyProfileId);
  return profile?.kind === "app-image" ? profile : null;
}

export const CORE_APP_IMAGE_KINDS = Object.freeze(Object.keys(LEGACY_KIND_PROFILES));
export const CORE_APP_IMAGE_PROFILES = Object.freeze(
  Object.keys(PROFILES).filter((id) => resolveCoreImageProfile(id)?.kind === "app-image"),
);

export function normalizeCoreAppImageKey(kind, key, profileId) {
  const target = resolveCoreAppImageTarget(kind, profileId);
  if (!target) throw new Error("CORE_APP_IMAGE_PROFILE_UNSUPPORTED");
  if (typeof key !== "string" || !validKey(target, key)) throw new Error("INVALID_CORE_APP_IMAGE_KEY");
  return target.normalize_key === "hyphen-to-underscore" ? key.replaceAll("-", "_") : key;
}

export function coreAppImagePath(profileId, key, sha256, row = {}) {
  profileId = Object.hasOwn(PROFILES, profileId) ? profileId : LEGACY_KIND_PROFILES[profileId];
  const profile = resolveCoreImageProfile(profileId);
  if (!profile || typeof key !== "string" ||
      !validKey(profile, key) || !/^[a-f0-9]{64}$/.test(sha256 || "")) {
    throw new Error("INVALID_CORE_APP_IMAGE_PATH");
  }
  const segment = profile.path_segment || profileId;
  const template = profile.path_template || `hermes/core/${segment}/{id}/{sha256}.webp`;
  const allowedColumns = new Set(profile.path_columns || []);
  return template.replace(/\{([a-z0-9_]+)\}/g, (_match, token) => {
    if (token === "id") return key;
    if (token === "sha256") return sha256;
    if (token === "image_uuid") return imageUuidFromSha256(sha256);
    if (!allowedColumns.has(token) || typeof row[token] !== "string" || !UUID.test(row[token])) {
      throw new Error("CORE_APP_IMAGE_PATH_CONTEXT_MISSING");
    }
    return row[token];
  });
}
