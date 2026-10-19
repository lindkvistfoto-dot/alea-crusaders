/** Small fail-closed rules shared by the HERMES publisher and profile tests. */
export function assertSpellCutoutWritable(existingPath: string | null | undefined, intendedPath: string): void {
  if (existingPath && existingPath !== intendedPath) {
    throw new Error("EXISTING_CUTOUT_PROTECTED");
  }
}
