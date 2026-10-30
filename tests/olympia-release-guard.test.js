import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildReport } from "../scripts/olympia-release-guard.mjs";
import { reconcileRelease } from "../scripts/olympia-release-guard-core.mjs";

describe("OLYMPIA release reconciliation", () => {
  it("loads the release runner module", () => {
    expect(typeof buildReport).toBe("function");
  });

  it("keeps the inline OLYMPIA browser script syntactically valid", () => {
    const html = readFileSync(new URL("../olympia/index.html", import.meta.url), "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0][1])).not.toThrow();
  });

  it("recognizes PR #375 as present in LIVE by equivalent patch despite a different merge SHA", () => {
    const result = reconcileRelease({
      developmentPrs: [{ number: 375, mergeSha: "dev-merge", patchId: "map-route-patch" }],
      liveCommits: [{ sha: "8bb6a11", patchId: "map-route-patch" }],
      developmentCommits: [{ sha: "dev-merge", patchId: "map-route-patch" }]
    });
    expect(result.publishedPrs.map(pr => pr.number)).toEqual([375]);
    expect(result.pendingPrs).toHaveLength(0);
  });

  it("flags an omitted DEV change as waiting for LIVE", () => {
    const result = reconcileRelease({
      developmentPrs: [{ number: 401, mergeSha: "forgotten-merge", patchId: "forgotten-patch" }],
      liveCommits: [],
      developmentCommits: [{ sha: "forgotten-merge", patchId: "forgotten-patch" }]
    });
    expect(result.pendingPrs.map(pr => pr.number)).toEqual([401]);
  });

  it("flags a LIVE hotfix that has not been returned to DEV", () => {
    const result = reconcileRelease({
      liveCommits: [{ sha: "hotfix-live", patchId: "hotfix-patch", message: "fix: urgent correction" }],
      developmentCommits: []
    });
    expect(result.liveOnly.map(commit => commit.sha)).toEqual(["hotfix-live"]);
    expect(result.liveOnly[0].reconciliation).toBe("missing-in-development");
  });

  it("recognizes each commit of a multi-commit PR cherry-picked separately", () => {
    const result = reconcileRelease({
      developmentPrs: [{ number: 403, mergeSha: "merge-403", patchId: "combined-patch", patchIds: ["part-a", "part-b"] }],
      liveCommits: [{ sha: "pick-a", patchId: "part-a" }, { sha: "pick-b", patchId: "part-b" }],
      developmentCommits: [{ sha: "source-a", patchId: "part-a" }, { sha: "source-b", patchId: "part-b" }]
    });
    expect(result.publishedPrs.map(pr => pr.number)).toEqual([403]);
  });

  it("marks a partly cherry-picked PR as partial and keeps it visible", () => {
    const result = reconcileRelease({
      developmentPrs: [{ number: 404, mergeSha: "merge-404", patchId: "combined-patch", patchIds: ["part-a", "part-b"] }],
      liveCommits: [{ sha: "pick-a", patchId: "part-a" }],
      developmentCommits: [{ sha: "source-a", patchId: "part-a" }, { sha: "source-b", patchId: "part-b" }]
    });
    expect(result.partialPrs.map(pr => pr.number)).toEqual([404]);
  });

  it("clears LIVE drift when the equivalent hotfix patch exists in DEV", () => {
    const result = reconcileRelease({
      liveCommits: [{ sha: "hotfix-live", patchId: "hotfix-patch" }],
      developmentCommits: [{ sha: "hotfix-returned", patchId: "hotfix-patch" }]
    });
    expect(result.liveOnly).toHaveLength(0);
  });

  it("keeps an unidentifiable PR explicitly unknown", () => {
    const result = reconcileRelease({
      developmentPrs: [{ number: 402, mergeSha: "merge-unknown", patchId: null }],
      liveCommits: [],
      developmentCommits: []
    });
    expect(result.unknownPrs[0].reconciliation).toBe("unknown");
    expect(result.pendingPrs).toHaveLength(0);
  });
  it("runs the Release Guard refresh with partial and unknown categories before rendering the summary", async () => {
    const html = readFileSync(new URL("../olympia/index.html", import.meta.url), "utf8");
    const start = html.indexOf("async function refreshReleaseGuard()");
    const end = html.indexOf("\n}\n\nrefreshReleaseGuard();", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const functionSource = html.slice(start, end + 2).replace(/^async function refreshReleaseGuard\(\)/, "async function ()");
    const elements = new Map();
    const get = id => {
      if (!elements.has(id)) elements.set(id, { textContent: "", innerHTML: "", className: "" });
      return elements.get(id);
    };
    const report = {
      status: "ready",
      generated_at: "2026-10-30T00:00:00Z",
      live: { sha: "live-sha" },
      development: { sha: "dev-sha" },
      reconciliation_method: "patch identity",
      published_prs: [],
      pending_prs: [],
      partial_prs: [{ number: 404, reconciliation: "partial" }],
      unknown_prs: [],
      live_only_commits: [],
      database_changes: { waiting_for_live: [], live_only: [] }
    };
    const fetchJSON = async url => {
      if (url.startsWith("./release-status.json")) return report;
      if (url.startsWith("../../deployment-manifest.json")) return { environment: "main", source_sha: "live-sha" };
      if (url.startsWith("../deployment-manifest.json")) return { environment: "development", source_sha: "dev-sha" };
      if (url.includes("/actions/runs")) return { workflow_runs: [] };
      if (url.endsWith("/commits/main")) return { sha: "live-sha" };
      if (url.endsWith("/commits/development")) return { sha: "dev-sha" };
      throw new Error("Unexpected URL " + url);
    };
    const refresh = new Function("$", "fetchJSON", "esc", "time", "owner", "repo", "return (" + functionSource + ");")(
      get, fetchJSON, String, () => "", "owner", "repo"
    );
    await refresh();
    expect(get("guard-summary").textContent).toContain("1 PR-diffar");
    expect(get("guard-unknown-count").textContent).toBe("1");
  });

});
