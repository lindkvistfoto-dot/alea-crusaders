/** Small fail-closed rules shared by the HERMES publisher and profile tests. */
import systemAssets from "../config/hermes-system-assets.json" with { type: "json" };

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
