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

const cloudflareBranch = process.env.CF_PAGES === "1" ? process.env.CF_PAGES_BRANCH : "";
const isDevelopmentBuild = cloudflareBranch ? cloudflareBranch === "development" : process.env.ALEA_BUILD_ENV === "development";
const developmentOnlyBuildPlugins = isDevelopmentBuild
  ? [
      copyStaticTree("alea-copy-olympia", "olympia", "olympia"),
      copyStaticTree("alea-copy-olympia-v2", "olympia-v2", "olympia-v2"),
      {
        name: "alea-copy-olympia-ci-validation",
        apply: "build",
        async closeBundle() {
          await mkdir(resolve("dist/olympia-v2"), { recursive: true });
          await copyFile(resolve("supabase/functions/_shared/olympia-ci.js"), resolve("dist/olympia-v2/ci-validation.js"));
        },
      },
    ]
  : [];

const liveBuildIsolationPlugins = isDevelopmentBuild
  ? []
  : [{
      name: "alea-remove-dev-only-admin-tools-from-live",
      transformIndexHtml(html) {
        return html
          .replace(/<button\b(?=[^>]*\bdata-dev-only-tool="olympia")[^>]*>[\s\S]*?<\/button>/g, "")
          .replace(/<section\b(?=[^>]*\bdata-dev-only-tool="olympia")[^>]*>[\s\S]*?<\/section>/g, "");
      },
    }];

const cloudflareDeploymentManifestPlugins = process.env.CF_PAGES === "1"
  ? [{
      name: "alea-cloudflare-deployment-manifest",
      apply: "build",
      generateBundle() {
        const branch = process.env.CF_PAGES_BRANCH || "";
        const sourceSha = process.env.CF_PAGES_COMMIT_SHA || "";
        if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("Cloudflare Pages source SHA is unavailable.");
        const environment = branch === "main" ? "main" : branch === "development" ? "development" : "preview";
        this.emitFile({
          type: "asset",
          fileName: "deployment-manifest.json",
          source: JSON.stringify({ environment, branch, source_sha: sourceSha, deployment_url: process.env.CF_PAGES_URL || "" }),
        });
      },
    }]
  : [];

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    copyStaticTree("alea-copy-legacy", "legacy", "legacy"),
    copyStaticTree("alea-copy-features", "features", "features"),
    copyStaticTree("alea-copy-preview", "preview", "preview"),
    ...developmentOnlyBuildPlugins,
    ...cloudflareDeploymentManifestPlugins,
    ...liveBuildIsolationPlugins,
    copyStaticTree("alea-copy-navigation-assets", "assets/navigation", "assets/navigation"),
    {
      name: "alea-copy-root-image-assets",
      apply: "build",
      async closeBundle() {
        const sourceDir = resolve("assets");
        const outputDir = resolve("dist/assets");
        await mkdir(outputDir, { recursive: true });
        for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
          if (!entry.isFile() || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(entry.name)) continue;
          await copyFile(resolve(sourceDir, entry.name), resolve(outputDir, entry.name));
        }
      },
    },
    copyStaticTree("alea-copy-dice-assets", "alea-dicebox-assets-v1.1.4", "alea-dicebox-assets-v1.1.4"),
    copyStaticTree("alea-copy-committed-round-art", "assets/combat/round", "assets/combat/round"),
    copyStaticTree("alea-copy-arcane-system-art", "assets/arcane/system", "assets/arcane/system"),
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
