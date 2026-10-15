import { cp, readdir, mkdir, copyFile } from "node:fs/promises";
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
    copyStaticTree("alea-copy-committed-round-art", "assets/combat/round", "assets/combat/round"),
    {
      name: "alea-copy-arcane-ivory-webp",
      apply: "build",
      async closeBundle() {
        const from = resolve("assets/spells/arcane-ivory");
        const to = resolve("dist/assets/spells/arcane-ivory");
        await mkdir(to, { recursive: true });
        for (const file of await readdir(from)) {
          if (/^[a-z0-9-]+\.webp$/.test(file) || file === "manifest.json") {
            await copyFile(resolve(from, file), resolve(to, file));
          }
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
