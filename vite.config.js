import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function copyStaticTree(name, from, to) {
  return {
    name,
    apply: "build",
    async closeBundle() {
      await cp(resolve(from), resolve("dist", to), { recursive: true });
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    copyStaticTree("alea-copy-legacy", "legacy", "legacy"),
    copyStaticTree("alea-copy-features", "features", "features"),
    copyStaticTree("alea-copy-dice-assets", "alea-dicebox-assets-v1.1.4", "alea-dicebox-assets-v1.1.4"),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
