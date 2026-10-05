import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function copyDiceAssets() {
  return {
    name: "alea-copy-dice-assets",
    apply: "build",
    async closeBundle() {
      await cp(
        resolve("alea-dicebox-assets-v1.1.4"),
        resolve("dist/alea-dicebox-assets-v1.1.4"),
        { recursive: true }
      );
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [copyDiceAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
