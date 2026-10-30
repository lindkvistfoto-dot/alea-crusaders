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
});
