// Declarative HERMES CORE profiles are shared with the Python preparation step.
import contract from "./contract.json" with {type: "json"};

const PROFILES = contract.profiles;
export const LEGACY_KIND_PROFILES = Object.freeze(contract.legacy_kind_profiles);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function resolveCoreImageProfile(profileId) {
  if (typeof profileId !== "string" || !Object.hasOwn(PROFILES, profileId)) return null;
  const profile = PROFILES[profileId];
  const adapter = contract.adapters[profile.adapter];
  if (!adapter) throw new Error("CORE_PROFILE_ADAPTER_MISSING");
  return Object.freeze({
    profile_id: profileId, ...profile, ...adapter,
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
  if (typeof key !== "string" || !SLUG.test(key)) throw new Error("INVALID_CORE_APP_IMAGE_KEY");
  return target.normalize_key === "hyphen-to-underscore" ? key.replaceAll("-", "_") : key;
}

export function coreAppImagePath(profileId, key, sha256) {
  profileId = Object.hasOwn(PROFILES, profileId) ? profileId : LEGACY_KIND_PROFILES[profileId];
  if (!resolveCoreImageProfile(profileId) || typeof key !== "string" ||
      !SLUG.test(key) || !/^[a-f0-9]{64}$/.test(sha256 || "")) {
    throw new Error("INVALID_CORE_APP_IMAGE_PATH");
  }
  const template = resolveCoreImageProfile(profileId).path_template || `hermes/core/${profileId}/{id}/{sha256}.webp`;
  return template.replace("{id}", key).replace("{sha256}", sha256);
}
