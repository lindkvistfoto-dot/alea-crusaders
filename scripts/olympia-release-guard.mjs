import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reconcileRelease } from "./olympia-release-guard-core.mjs";

function git(repo, args, input) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 }).trim();
}

function patchId(repo, sha) {
  try {
    const parents = git(repo, ["show", "-s", "--format=%P", sha]).split(/\s+/).filter(Boolean);
    if (!parents.length) return null;
    const diff = git(repo, ["diff", "--no-ext-diff", "--binary", parents[0], sha]);
    if (!diff) return null;
    const result = execFileSync("git", ["patch-id", "--stable"], { encoding: "utf8", input: diff }).trim();
    return result ? result.split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}

function commitsSince(repo, ref, base) {
  return git(repo, ["rev-list", "--first-parent", "--no-merges", ref, "^" + base])
    .split("\n").filter(Boolean).map(sha => ({
      sha,
      message: git(repo, ["show", "-s", "--format=%s", sha]),
      patchId: patchId(repo, sha)
    }));
}

function migrationsAt(repo, ref) {
  const names = git(repo, ["ls-tree", "-r", "--name-only", ref, "--", "supabase/migrations"])
    .split("\n").filter(name => name.endsWith(".sql"));
  return new Map(names.map(name => [name, git(repo, ["rev-parse", ref + ":" + name])]));
}

function migrationDiff(repo, liveRef, developmentRef) {
  const live = migrationsAt(repo, liveRef), development = migrationsAt(repo, developmentRef);
  return {
    waiting_for_live: [...development].filter(([name, sha]) => live.get(name) !== sha).map(([name]) => name),
    live_only: [...live].filter(([name, sha]) => development.get(name) !== sha).map(([name]) => name)
  };
}

async function listMergedDevPrs(repository) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub token unavailable");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const items = [];
  let url = "https://api.github.com/repos/" + repository + "/pulls?state=closed&base=development&per_page=100";
  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error("GitHub PR API returned " + response.status);
    items.push(...await response.json());
    const link = response.headers.get("link") || "";
    url = link.split(",").find(part => part.includes('rel="next"'))?.match(/<([^>]+)>/)?.[1] || "";
  }
  return items.filter(pr => pr.merged_at && pr.base?.ref === "development");
}

export async function buildReport({ repo, liveRef = "main", developmentRef = "origin/development", repository = process.env.GITHUB_REPOSITORY } = {}) {
  const liveSha = git(repo, ["rev-parse", liveRef]);
  const developmentSha = git(repo, ["rev-parse", developmentRef]);
  const baseSha = git(repo, ["merge-base", liveRef, developmentRef]);
  const liveCommits = commitsSince(repo, liveRef, baseSha);
  const developmentCommits = commitsSince(repo, developmentRef, baseSha);
  const mergedPrs = await listMergedDevPrs(repository);
  const patchCache = new Map();
  const prs = mergedPrs.map(pr => {
    const sha = pr.merge_commit_sha;
    if (sha && !patchCache.has(sha)) patchCache.set(sha, patchId(repo, sha));
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      mergedAt: pr.merged_at,
      head: pr.head?.ref || "",
      mergeSha: sha,
      inLiveHistory: sha ? (() => { try { git(repo, ["merge-base", "--is-ancestor", sha, liveRef]); return true; } catch { return false; } })() : false,
      patchId: sha ? patchCache.get(sha) : null
    };
  });
  const result = reconcileRelease({ developmentPrs: prs, liveCommits, developmentCommits });
  return {
    schema_version: 1,
    status: "ready",
    generated_at: new Date().toISOString(),
    live: { ref: liveRef, sha: liveSha },
    development: { ref: developmentRef, sha: developmentSha },
    merge_base: baseSha,
    database_changes: migrationDiff(repo, liveRef, developmentRef),
    reconciliation_method: "Git commit ancestry plus stable Git patch-id; patch matches cover squash merges and cherry-picks with equivalent diffs.",
    pending_prs: result.pendingPrs,
    published_prs: result.publishedPrs,
    unknown_prs: result.unknownPrs,
    live_only_commits: result.liveOnly,
    development_only_commits: result.devOnly
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, i, all) => {
    if (item.startsWith("--")) pairs.push([item.slice(2), all[i + 1]]);
    return pairs;
  }, []));
  const output = resolve(args.output || "olympia-release-status.json");
  try {
    const report = await buildReport({
      repo: resolve(args.repo || "."),
      liveRef: args["live-ref"] || "main",
      developmentRef: args["development-ref"] || "origin/development"
    });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  } catch (error) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({
      schema_version: 1,
      status: "unknown",
      generated_at: new Date().toISOString(),
      reason: String(error?.message || "Reconciliation unavailable").replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, "[redacted]")
    }, null, 2) + "\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
