#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const PUBLISH_PREFIX = "hermes/core/queue/";
const CLEANUP_PREFIX = "hermes/core/cleanup/live/";

export function routeChangedPaths(paths) {
  const changed = [...paths];
  return {
    publish: changed.some(path => path.startsWith(PUBLISH_PREFIX)),
    asset_cleanup: changed.some(path => path.startsWith(CLEANUP_PREFIX)),
  };
}

export function changedPaths(before, after) {
  if (!SHA.test(before) || !SHA.test(after)) throw new Error("HERMES_INVALID_PUSH_COMMIT");
  return execFileSync("git", [
    "diff", "--name-only", "--diff-filter=AM", before, after, "--",
    PUBLISH_PREFIX, CLEANUP_PREFIX,
  ], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , before, after, output] = process.argv;
  if (!output) throw new Error("HERMES_OUTPUT_PATH_REQUIRED");
  const route = routeChangedPaths(changedPaths(before, after));
  await import("node:fs/promises").then(({ appendFile }) =>
    appendFile(output, `publish=${route.publish}\nasset_cleanup=${route.asset_cleanup}\n`));
}
