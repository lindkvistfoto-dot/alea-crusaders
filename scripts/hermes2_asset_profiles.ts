/** Small fail-closed rules shared by the HERMES publisher and profile tests. */
import systemAssets from "../config/hermes-system-assets.json" with { type: "json" };

export function maybeSystemAssetProfile(key: string) {
  const assets = systemAssets.assets;
  return Object.hasOwn(assets, key) ? assets[key as keyof typeof assets] : null;
}

export function systemAssetLabel(key: string): string {
  const profile = maybeSystemAssetProfile(key);
  return profile?.label ?? key.split("-").slice(1).map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function systemAssetProfile(key: string) {
  const assets = systemAssets.assets;
  if (!Object.hasOwn(assets, key)) throw new Error("UNKNOWN_SYSTEM_ASSET_KEY");
  return assets[key as keyof typeof assets];
}

export function assertSpellCutoutWritable(existingPath: string | null | undefined, intendedPath: string): void {
  if (existingPath && existingPath !== intendedPath) {
    throw new Error("EXISTING_CUTOUT_PROTECTED");
  }
}
