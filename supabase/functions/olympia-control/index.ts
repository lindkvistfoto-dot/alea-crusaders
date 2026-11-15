Warning: truncated output (original token count: 30950)
Total output lines: 1995

import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import "../_shared/olympia-ci.js";

const assessCi = (globalThis as any).olympiaCiValidation.assess;

const OWNER = "lindkvistfoto-dot";
const REPO = "alea-crusaders";
const ALLOWED_ORIGIN = "https://lindkvistfoto-dot.github.io";
const DEV_ORIGIN = "https://development.alea-crusaders.pages.dev";
const ALLOWED_ORIGINS = new Set([ALLOWED_ORIGIN, DEV_ORIGIN]);
const PAGES_BASE = ALLOWED_ORIGIN + "/alea-crusaders";
const DECISIONS = new Set(["accept", "pandoras_ask", "release_package", "karon", "needs_fix", "final_approval"]);
const responseHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...responseHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (message: string, status: number) => json({ ok: false, message }, status);
const enc = (value: string) => btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const encBytes = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};
function der(tag: number, value: Uint8Array) {
  const length = value.length;
  const lengthBytes = length < 128
    ? Uint8Array.of(length)
    : (() => {
        const bytes: number[] = [];
        let rest = length;
        while (rest > 0) {
          bytes.unshift(rest & 255);
          rest = Math.floor(rest / 256);
        }
        return Uint8Array.of(0x80 | bytes.length, ...bytes);
      })();
  return Uint8Array.of(tag, ...lengthBytes, ...value);
}
function joinBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function pemBytes(pem: string) {
  const match = pem.match(/-----BEGIN ([^-]+)-----([\s\S]+?)-----END \1-----/);
  if (!match) throw new Error("GITHUB_APP_KEY_INVALID");
  const derBytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), c => c.charCodeAt(0));
  if (match[1] === "PRIVATE KEY") return derBytes;
  if (match[1] !== "RSA PRIVATE KEY") throw new Error("GITHUB_APP_KEY_INVALID");
  // GitHub App downloads commonly use PKCS#1; WebCrypto imports PKCS#8.
  const algorithm = der(0x30, Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00));
  return der(0x30, joinBytes(Uint8Array.of(0x02, 0x01, 0x00), algorithm, der(0x04, derBytes)));
}
async function appJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = enc(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = enc(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
  const data = new TextEncoder().encode(header + "." + payload);
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data));
  return header + "." + payload + "." + encBytes(signature);
}
async function githubToken(decision: string) {
  const appId = Deno.env.get("OLYMPIA_GITHUB_APP_ID");
  const installationId = Deno.env.get("OLYMPIA_GITHUB_INSTALLATION_ID");
  const privateKey = Deno.env.get("OLYMPIA_GITHUB_APP_PRIVATE_KEY");
  if (!appId || !installationId || !privateKey) throw new Error("OLYMPIA_BACKEND_NOT_CONFIGURED");
  const jwt = await appJwt(appId, privateKey);
  const permissions: Record<string, string> = decision === "deployment_check" || decision === "current_refs"
    ? { contents: "read" }
    : decision === "pull_request_list"
    ? { pull_requests: "read", issues: "read" }
    : decision === "pull_request_history"
    ? { pull_requests: "read", issues: "read" }
    : decision === "pull_request_status"
    ? { pull_requests: "read" }
    : decision === "idea_verify_live"
    ? { contents: "read", issues: "read", pull_requests: "read" }
    : (decision === "candidate_check" || decision === "auto_candidate_diagnostics")
    ? { contents: "read", issues: "read", pull_requests: "read" }
    : decision === "resume_stale_candidate"
    ? { contents: "write", issues: "write", pull_requests: "read" }
    : decision === "prepare_merged_dev_candidate_write"
    ? { contents: "write", issues: "write", pull_requests: "read" }
    : decision === "review_pull_request"
    ? { pull_requests: "write" }
    : decision === "prepare_merged_dev_candidate"
    ? { pull_requests: "read", issues: "write", contents: "write" }
    : decision === "approve_and_merge_dev"
    ? { pull_requests: "write", issues: "write", contents: "write" }
    : decision === "set_pull_request_draft"
    ? { pull_requests: "write", issues: "write", contents: "write" }
    : { issues: "write", contents: "write" };
  if (decision === "final_approval") Object.assign(permissions, { pull_requests: "write" });
  const tokenUrl = "https://api.github.com/app/installations/" + encodeURIComponent(installationId) + "/access_tokens";
  const tokenHeaders = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + jwt, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const res = await fetch(tokenUrl, {
    method: "POST", headers: tokenHeaders, body: JSON.stringify({ permissions, repository_ids: [1403008145] }),
  });
  if (!res.ok) {
    const failure = await res.json().catch(() => ({}));
    console.error("OLYMPIA GitHub installation token rejected", res.status, String(failure.message || "").slice(0, 180));
    throw new Error("GITHUB_APP_TOKEN_FAILED_" + res.status);
  }
  const data = await res.json();
  if (typeof data.token !== "string") throw new Error("GITHUB_APP_TOKEN_FAILED_RESPONSE");
  return data.token as string;
}
async function gh(token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch("https://api.github.com" + path, {
      ...init,
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) },
    });
  } catch (_error) {
    throw new Error("GITHUB_REQUEST_FAILED_NETWORK");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const rateLimitReset = res.headers.get("x-ratelimit-reset");
    const rateLimited = res.status === 403 &&
      (res.headers.get("x-ratelimit-remaining") === "0" || /API rate limit exceeded/i.test(String(data.message || "")));
    if (res.status === 403) {
      console.error("OLYMPIA GitHub read denied", JSON.stringify({
        method: init.method || "GET",
        path,
        reason: String(data.message || "unknown").slice(0, 180),
        remaining: res.headers.get("x-ratelimit-remaining"),
        resource: res.headers.get("x-ratelimit-resource"),
        reset: rateLimitReset,
        retryAfter: res.headers.get("retry-after"),
      }));
    }
    if (init.method === "PUT" && /\/pulls\/[0-9]+\/merge$/.test(path)) {
      console.error("OLYMPIA GitHub merge rejected", JSON.stringify({ status: res.status, reason: String(data.message || "unknown").slice(0, 240) }));
    }
    if (rateLimited) throw new Error("GITHUB_RATE_LIMITED_" + (rateLimitReset || ""));
    throw new Error("GITHUB_REQUEST_FAILED_" + res.status);
  }
  return data;
}
async function ghReadWithRetry(token: string, path: string, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await gh(token, path);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const rateLimit = code.match(/^GITHUB_RATE_LIMITED_(\d+)$/);
      const transient = error instanceof TypeError || /GITHUB_REQUEST_FAILED_(?:NETWORK|429|502|503|504)$/.test(code) || Boolean(rateLimit);
      if (!transient || attempt === maxRetries) throw error;
      if (rateLimit) {
        const resetAt = Number(rateLimit[1]) * 1000;
        const waitMs = resetAt - Date.now();
        if (waitMs > 2000) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.max(200, waitMs)));
      } else {
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw new Error("GITHUB_READ_UNAVAILABLE");
}
function isTransientCandidateReadError(code: string) {
  return code.startsWith("GITHUB_RATE_LIMITED_") ||
    /^GITHUB_REQUEST_FAILED_(?:NETWORK|429|502|503|504)$/.test(code);
}
async function currentDevPullRequest(token: string, number: number, headSha: string) {
  let pr: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number);
    if (pr.state !== "open" || pr.draft || pr.base?.ref !== "development" || pr.head?.sha !== headSha || pr.mergeable !== null) break;
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (pr.state !== "open") throw new Error("PR_NOT_OPEN");
  if (pr.draft) throw new Error("PR_IS_DRAFT");
  if (pr.base?.ref !== "development") throw new Error("PR_NOT_TARGETING_DEV");
  if (pr.head?.sha !== headSha) throw new Error("PR_HEAD_CHANGED");
  if (pr.mergeable === null) throw new Error("PR_MERGEABILITY_UNKNOWN");
  if (pr.mergeable !== true || pr.mergeable_state !== "clean") throw new Error("PR_NOT_MERGEABLE");
  return pr;
}
async function recordDevAcceptance(token: string, number: number, actor: string) {
  const item = await workItem(token, "PR-" + number);
  const ref = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development");
  const testedDevSha = String(ref.object?.sha || "");
  if (!await verifyReleaseSources(token, item, testedDevSha)) throw new Error("DEV_ACCEPTANCE_SOURCE_UNVERIFIED");
  const appLogin = await appBotLogin();
  const issues = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&creator=" + encodeURIComponent(appLogin));
  const existing = (issues as any[]).find(issue => {
    const body = String(issue.body || "");
    return !issue.pull_request && body.includes("- Beslut: ACCEPTANS") &&
      body.includes("- Ärende-ID: PR-" + number) &&
      body.includes("- Testad DEV-commit (full SHA): " + testedDevSha);
  });
  if (existing) return { number: existing.number, url: existing.html_url, testedDevSha };
  const result = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues", {
    method: "POST",
    body: JSON.stringify({ title: title(item, "accept"), body: issueBody(item, { decision: "accept", testedDevSha, releaseGroup: "PR #" + number }, actor) }),
  });
  return { number: result.number, url: result.html_url, testedDevSha };
}
// SAFE EVOLUTION stage 2: opt-in server-only candidate preparation after a verified DEV merge.
// Disabled by default until the idempotency and candidate-preview pilot is accepted.
async function autoPrepareLiveCandidate(token: string, number: number, actor: string, acceptance: { testedDevSha: string }) {
  // Enabled by default ONLY in the known ALEA DEV Supabase project.
  // Emergency stop: set OLYMPIA_AUTO_LIVE_CANDIDATE=disabled.
  const projectUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "").toLowerCase();
  if (projectUrl !== "https://wkiuyklzzroavclnsxna.supabase.co" ||
      Deno.env.get("OLYMPIA_AUTO_LIVE_CANDIDATE") === "disabled") return { state: "disabled" };
  const item = await workItem(token, "PR-" + number);
  const testedDevSha = acceptance.testedDevSha;
  if (!await verifyReleaseSources(token, item, testedDevSha)) throw new Error("AUTO_CANDIDATE_SOURCE_UNVERIFIED");
  // GitHub refs are created atomically: only one concurrent request can own
  // the deterministic candidate key. Existing locks are never force-reset.
  const lockBranch = "olympia/auto-candidates/pr-" + number + "-" + testedDevSha.toLowerCase();
  const repoPath = "/repos/" + OWNER + "/" + REPO;
  const lockPath = repoPath + "/git/ref/heads/" + lockBranch;
  try {
    await gh(token, lockPath);
    return { state: "already_requested", message: "LIVE-förberedelse finns redan eller behöver kontrolleras. Ingen ny begäran skapades." };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
  }
  try {
    await gh(token, repoPath + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + lockBranch, sha: testedDevSha }),
    });
  } catch (error) {
    // GitHub returns 422 if another request won the atomic create race.
    if (error instanceof Error && error.message === "GITHUB_REQUEST_FAILED_422") {
      return { state: "already_requested", message: "En annan LIVE-förberedelse har redan startat. Ingen dubblett skapades." };
    }
    throw error;
  }
  // Once the lock exists, failure is fail-closed: never delete it automatically
  // or create a second issue. Recovery must inspect the journal first.
  const appLogin = await appBotLogin();
  let existing: any = null;
  for (let page = 1; page <= 20; page++) {
    const issues = await gh(token, repoPath + "/issues?state=all&per_page=100&page=" + page + "&creator=" + encodeURIComponent(appLogin));
    if (!Array.isArray(issues)) throw new Error("AUTO_CANDIDATE_ISSUE_LIST_INVALID");
    existing = issues.find((issue: any) => {
      const body = String(issue.body || "");
      return !issue.pull_request && body.includes("- Beslut: PANDORAS ASK") &&
        body.includes("- Ärende-ID: PR-" + number) &&
        body.includes("- Testad DEV-commit (full SHA): " + testedDevSha);
    });
    if (existing || issues.length < 100) break;
    if (page === 20) throw new Error("AUTO_CANDIDATE_ISSUE_SCAN_INCOMPLETE");
  }
  const issue = existing || await gh(token, repoPath + "/issues", {
    method: "POST",
    body: JSON.stringify({ title: title(item, "pandoras_ask"), body: issueBody(item, {
      decision: "pandoras_ask", testedDevSha, releaseGroup: "PR #" + number,
      comment: "Automatiskt efter verifierad DEV-merge; ingen LIVE-publicering.",
    }, actor) }),
  });
  const requestBranch = await startCandidateRequest(token, issue.number, item, { decision: "pandoras_ask", testedDevSha });
  return { state: "requested", issue: { number: issue.number, url: issue.html_url }, requestBranch };
}
async function appBotLogin() {
  const appId = Deno.env.get("OLYMPIA_GITHUB_APP_ID");
  const privateKey = Deno.env.get("OLYMPIA_GITHUB_APP_PRIVATE_KEY");
  if (!appId || !privateKey) throw new Error("OLYMPIA_BACKEND_NOT_CONFIGURED");
  const jwt = await appJwt(appId, privateKey);
  const res = await fetch("https://api.github.com/app", {
    headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + jwt, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!res.ok) throw new Error("GITHUB_APP_IDENTITY_FAILED");
  const data = await res.json();
  if (typeof data.slug !== "string") throw new Error("GITHUB_APP_IDENTITY_FAILED");
  return data.slug + "[bot]";
}
async function workItem(token: string, itemId: string) {
  const generic = itemId.match(/^PR-([1-9][0-9]*)$/);
  if (generic) {
    const number = Number(generic[1]);
    const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number);
    if (pr.merged !== true || pr.base?.ref !== "development" || !/^[0-9a-f]{40}$/i.test(String(pr.merge_commit_sha || ""))) {
      throw new Error("SOURCE_PR_NOT_MERGED_TO_DEV");
    }
    const files = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number + "/files?per_page=100");
    const ref = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development");
    const comparison = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + pr.merge_commit_sha + "..." + ref.object.sha);
    if (!(comparison.status === "identical" || comparison.status === "ahead" && comparison.merge_base_commit?.sha?.toLowerCase() === String(pr.merge_commit_sha).toLowerCase())) {
      throw new Error("SOURCE_PR_NOT_IN_DEV");
    }
    const changedFiles = Array.isArray(files) ? files.map((file: any) => String(file.filename || "")).filter(Boolean) : [];
    if (!changedFiles.length) throw new Error("SOURCE_PR_FILES_UNKNOWN");
    return {
      id: itemId, title: String(pr.title || "PR #" + number), purpose: String(pr.title || ""),
      expected_result: String(pr.body || "").slice(0, 2000), ready_for_human_acceptance: true,
      dev_sha: String(pr.merge_commit_sha), pr_number: number, release_source_prs: [number],
      features: changedFiles, images: [], image_count: 0, image_status: "published", dev_url: "../",
      provenance: { source_pr: number },
    };
  }
  const data = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/olympia/work-items.json?ref=development");
  if (typeof data.content !== "string") throw new Error("WORK_QUEUE_UNKNOWN");
  const queue = JSON.parse(atob(data.content.replace(/\n/g, "")));
  const item = Array.isArray(queue.items) ? queue.items.find((x: any) => x.id === itemId) : null;
  if (!item) throw new Error("WORK_ITEM_NOT_FOUND");
  return item;
}

function configuredWorkItem(item: any) {
  return !!item && /^(?:PILOT-[0-9]{3}|PR-[1-9][0-9]*)$/.test(String(item.id || "")) &&
    Number.isSafeInteger(item.pr_number) &&
    Array.isArray(item.release_source_prs) && item.release_source_prs.length > 0 &&
    item.release_source_prs.every((number: any) => Number.isSafeInteger(number) && number > 0) &&
    item.release_source_prs.includes(item.pr_number) &&
    Array.isArray(item.features) && item.features.length > 0 &&
    item.features.every((path: any) => typeof path === "string" && path.length > 0);
}
async function verifyReleaseSources(token: string, item: any, testedSha: string) {
  if (!configuredWorkItem(item) || !/^[0-9a-f]{40}$/i.test(testedSha)) return false;
  const sourceNumbers = item.release_source_prs as number[];
  if (new Set(sourceNumbers).size !== sourceNumbers.length) return false;
  const sourcePRs = await Promise.all(sourceNumbers.map(number =>
    gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number)
  ));
  for (const pr of sourcePRs) {
    const mergeSha = String(pr.merge_commit_sha || "");
    if (pr.merged !== true || pr.base?.ref !== "development" || !/^[0-9a-f]{40}$/i.test(mergeSha)) return false;
    const comparison = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + mergeSha + "..." + testedSha);
    if (!(comparison.status === "identical" ||
        comparison.status === "ahead" && comparison.merge_base_commit?.sha?.toLowerCase() === mergeSha.toLowerCase())) return false;
  }
  const primary = sourcePRs.find(pr => Number(pr.number) === item.pr_number);
  return !!primary && primary.merge_commit_sha?.toLowerCase() === String(item.dev_sha).toLowerCase();
}
function parsePatchRanges(patch: unknown) {
  if (typeof patch !== "string" || !patch.length) return null;
  const ranges: Array<{ start: number; end: number; insertion: boolean }> = [];
  const pattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(patch))) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count)) return null;
    ranges.push({ start, end: count === 0 ? start : start + count - 1, insertion: count === 0 });
  }
  return ranges.length ? ranges : null;
}
function patchRangesOverlap(approvedPatch: unknown, laterPatch: unknown) {
  const approved = parsePatchRanges(approvedPatch);
  const later = parsePatchRanges(laterPatch);
  if (!approved || !later) return null;
  for (const a of approved) for (const b of later) {
    if (a.insertion || b.insertion) {
      const point = a.insertion ? a.start : b.start;
      const region = a.insertion ? b : a;
      if (point >= region.start - 1 && point <= region.end + 1) return true;
    } else if (a.start <= b.end && b.start <= a.end) return true;
  }
  return false;
}
async function laterChangesOverlapAcceptedPatch(token: string, item: any, laterFiles: any[]) {
  const protectedPaths = new Set(Array.isArray(item.features) ? item.features : []);
  const relevant = laterFiles.filter(file => protectedPaths.has(String(file.filename || "")));
  if (!relevant.length) return false;
  const approvedPatches = new Map<string, string[]>();
  for (const number of item.release_source_prs || []) {
    const files = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number + "/files?per_page=100");
    if (!Array.isArray(files) || files.length >= 100) return true;
    for (const file of files) {
      if (protectedPaths.has(String(file.filename || "")) && typeof file.patch === "string") {
        const patches = approvedPatches.get(file.filename) || [];
        patches.push(file.patch);
        approvedPatches.set(file.filename, patches);
      }
    }
  }
  for (const file of relevant) {
    const laterPatch = file.patch;
    const accepted = approvedPatches.get(file.filename) || [];
    if (typeof laterPatch !== "string" || !accepted.length) return true;
    for (const acceptedPatch of accepted) {
      const overlap = patchRangesOverlap(acceptedPatch, laterPatch);
      if (overlap !== false) return true;
    }
  }
  return false;
}
async function hasAcceptedFeatureVersion(token: string, issues: any[], item: any, currentSha: string) {
  const acceptedIssues = issues.filter(issue => {
    const body = String(issue.body || "");
    return body.includes("- Beslut: ACCEPTANS") && body.includes("- Ärende-ID: " + item.id);
  });
  const protectedPaths = new Set([...(Array.isArray(item.features) ? item.features : []), "tests/arcane-trophy-room.test.mjs"]);
  for (const issue of acceptedIssues) {
    const body = String(issue.body || "");
    const tested = body.match(/- Testad DEV-commit \(full SHA\): ([0-9a-f]{40})/i)?.[1];
    if (!tested) continue;
    if (tested === currentSha) return true;
    const comparison = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + tested + "..." + currentSha);
    if (comparison.status !== "ahead" || comparison.ahead_by > 100 || !Array.isArray(comparison.files) || comparison.files.length >= 300) continue;
    const relevantFiles = comparison.files.filter((file: any) => protectedPaths.has(file.filename));
    if (!relevantFiles.length || !await laterChangesOverlapAcceptedPatch(token, item, relevantFiles)) return true;
  }
  return false;
}
async function startCandidateRequest(token: string, issueNumber: number, item: any, data: any) {
  const ref = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development");
  const workflow = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/.github/workflows/olympia-release-candidate.yml?ref=development");
  const workflowBlobSha = String(workflow.sha || "");
  if (!/^[0-9a-f]{40}$/i.test(workflowBlobSha)) throw new Error("CANDIDATE_WORKFLOW_UNKNOWN");
  const branch = "olympia/release-requests/decision-" + issueNumber;
  let branchExists = false;
  try {
    await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/" + encodeURIComponent(branch));
    branchExists = true;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
  }
  if (!branchExists) {
    await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }),
    });
  }
  const path = "olympia/release-requests/decision-" + issueNumber + ".json";
  let current: any = null;
  if (branchExists) {
    try {
      current = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/" + path + "?ref=" + encodeURIComponent(branch));
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
    }
  }
  let attempt = 1;
  if (current?.content) {
    const previous = JSON.parse(atob(String(current.content).replace(/\\n/g, "")));
    if (previous.issueNumber !== issueNumber || previous.itemId !== item.id ||
        previous.testedDevSha !== data.testedDevSha || previous.decision !== "pandoras_ask") {
      throw new Error("RELEASE_REQUEST_IDEMPOTENCY_MISMATCH");
    }
    attempt = Math.max(1, Number(previous.attempt) || 1) + 1;
  }
  if (branchExists) {
    await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/refs/heads/" + encodeURIComponent(branch), {
      method: "PATCH",
      body: JSON.stringify({ sha: ref.object.sha, force: true }),
    });
    current = null;
    try {
      current = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/" + path + "?ref=" + encodeURIComponent(branch));
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
    }
  }
  const request = {
    schema: "olympia-release-request/v1",
    issueNumber,
    itemId: item.id,
    prNumber: item.pr_number,
    testedDevSha: data.testedDevSha,
    decision: data.decision,
    attempt,
    workflowBlobSha,
  };
  await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/" + path, {
    method: "PUT",
    body: JSON.stringify({
      message: "olympia: " + (attempt > 1 ? "resume" : "start") + " verified release candidate for " + item.id,
      content: btoa(JSON.stringify(request)),
      branch,
      ...(current?.sha ? { sha: current.sha } : {}),
    }),
  });
  return branch;
}
function issueBody(item: any, data: any, actor: string) {
  const decisionLabels: Record<string, string> = {
    accept: "ACCEPTANS",
    pandoras_ask: "PANDORAS ASK",
    release_package: "RELEASEPAKET",
    karon: "TILL KARON",
    needs_fix: "BEHÖVER RÄTTAS",
    final_approval: "SLUTGODKÄNNANDE LIVE",
  };
  const comment = String(data.comment || "").trim().slice(0, 2000);
  const acceptance = data.decision === "accept" || data.decision === "pandoras_ask" || data.decision === "release_package";
  return [
    "## OLYMPIA Zeus-beslut",
    "",
    "- Beslut: " + decisionLabels[data.decision],
    "- Ärende-ID: " + item.id,
    "- PR: #" + item.pr_number,
    "- Testad DEV-commit (full SHA): " + data.testedDevSha,
    "- Verifierad ärende-SHA: " + item.dev_sha,
    "- Zeus-konto: " + actor,
    "- Registrerad: " + new Date().toISOString(),
    "- Mänsklig acceptans: " + (acceptance ? "Ja" : "Nej"),
    "- Releasegrupp: " + (data.releaseGroup || "Ingen"),
    ...(data.decision === "final_approval" ? ["- Kandidatärende: #" + data.candidateIssue, "- Kandidat tree SHA: " + data.candidateTreeSha] : []),
    "",
    "### Zeus kommentar",
    comment || "Ingen kommentar angiven.",
    "",
    "Beslutet registrerades via OLYMPIA DEV Decision Bridge. GitHub är beständig beslutsjournal.",
  ].join("\n");
}
async function verifyPublishedManifest(environment: "main" | "development", sourceSha: string) {
  const path = environment === "main" ? "/deployment-manifest.json" : "/dev/deployment-manifest.json";
  const response = await fetch(PAGES_BASE + path + "?ts=" + Date.now(), {
    headers: { "Accept": "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("DEPLOYMENT_MANIFEST_UNVERIFIED");
  const manifest = await response.json();
  if (manifest.environment !== environment || manifest.source_sha !== sourceSha) {
    throw new Error("DEPLOYMENT_MANIFEST_UNVERIFIED");
  }
}
async function liveMergePublicationStatus(token: string, mergeSha: string) {
  if (!/^[0-9a-f]{40}$/i.test(mergeSha || "")) return { onMain: false, published: false };
  try {
    const ref = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/main");
    const liveSha = String(ref.object?.sha || "");
    if (!/^[0-9a-f]{40}$/i.test(liveSha)) return { onMain: false, published: false };
    const comparison = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + mergeSha + "..." + liveSha);
    const onMain = ["ahead", "identical"].includes(String(comparison.status || ""));
    if (!onMain) return { onMain: false, published: false };
    try {
      await verifyPublishedManifest("main", liveSha);
      return { onMain: true, published: true };
    } catch (_) {
      return { onMain: true, published: false };
    }
  } catch (_) {
    return { onMain: false, published: false };
  }
}

async function verifyCandidate(token: string, item: any, data: any) {
  if (!Number.isInteger(data.candidateIssue) || data.candidateIssue < 1 ||
      typeof data.candidateTreeSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.candidateTreeSha) ||
      typeof data.releasePrSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.releasePrSha)) {
    throw new Error("CANDIDATE_INPUT_INVALID");
  }
  const appLogin = await appBotLogin();
  const issue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + data.candidateIssue);
  const decisionBody = String(issue.body || "");
  if (issue.user?.login !== appLogin ||
      !decisionBody.includes("- Ärende-ID: " + item.id) ||
      !decisionBody.includes("- Testad DEV-commit (full SHA): " + data.testedDevSha) ||
      !["- Beslut: PANDORAS ASK", "- Beslut: RELEASEPAKET"].some(value => decisionBody.includes(value))) {
    throw new Error("CANDIDATE_DECISION_MISMATCH");
  }
  const comments = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + data.candidateIssue + "/comments?per_page=100");
  const report = (comments as any[])
    .filter(comment => {
      const body = String(comment.body || "");
      return comment.user?.login === "github-actions[bot]" &&
        body.includes("## OLYMPIA release candidate") &&
        body.includes("- Verified DEV SHA: " + data.testedDevSha);
    })
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))[0];
  if (!report) throw new Error("CANDIDATE_NOT_READY");
  const body = String(report.body || "");
  const reportTreeMatch = body.match(/- Candidate tree SHA: ([0-9a-f]{40})/i);
  if (!body.includes("READY_FOR_ZEUS_FINAL_APPROVAL") || !reportTreeMatch) {
    throw new Error("CANDIDATE_NOT_READY");
  }
  const liveMatch = body.match(/- LIVE rollback baseline: ([0-9a-f]{40})/i);
  const prMatch = body.match(/- Release PR: #(\d+)/);
  if (!liveMatch || !prMatch) throw new Error("CANDIDATE_REPORT_INCOMPLETE");
  const live = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/main");
  if (live.sha !== liveMatch[1]) throw new Error("LIVE_BASELINE_CHANGED");
  const development = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development");
  const developmentSha = String(development.object?.sha || "");
  if (!/^[0-9a-f]{40}$/i.test(developmentSha)) throw new Error("DEPLOYMENT_MANIFEST_UNVERIFIED");
  await Promise.all([
    verifyPublishedManifest("main", live.sha),
    verifyPublishedManifest("development", developmentSha),
  ]);
  const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + prMatch[1]);
  if (pr.state !== "open" || pr.base?.ref !== "main" || pr.base?.sha !== live.sha ||
      pr.user?.login !== appLogin || pr.mergeable !== true) throw new Error("RELEASE_PR_NOT_VALID");
  if (!String(pr.body || "").includes("Zeus decision journal: #" + data.candidateIssue)) throw new Error("RELEASE_PR_DECISION_MISMATCH");
  const headCommit = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha);
  const currentTreeSha = String(headCommit.commit?.tree?.sha || "");
  if (pr.head.sha !== data.releasePrSha || !/^[0-9a-f]{40}$/i.test(currentTreeSha) ||
      currentTreeSha !== data.candidateTreeSha) throw new Error("CANDIDATE_HEAD_CHANGED");
  const files = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + prMatch[1] + "/files?per_page=100");
  const allowedFiles = new Set([...(Array.isArray(item.features) ? item.features : []), "tests/arcane-trophy-room.test.mjs"]);
  const actualFiles = Array.isArray(files) ? files.map((file: any) => String(file.filename || "")) : [];
  if (!actualFiles.length || actualFiles.some((filename: string) => !allowedFiles.has(filename))) {
    throw new Error("CANDIDATE_SCOPE_NOT_ALLOWED");
  }
  const [checks, status] = await Promise.all([
    ghReadWithRetry(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/check-runs?per_page=100"),
    ghReadWithRetry(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/status"),
  ]);
  const checkRuns = Array.isArray(checks.check_runs) ? checks.check_runs : [];
  const requiredChecks = [/^check$/i, /^guard$/i, /^preview$/i];
  const checkNames = checkRuns.map((check: any) => String(check.name || ""));
  if (checkRuns.length === 0 || Number(checks.total_count) > checkRuns.length ||
      requiredChecks.some(pattern => !checkNames.some(name => pattern.test(name))) ||
      checkRuns.some((check: any) => check.status !== "completed" || !["success", "neutral", "skipped"].includes(check.conclusion))) {
    throw new Error("CANDIDATE_CHECKS_NOT_GREEN");
  }
  if (Array.isArray(status.statuses) && status.statuses.length > 0 && status.state !== "success") {
    throw new Error("CANDIDATE_STATUS_NOT_GREEN");
  }
  return { issue, pr, report, liveSha: live.sha, candidateTreeSha: currentTreeSha };
}
async function verifiedCandidatePreview(token: string, releasePrSha: string) {
  // First reuse any exact-SHA GitHub deployment already verified by OLYMPIA.
  try {
    const deployments = await gh(token, "/repos/" + OWNER + "/" + REPO + "/deployments?sha=" + releasePrSha + "&per_page=100");
    if (Array.isArray(deployments)) {
      for (const deployment of deployments) {
        if (String(deployment.sha || "").toLowerCase() !== releasePrSha.toLowerCase()) continue;
        if (!/preview/i.test(String(deployment.environment || ""))) continue;
        const statuses = await gh(token, "/repos/" + OWNER + "/" + REPO + "/deployments/" + deployment.id + "/statuses?per_page=30");
        if (!Array.isArray(statuses)) continue;
        const status = statuses.find((entry: any) => entry.state === "success" && entry.environment_url);
        if (status) {
          const url = trustedCandidatePreviewUrl(status.environment_url);
          if (url) return url;
        }
      }
    }
  } catch (_) { /* Try the Cloudflare source of truth below. */ }

  // No GitHub deployment is required when Cloudflare already published the exact SHA.
  // Missing credentials or incomplete metadata always leave LIVE preview locked.
  const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!apiToken || !accountId || !/^[a-f0-9]{40}$/i.test(releasePrSha)) { console.warn("OLYMPIA_PREVIEW_CONFIG_UNAVAILABLE"); return null; }
  try {
    for (let page = 1; page <= 20; page++) {
      const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) +
        "/pages/projects/alea-crusaders/deployments?env=preview&per_page=20&page=" + page, {
        headers: { Authorization: "Bearer " + apiToken, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        // Cloudflare error codes are non-secret and identify validation errors without exposing credentials.
        let codes: number[] = [];
        try {
          const errorPayload = await response.json();
          if (Array.isArray(errorPayload?.errors)) {
            codes = errorPayload.errors.map((error: any) => Number(error.code)).filter((code: number) => Number.isInteger(code)).slice(0, 3);
          }
        } catch (_) { /* Keep the response body private. */ }
        console.warn("OLYMPIA_PREVIEW_HTTP_STATUS", response.status, "CLOUDFLARE_ERROR_CODES", codes);
        return null;
      }
      const payload = await response.json();
      if (payload?.success !== true || !Array.isArray(payload.result)) { console.warn("OLYMPIA_PREVIEW_RESPONSE_INVALID"); return null; }
      for (const deployment of payload.result) {
        if (deployment.environment !== "preview" || deployment.latest_stage?.status !== "success") continue;
        if (String(deployment.deployment_trigger?.metadata?.commit_hash || "").toLowerCase() !== releasePrSha.toLowerCase()) continue;
        const url = trustedCandidatePreviewUrl(deployment.url);
        if (url) return url;
      }
      if (payload.result.length < 20) break;
    }
  } catch (_) { console.warn("OLYMPIA_PREVIEW_REQUEST_FAILED"); }
  return null;
}
function trustedCandidatePreviewUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.alea-crusaders\.pages\.dev$/i.test(url.hostname) ||
        url.hostname === "alea-crusaders.pages.dev" || url.username || url.password ||
        (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
    return url.origin + "/";
  } catch (_) { return null; }
}
async function inspectCandidate(token: string, item: any, issueNumber: number, testedDevSha: string) {
  const appLogin = await appBotLogin();
  const issue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + issueNumber);
  const decisionBody = String(issue.body || "");
  if (issue.user?.login !== appLogin ||
      !decisionBody.includes("- Ärende-ID: " + item.id) ||
      !decisionBody.includes("- Testad DEV-commit (full SHA): " + testedDevSha) ||
      !["- Beslut: PANDORAS ASK", "- Beslut: RELEASEPAKET"].some(value => decisionBody.includes(value))) {
    throw new Error("CANDIDATE_DECISION_MISMATCH");
  }
  const comments = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + issueNumber + "/comments?per_page=100");
  const report = (comments as any[])
    .filter(comment => {
      const body = String(comment.body || "");
      return comment.user?.login === "github-actions[bot]" &&
        body.includes("## OLYMPIA release candidate") &&
        body.includes("- Verified DEV SHA: " + testedDevSha);
    })
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))[0];
  if (!report) return { ready: false, blocked: false, message: "Kandidatkontrollen har ännu inte rapporterat resultat." };
  const body = String(report.body || "");
  const blocked = body.includes("- Status: BLOCKED");
  const treeMatch = body.match(/- Candidate tree SHA: ([0-9a-f]{40})/i);
  const runMatch = body.match(/- Workflow run: (https:\/\/[^\s]+)/i);
  const candidatePrMatch = body.match(/- Release PR: #(\d+) · (https:\/\/[^\s]+)/i);
  let releasePrSha: string | null = null;
  let releasePrTreeSha: string | null = null;
  let candidatePr: any = null;
  if (candidatePrMatch) {
    try {
      candidatePr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + candidatePrMatch[1]);
      releasePrSha = String(candidatePr.head?.sha || "") || null;
      if (releasePrSha) {
        const headCommit = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + releasePrSha);
        releasePrTreeSha = String(headCommit.commit?.tree?.sha || "") || null;
      }
    } catch (_error) { releasePrSha = null; releasePrTreeSha = null; }
  }
  if (!body.includes("READY_FOR_ZEUS_FINAL_APPROVAL") || !treeMatch) {
    return {
      ready: false,
      blocked,
      reasonCode: blocked ? "CANDIDATE_WORKFLOW_BLOCKED" : "CANDIDATE_NOT_READY",
      message: blocked ? "Kandidatkontrollen blockerade publiceringen. LIVE är oförändrat." : "Kandidaten väntar på verifierad releasekontroll.",
      candidateRunUrl: runMatch?.[1] || null,
      releasePr: candidatePrMatch ? Number(candidatePrMatch[1]) : null,
      releasePrNotCreated: body.includes("- Rele…10950 tokens truncated…
          }
        }
        const byNumber = new Map<number, any>();
        for (const pr of open) {
          if (["development", "main"].includes(String(pr.base?.ref || ""))) byNumber.set(Number(pr.number), pr);
        }
        const targetedParents = new Set([...activeCandidatePrs, ...publishedCandidatePrs.keys()]);
        for (const number of targetedParents) {
          if (byNumber.has(number)) continue;
          const pr = await ghReadWithRetry(token, repoPath + "/pulls/" + number);
          if (pr.state === "closed" && pr.merged_at && pr.base?.ref === "development") byNumber.set(number, pr);
        }
        const pullRequests = [...byNumber.values()]
          .map((pr: any) => {
            const number = Number(pr.number);
            const livePublished = Boolean(pr.merged_at && publishedCandidatePrs.has(number));
            return {
              ...pr,
              livePublished,
              liveMergeSha: livePublished ? publishedCandidatePrs.get(number) : null,
              liveCandidateActive: Boolean(pr.merged_at && activeCandidatePrs.has(number) && !livePublished),
            };
          })
          .sort((a: any, b: any) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
        console.info("OLYMPIA PR list completed", JSON.stringify({ requestId, authElapsedMs: Math.round(listStartedAt - requestStartedAt), credentialSetupElapsedMs, openPrElapsedMs, issueListElapsedMs, diagnosticsElapsedMs: Math.round(performance.now() - listStartedAt) - credentialSetupElapsedMs - openPrElapsedMs - issueListElapsedMs, totalElapsedMs: Math.round(performance.now() - requestStartedAt), openPrCount: open.length, returnedCount: pullRequests.length }));
        return json({ ok: true, pullRequests });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub PR list failed", JSON.stringify({ requestId, elapsedMs: Math.round(performance.now() - requestStartedAt), code }));
        return fail("GitHub PR-listan kunde inte hämtas (" + code + ").", 502);
      }
    }
    if (data.action === "pull_request_history") {
      const query = typeof data.query === "string" ? data.query.trim().slice(0, 100) : "";
      const page = Number.isSafeInteger(data.page) && data.page > 0 ? Math.min(data.page, query ? 20 : 1000) : 1;
      try {
        const token = await githubToken("pull_request_history");
        const repoPath = "/repos/" + OWNER + "/" + REPO;
        if (!query) {
          const pullRequests = await ghReadWithRetry(token, repoPath + "/pulls?state=closed&per_page=50&page=" + page + "&sort=updated&direction=desc");
          if (!Array.isArray(pullRequests)) throw new Error("GITHUB_PR_HISTORY_INVALID_RESPONSE");
          return json({ ok: true, pullRequests, page, totalCount: null, hasMore: pullRequests.length === 50 && page < 20 });
        }
        const numberQuery = query.replace(/^#/, "");
        if (/^[1-9][0-9]*$/.test(numberQuery)) {
          const pr = await ghReadWithRetry(token, repoPath + "/pulls/" + Number(numberQuery));
          const pullRequests = pr.state === "closed" ? [pr] : [];
          return json({ ok: true, pullRequests, page: 1, hasMore: false, totalCount: pullRequests.length });
        }
        const searchQuery = "repo:" + OWNER + "/" + REPO + " is:pr is:closed in:title \"" + query.replace(/[\\\"]/g, "\\$&") + "\"";
        const params = new URLSearchParams({ q: searchQuery, sort: "updated", order: "desc", per_page: "50", page: String(page) });
        const result = await ghReadWithRetry(token, "/search/issues?" + params.toString());
        if (!Array.isArray(result.items)) throw new Error("GITHUB_PR_HISTORY_INVALID_RESPONSE");
        const pullRequests = result.items.filter((item: any) => item.pull_request).map((item: any) => ({
          number: item.number,
          title: item.title,
          state: item.state,
          updated_at: item.updated_at,
          html_url: item.html_url,
          base: { ref: "history" },
          pull_request: item.pull_request,
        }));
        const totalCount = Number(result.total_count || 0);
        return json({ ok: true, pullRequests, page, totalCount, hasMore: page < 20 && page * 50 < Math.min(totalCount, 1000) });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub PR history search failed", code);
        return fail("Historiska PR kunde inte sökas just nu. Försök igen senare.", 502);
      }
    }
    if (data.action === "current_refs") {
      try {
        const token = await githubToken("current_refs");
        const [live, development] = await Promise.all([
          gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/main"),
          gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development"),
        ]);
        const liveSha = String(live.object?.sha || "");
        const developmentSha = String(development.object?.sha || "");
        if (!/^[0-9a-f]{40}$/i.test(liveSha) || !/^[0-9a-f]{40}$/i.test(developmentSha)) {
          throw new Error("BRANCH_SHA_UNVERIFIED");
        }
        return json({ ok: true, environments: { main: { sha: liveSha }, development: { sha: developmentSha } } });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub branch status failed", code);
        return fail("Aktuell GitHub-status kunde inte hämtas (" + code + ").", 502);
      }
    }
    if (data.action === "pull_request_status") {
      if (!Number.isInteger(data.pullRequestNumber) || data.pullRequestNumber < 1 ||
          typeof data.pullRequestHeadSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.pullRequestHeadSha)) {
        return fail("PR-nummer eller versions-SHA saknas.", 400);
      }
      try {
        const path = "/repos/" + OWNER + "/" + REPO;
        const token = await githubToken("pull_request_status");
        const [pr, status, checks] = await Promise.all([
          ghReadWithRetry(token, path + "/pulls/" + data.pullRequestNumber),
          ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/status"),
          ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100"),
        ]);
        if (pr.head?.sha !== data.pullRequestHeadSha) return fail("PR-versionen har ändrats. Uppdatera listan och hämta status igen.", 409);
        return json({
          ok: true,
          pullRequest: { state: pr.state, draft: pr.draft, baseRef: String(pr.base?.ref || ""), headSha: String(pr.head?.sha || ""), mergeable: pr.mergeable, mergeableState: pr.mergeable_state },
          statuses: Array.isArray(status.statuses) ? status.statuses : [],
          combinedStatusState: String(status.state || 'unknown'),
          statusSha: String(status.sha || ''),
          checkRunSha: String(checks.sha || ''),
          checkRunsTotalCount: Number(checks.total_count || 0),
          checkRuns: Array.isArray(checks.check_runs) ? checks.check_runs : [],
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub PR status failed", code);
        if (code === "GITHUB_APP_TOKEN_FAILED_422") return fail("GitHub avvisade skapandet av en installations-token. CI kunde inte verifieras; ingen merge genomfördes.", 503);
        if (code.startsWith("GITHUB_RATE_LIMITED_")) return fail("GitHubs API-gräns är tillfälligt nådd. CI är inte verifierad; försök igen när gränsen återställts.", 503);
        if (code === "GITHUB_REQUEST_FAILED_403") return fail("GitHub nekade åtkomst till aktuell PR- eller CI-status. CI är inte verifierad.", 503);
        if (/GITHUB_REQUEST_FAILED_(?:NETWORK|429|502|503|504)$/.test(code) || error instanceof TypeError) return fail("GitHub CI kunde inte nås tillfälligt. CI är inte verifierad.", 503);
        return fail("GitHub PR-status kunde inte verifieras säkert. CI är inte verifierad.", 502);
      }
    }
    if (data.action === "deployment_check") {
      try {
        const token = await githubToken("deployment_check");
        const [live, development] = await Promise.all([
          gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/main"),
          gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development"),
        ]);
        const liveSha = String(live.object?.sha || "");
        const developmentSha = String(development.object?.sha || "");
        if (!/^[0-9a-f]{40}$/i.test(liveSha) || !/^[0-9a-f]{40}$/i.test(developmentSha)) {
          throw new Error("BRANCH_SHA_UNVERIFIED");
        }
        await Promise.all([
          verifyPublishedManifest("main", liveSha),
          verifyPublishedManifest("development", developmentSha),
        ]);
        return json({
          ok: true,
          message: "DEV och LIVE är publicerade från aktuella brancher.",
          environments: {
            main: { sha: liveSha },
            development: { sha: developmentSha },
          },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        console.error("OLYMPIA deployment preflight failed", code);
        return fail("DEV/LIVE-publiceringen kunde inte verifieras just nu. Slutgodkännandet är låst; försök igen.", 409);
      }
    }
    if (data.action === "approve_and_merge_dev") {
      if (!Number.isInteger(data.pullRequestNumber) || data.pullRequestNumber < 1 ||
          typeof data.pullRequestHeadSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.pullRequestHeadSha)) {
        return fail("PR-nummer eller versions-SHA saknas.", 400);
      }
      let stage = "github_auth";
      try {
        const token = await githubToken("approve_and_merge_dev");
        stage = "pr_validation";
        const path = "/repos/" + OWNER + "/" + REPO;
        const pr = await currentDevPullRequest(token, data.pullRequestNumber, data.pullRequestHeadSha);
        stage = "ci_validation";
        const [checks, status] = await Promise.all([
          ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100"),
          ghReadWithRetry(token, path + "/commits/" + data.pullRequestHeadSha + "/status"),
        ]);
        const assessment = assessCi(checks, status, data.pullRequestHeadSha);
        if (assessment.state !== "success") throw new Error(assessment.code);
        stage = "github_merge";
        let mergeSha = "";
        try {
          const merged = await gh(token, path + "/pulls/" + data.pullRequestNumber + "/merge", {
            method: "PUT",
            body: JSON.stringify({ sha: data.pullRequestHeadSha, merge_method: "squash" }),
          });
          if (merged.merged === true && /^[0-9a-f]{40}$/i.test(String(merged.sha || ""))) mergeSha = merged.sha;
          else throw new Error("GITHUB_MERGE_NOT_CONFIRMED");
        } catch (mergeError) {
          const refreshed = await gh(token, path + "/pulls/" + data.pullRequestNumber);
          if (refreshed.merged === true && refreshed.base?.ref === "development" &&
              /^[0-9a-f]{40}$/i.test(String(refreshed.merge_commit_sha || ""))) {
            mergeSha = refreshed.merge_commit_sha;
          } else {
            if (mergeError instanceof Error && /GITHUB_REQUEST_FAILED_409/.test(mergeError.message)) {
              await currentDevPullRequest(token, data.pullRequestNumber, data.pullRequestHeadSha);
            }
            throw mergeError;
          }
        }
        stage = "dev_acceptance_record";
        let acceptance: any = null;
        let acceptanceWarning = "";
        try {
          acceptance = await recordDevAcceptance(token, data.pullRequestNumber, user.email || "Zeus");
        } catch (acceptanceError) {
          acceptanceWarning = "GitHub-mergen lyckades, men DEV-journalen kunde inte uppdateras. Kontrollera journalen innan LIVE-steget.";
          console.error("OLYMPIA DEV acceptance record failed after confirmed merge", JSON.stringify({ pr: data.pullRequestNumber, mergeSha, code: acceptanceError instanceof Error ? acceptanceError.message : "UNKNOWN" }));
        }
        let liveCandidate: any = { state: "disabled" };
        if (acceptance && !acceptanceWarning) {
          try {
            liveCandidate = await autoPrepareLiveCandidate(token, data.pullRequestNumber, user.email || "Zeus", acceptance);
          } catch (candidateError) {
            liveCandidate = { state: "failed", message: "DEV-merge lyckades, men LIVE-kandidaten kunde inte förberedas. Ingen LIVE-publicering skedde." };
            console.error("OLYMPIA auto LIVE candidate failed after DEV merge", candidateError instanceof Error ? candidateError.message : "UNKNOWN");
          }
        }
        return json({ ok: true, merged: true, sha: mergeSha, acceptance, acceptanceWarning, liveCandidate,
          message: acceptanceWarning || "PR #" + data.pullRequestNumber + " squash-mergad till DEV. LIVE-förberedelse: " + liveCandidate.state });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA DEV merge failed", JSON.stringify({ pr: data.pullRequestNumber, stage, code }));
        const messages: Record<string, string> = {
          PR_NOT_OPEN: "PR:en är inte längre öppen. Uppdatera OLYMPIA för aktuell status.",
          PR_IS_DRAFT: "PR:en är fortfarande ett utkast och kan inte godkännas.",
          PR_NOT_TARGETING_DEV: "PR:en riktar sig inte till development.",
          PR_HEAD_CHANGED: "PR:en har ändrats sedan den visades. Uppdatera OLYMPIA och granska den nya versionen.",
          PR_MERGEABILITY_UNKNOWN: "GitHub kunde inte fastställa mergebarheten efter flera uppdateringar. Försök igen om en stund.",
          PR_HAS_CONFLICTS: "PR:en har konflikter och behöver rättas innan DEV-merge.",
          PR_NOT_MERGEABLE: "GitHub bekräftar inte att PR:en är mergebar. Kontrollera obligatoriska kontroller och branch protection.",
          CI_PENDING: "CI körs fortfarande. Vänta in kontrollerna och försök igen.",
          CI_FAILED: "En eller flera obligatoriska CI-kontroller har underkänts. Ingen merge genomfördes.",
          CI_CHECKS_MISSING: "Obligatoriska CI-kontroller saknas. Ingen merge genomfördes.",
          CI_CHECKS_INCOMPLETE: "GitHub returnerade inte alla CI-kontroller. Uppdatera status och försök igen.",
          CI_SHA_MISMATCH: "CI-kontrollerna gäller inte den aktuella PR-versionen. Uppdatera status och granska igen.",
          CI_SHA_INVALID: "PR-versionen kunde inte verifieras. Ingen merge genomfördes.",
          CI_STATUS_UNKNOWN: "GitHub-status kunde inte verifieras. Ingen merge genomfördes.",
          GITHUB_APP_TOKEN_FAILED_422: "GitHub avvisade skapandet av en installations-token. Kontrollera OLYMPIA-appens befintliga behörigheter; ingen merge genomfördes.",
          DEV_ACCEPTANCE_SOURCE_UNVERIFIED: "GitHub bekräftade DEV-merge, men ändringen kunde inte kopplas säkert till DEV. Uppdatera status innan nästa beslut.",
        };
        const ciApiMessages: Record<string, string> = {
          GITHUB_RATE_LIMITED: "GitHub API-begränsningen är nådd. Vänta tills gränsen återställts och försök igen.",







          GITHUB_REQUEST_FAILED_403: "GitHub nekade CI-verifieringen (403). Kontrollera GitHub App-behörigheterna; ingen merge genomfördes.",
          GITHUB_REQUEST_FAILED_429: "GitHub CI-tjänst begränsade anropen (429). Vänta och försök igen.",
          GITHUB_REQUEST_FAILED_502: "GitHub CI-tjänst är tillfälligt otillgänglig (502). Försök igen.",
          GITHUB_REQUEST_FAILED_503: "GitHub CI-tjänst är tillfälligt otillgänglig (503). Försök igen.",
          GITHUB_REQUEST_FAILED_504: "GitHub CI-tjänst svarade inte i tid (504). Försök igen.",
        };
        const apiMessages: Record<string, string> = {
          GITHUB_RATE_LIMITED: "GitHub API-begränsningen är nådd. Vänta tills gränsen återställts och försök igen.",
          GITHUB_REQUEST_FAILED_403: "GitHub nekade API-anropet (403). CI kunde inte verifieras; kontrollera GitHub App-åtkomsten.",
          GITHUB_REQUEST_FAILED_429: "GitHub API begränsade anropen (429). Vänta och försök igen.",
          GITHUB_REQUEST_FAILED_502: "GitHub API är tillfälligt otillgängligt (502). Försök igen.",
          GITHUB_REQUEST_FAILED_503: "GitHub API är tillfälligt otillgängligt (503). Försök igen.",
          GITHUB_REQUEST_FAILED_504: "GitHub API svarade inte i tid (504). Försök igen.",
        };
        const messageCode = code.startsWith("GITHUB_RATE_LIMITED_") ? "GITHUB_RATE_LIMITED" : code;
        const errorMessage = stage === "ci_validation" ? ciApiMessages[messageCode] || messages[messageCode] ||
          "GitHub CI kunde inte verifieras säkert. Ingen merge genomfördes; uppdatera status och försök igen."
          : apiMessages[messageCode] || messages[messageCode] ||
            "DEV-merge kunde inte bekräftas av GitHub. Ingen lyckad merge rapporteras. Kontrollera status och försök igen.";
        const responseStatus = code === "GITHUB_REQUEST_FAILED_409" || code === "CI_PENDING" || code === "CI_FAILED" ||
          code === "CI_CHECKS_MISSING" || code === "CI_CHECKS_INCOMPLETE" || code === "CI_SHA_MISMATCH" ||
          code === "CI_SHA_INVALID" || code === "CI_STATUS_UNKNOWN" ? 409
          : /(?:429|502|503|504)$/.test(code) || code.startsWith("GITHUB_RATE_LIMITED")  ? 503
          : 502;
        return json({ ok: false, stage, errorCode: code, message: errorMessage + " (Steg: " + stage + ")" }, responseStatus);
      }
    }
    if (data.action === "prepare_merged_dev_candidate") {
      if (!Number.isSafeInteger(data.pullRequestNumber) || data.pullRequestNumber < 1) {
        return fail("Ange ett giltigt DEV-PR-nummer.", 400);
      }
      try {
        // Keep candidate writes on their minimal write profile. Public-repository
        // CI reads use the existing read-only App token without requesting new scopes.
        const writeToken = await githubToken("prepare_merged_dev_candidate_write");
        const token = await githubToken("pull_request_status");
        const repoPath = "/repos/" + OWNER + "/" + REPO;
        const pr = await gh(token, repoPath + "/pulls/" + data.pullRequestNumber);
        if (pr.merged !== true || pr.base?.ref !== "development" ||
            !/^[0-9a-f]{40}$/i.test(String(pr.merge_commit_sha || "")) ||
            !/^[0-9a-f]{40}$/i.test(String(pr.head?.sha || ""))) {
          return fail("PR:en är inte en verifierad merge till DEV.", 409);
        }

        const item = await workItem(token, "PR-" + data.pullRequestNumber);
        const devRef = await gh(token, repoPath + "/git/ref/heads/development");
        const testedDevSha = String(devRef.object?.sha || "");
        if (!/^[0-9a-f]{40}$/i.test(testedDevSha) ||
            !await verifyReleaseSources(token, item, testedDevSha)) {
          return fail("PR-underlaget finns inte i aktuell DEV-version. Ingen LIVE-kandidat skapades.", 409);
        }

        const comparison = await gh(token, repoPath + "/compare/" + pr.merge_commit_sha + "..." + testedDevSha);
        if (!(comparison.status === "identical" ||
              comparison.status === "ahead" &&
              String(comparison.merge_base_commit?.sha || "").toLowerCase() === String(pr.merge_commit_sha).toLowerCase()) ||
            !Array.isArray(comparison.files) || comparison.files.length >= 300) {
          return fail("DEV-historiken efter PR-merge kunde inte verifieras fullständigt. Ingen LIVE-kandidat skapades.", 409);
        }
        const sourceFiles = new Set(item.features || []);
        const changedSourceFiles = comparison.files.filter((file: any) => sourceFiles.has(String(file.filename || "")));
        if (changedSourceFiles.length && await laterChangesOverlapAcceptedPatch(token, item, changedSourceFiles)) {
          return fail("Överlappande ändringar har ändrats efter DEV-mergen. Granska den aktuella DEV-versionen först.", 409);
        }

        const [checkResponse, statusResponse] = await Promise.all([
          ghReadWithRetry(token, repoPath + "/commits/" + pr.head.sha + "/check-runs?per_page=100"),
          ghReadWithRetry(token, repoPath + "/commits/" + pr.head.sha + "/status"),
        ]);
        const checkRuns = Array.isArray(checkResponse.check_runs) ? checkResponse.check_runs : [];
        const statuses = Array.isArray(statusResponse.statuses) ? statusResponse.statuses : [];
        if ((!checkRuns.length && !statuses.length) ||
            Number(checkResponse.total_count) > checkRuns.length ||
            checkRuns.some((check: any) => check.status !== "completed" ||
              !["success", "neutral", "skipped"].includes(check.conclusion)) ||
            (statuses.length > 0 && statusResponse.state !== "success")) {
          return fail("PR-CI är inte helt godkänd. Vänta in kontrollerna innan LIVE-förberedelse.", 409);
        }

        await verifyPublishedManifest("development", testedDevSha);
        const acceptance = await recordDevAcceptance(writeToken, data.pullRequestNumber, user.email || "Zeus");
        const liveCandidate = await autoPrepareLiveCandidate(writeToken, data.pullRequestNumber, user.email || "Zeus", acceptance);
        return json({
          ok: true,
          message: liveCandidate.state === "requested"
            ? "DEV-acceptansen registrerades och OLYMPIA förbereder en separat LIVE-kandidat. Ingen LIVE-publicering skedde."
            : "DEV-acceptansen registrerades. LIVE-förberedelsens status behöver kontrolleras i OLYMPIA.",
          acceptance,
          liveCandidate,
          testedDevSha,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA merged DEV candidate preparation failed", JSON.stringify({ pr: data.pullRequestNumber, code }));
        return fail(
          code === "DEPLOYMENT_MANIFEST_UNVERIFIED"
            ? "Den aktuella DEV-publiceringen kunde inte verifieras. Ingen LIVE-kandidat skapades."
            : "LIVE-kandidat kunde inte förberedas säkert. LIVE är oförändrat.",
          502,
        );
      }
    }
    if (data.action === "set_pull_request_draft") {
      if (!Number.isInteger(data.pullRequestNumber) || data.pullRequestNumber < 1 ||
          typeof data.pullRequestHeadSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.pullRequestHeadSha) ||
          typeof data.draft !== "boolean") return fail("Ogiltig PR-statusbegäran.", 400);
      try {
        const token = await githubToken("set_pull_request_draft");
        const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + data.pullRequestNumber);
        if (pr.state !== "open" || pr.base?.ref !== "development" || pr.head?.sha !== data.pullRequestHeadSha) {
          return fail("PR:en har ändrats eller är inte en öppen DEV-PR. Uppdatera OLYMPIA.", 409);
        }
        if (pr.draft === data.draft) return json({ ok: true, draft: pr.draft, unchanged: true });
        const node = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + data.pullRequestNumber);
        if (!node.node_id) return fail("GitHub saknar PR-identitet.", 502);
        const mutation = data.draft
          ? "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{isDraft}}}"
          : "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}";
        const response = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ query: mutation, variables: { id: node.node_id } }),
        });
        const payload = await response.json();
        if (!response.ok || payload.errors?.length) {
          const codes = Array.isArray(payload.errors) ? payload.errors.map((entry: { type?: string; extensions?: { code?: string } }) => String(entry.extensions?.code || entry.type || "GRAPHQL_ERROR")).slice(0, 3) : [];
          console.error("OLYMPIA draft GitHub GraphQL rejected", { httpStatus: response.status, errorCodes: codes, reasons: Array.isArray(payload.errors) ? payload.errors.map((entry: { message?: string }) => String(entry.message || "unknown").slice(0, 240)).slice(0, 3) : [] });
          throw new Error(codes.includes("FORBIDDEN") ? "GITHUB_DRAFT_TRANSITION_FORBIDDEN" : "GITHUB_DRAFT_TRANSITION_FAILED");
        }
        const updated = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + data.pullRequestNumber);
        if (updated.draft !== data.draft) throw new Error("GITHUB_DRAFT_VERIFICATION_FAILED");
        return json({ ok: true, draft: updated.draft });
      } catch (error) {
        console.error("OLYMPIA draft transition failed", error instanceof Error ? error.message : "unknown");
        return fail(error instanceof Error && error.message === "GITHUB_DRAFT_TRANSITION_FORBIDDEN" ? "GitHub nekar OLYMPIAs Ready-ändring (FORBIDDEN). Ingen ändring har gjorts." : "GitHub kunde inte ändra Draft-status. Ingen lyckad ändring bekräftad.", 502);
      }
    }
    if (data.action === "review_pull_request") {
      if (!Number.isInteger(data.pullRequestNumber) || data.pullRequestNumber < 1 ||
          typeof data.pullRequestHeadSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.pullRequestHeadSha)) {
        return fail("PR-nummer eller versions-SHA saknas.", 400);
      }
      try {
        const token = await githubToken("review_pull_request");
        const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + data.pullRequestNumber);
        if (pr.state !== "open" || pr.draft || pr.base?.ref !== "development" || pr.head?.sha !== data.pullRequestHeadSha) {
          return fail("PR:en är inte en aktuell, öppen DEV-ändring. Uppdatera OLYMPIA och prova igen.", 409);
        }
        const review = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + data.pullRequestNumber + "/reviews", {
          method: "POST", body: JSON.stringify({ commit_id: data.pullRequestHeadSha, event: "APPROVE" }),
        });
        return json({ ok: true, message: "PR #" + data.pullRequestNumber + " godkändes i GitHub.", reviewId: review.id });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        console.error("OLYMPIA PR review failed", code);
        return fail("PR-godkännandet kunde inte registreras. Ingen ändring gjordes.", 502);
      }
    }
    if (data.action === "candidate_check") {
      if (!Number.isInteger(data.candidateIssue) || data.candidateIssue < 1 ||
          typeof data.itemId !== "string" || !/^(?:PILOT-[0-9]{3}|PR-[1-9][0-9]*)$/.test(data.itemId) ||
          typeof data.testedDevSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.testedDevSha)) {
        return fail("Kandidatens ärende eller testade DEV-version är ogiltig.", 400);
      }
      try {
        const token = await githubToken("candidate_check");
        const item = await workItem(token, data.itemId);
        if (!item.ready_for_human_acceptance || !configuredWorkItem(item) ||
            !await verifyReleaseSources(token, item, data.testedDevSha)) {
          return fail("Pilotens registrerade PR-underlag kunde inte verifieras.", 409);
        }
        const status = await inspectCandidate(token, item, data.candidateIssue, data.testedDevSha);
        return json({ ok: true, ...status });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        console.error("OLYMPIA candidate check failed", code);
        return fail("Kandidatstatus kunde inte verifieras just nu. Slutgodkännandet är låst; försök igen.", 502);
      }
    }

    if (!DECISIONS.has(data.decision)) return fail("Ogiltigt beslut.", 400);
    if (typeof data.itemId !== "string" || !/^(?:PILOT-[0-9]{3}|PR-[1-9][0-9]*)$/.test(data.itemId)) return fail("Ogiltigt ärende-ID.", 400);
    if (typeof data.testedDevSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.testedDevSha)) return fail("Testad DEV-version saknas eller är ogiltig.", 400);

    const token = await githubToken(data.decision);
    const item = await workItem(token, data.itemId);
    if (!item.ready_for_human_acceptance || !/^[0-9a-f]{40}$/i.test(item.dev_sha || "") || !configuredWorkItem(item)) {
      return fail("Pilotens källversion eller PR-underlag är inte verifierat. Ingen skrivning utfördes.", 409);
    }
    if (["accept", "pandoras_ask", "release_package", "final_approval"].includes(data.decision) &&
        !await verifyReleaseSources(token, item, data.testedDevSha)) {
      return fail("Pilotens registrerade PR-underlag finns inte i den testade DEV-versionen. Ingen skrivning utfördes.", 409);
    }

    if (data.decision !== "final_approval") {
      const ref = await gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/development");
      if (ref.object?.sha !== data.testedDevSha) {
        return fail("DEV har ändrats sedan sidan hämtades. Uppdatera OLYMPIA och prova igen.", 409);
      }
    }

    if (data.decision === "final_approval") {
      let candidate;
      try {
        candidate = await verifyCandidate(token, item, data);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        console.error("OLYMPIA LIVE final approval candidate verification failed", JSON.stringify({ code: code || "UNKNOWN" }));
        if (isTransientCandidateReadError(code)) {
          return fail("GitHub kunde inte verifiera releasekontrollerna just nu. Ingen LIVE-ändring gjordes; uppdatera status och försök igen.", 503);
        }
        const messages: Record<string, string> = {
          CANDIDATE_INPUT_INVALID: "Kandidatens ID eller SHA saknas.",
          CANDIDATE_DECISION_MISMATCH: "Kandidatbeslutet hör inte till det här ärendet.",
          CANDIDATE_NOT_READY: "Releasekandidaten är inte verifierad. LIVE förblir oförändrat.",
          CANDIDATE_REPORT_INCOMPLETE: "Kandidatrapporten saknar nödvändiga uppgifter.",
          LIVE_BASELINE_CHANGED: "LIVE har ändrats sedan kandidaten skapades. Skapa en ny kandidat.",
          RELEASE_PR_NOT_VALID: "Releaseförslaget är inte öppet, mergebart och verifierat mot main.",
          CANDIDATE_CHECKS_NOT_GREEN: "Releaseförslagets CI-kontroller är inte godkända. LIVE förblir oförändrat.",
          CANDIDATE_STATUS_NOT_GREEN: "Releaseförslagets statuskontroller är inte godkända. LIVE förblir oförändrat.",
          RELEASE_PR_DECISION_MISMATCH: "Releaseförslaget pekar på ett annat Zeus-beslut.",
          CANDIDATE_HEAD_CHANGED: "Releaseförslaget har ändrats. Aktuell SHA och dess kontroller måste hämtas igen.",
          CANDIDATE_TREE_MISMATCH: "Releaseförslagets kod avviker från den testade kandidaten.",
          DEPLOYMENT_MANIFEST_UNVERIFIED: "Aktuell DEV- eller LIVE-publicering kunde inte verifieras. Slutgodkännandet spärrades; ingen ändring gjordes i LIVE.",
        };
        return fail(messages[code] || "Kandidaten kunde inte verifieras. LIVE förblir oförändrat.", 409);
      }
      // LIVE approval requires a real, verified preview of the exact release PR SHA.
      // A green build artifact alone must never authorize publication.
      const previewUrl = await verifiedCandidatePreview(token, candidate.pr.head.sha);
      if (!previewUrl) return fail("Kandidatens Cloudflare-preview kunde inte verifieras. LIVE förblir oförändrat.", 409);
      const approvalIssue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues", {
        method: "POST",
        body: JSON.stringify({ title: title(item, data.decision), body: issueBody(item, { ...data, releaseGroup: "Kandidat #" + data.candidateIssue }, user.email) }),
      });
      const liveBeforeMerge = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/main");
      if (liveBeforeMerge.sha !== candidate.liveSha) {
        return fail("LIVE ändrades under slutgodkännandet. Skapa en ny kandidat; LIVE är oförändrat.", 409);
      }
      const releaseBeforeMerge = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + candidate.pr.number);
      if (releaseBeforeMerge.head?.sha !== data.releasePrSha) {
        return fail("Releaseförslagets SHA ändrades efter Zeus-godkännandet. Ingen merge genomfördes; hämta aktuell status igen.", 409);
      }
      const merged = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + candidate.pr.number + "/merge", {
        method: "PUT",
        body: JSON.stringify({ sha: data.releasePrSha, merge_method: "squash" }),
      });
      if (!merged.merged) return fail("Slutgodkännandet sparades, men GitHub kunde inte merge:a releaseförslaget. LIVE ändrades inte.", 502);
      const finalBody = issueBody(item, { ...data, releaseGroup: "Kandidat #" + data.candidateIssue }, user.email) +
        "\n\n## OLYMPIA LIVE release\n- Merge SHA: " + merged.sha +
        "\n- Status: LIVE deploy startad; OLYMPIA verifierar publicerad version.";
      try {
        await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + approvalIssue.number, {
          method: "PATCH",
          body: JSON.stringify({ body: finalBody }),
        });
      } catch (_error) {
        console.error("OLYMPIA LIVE merge succeeded but journal update failed", approvalIssue.number);
      }
      return json({
        ok: true,
        message: "Slutgodkännandet sparades. Releaseförslaget är mergat till LIVE och Pages-deploy startar.",
        issue: { number: approvalIssue.number, url: approvalIssue.html_url },
        releasePr: { number: candidate.pr.number, url: candidate.pr.html_url },
        mergeSha: merged.sha,
        itemId: item.id,
        devSha: data.testedDevSha,
        decision: data.decision,
      });
    }

    if (data.decision === "pandoras_ask" || data.decision === "release_package") {
      const issues = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&creator=" + encodeURIComponent(await appBotLogin()));
      const accepted = await hasAcceptedFeatureVersion(token, issues as any[], item, data.testedDevSha);
      if (!accepted) return fail("Godkänn ändringen i DEV först. Om berörda filer har ändrats sedan godkännandet behöver du prova igen.", 409);
      if (data.decision === "pandoras_ask") {
        const appLogin = await appBotLogin();
        const live = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/main");
        const prior = (issues as any[]).filter(issue => {
          const body = String(issue.body || "");
          return issue.user?.login === appLogin && !issue.pull_request &&
            body.includes("- Beslut: PANDORAS ASK") && body.includes("- Ärende-ID: " + item.id) &&
            /^[0-9a-f]{40}$/i.test(body.match(/- Testad DEV-commit \(full SHA\): ([0-9a-f]{40})/i)?.[1] || "");
        }).sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
        for (const previous of prior) {
          const previousBody = String(previous.body || "");
          const previousTestedSha = previousBody.match(/- Testad DEV-commit \(full SHA\): ([0-9a-f]{40})/i)?.[1];
          if (!previousTestedSha || !await hasAcceptedFeatureVersion(token, issues as any[], item, previousTestedSha)) continue;
          const comments = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues/" + previous.number + "/comments?per_page=100");
          const reports = (comments as any[]).filter(comment => {
            const body = String(comment.body || "");
            return comment.user?.login === "github-actions[bot]" &&
              body.includes("## OLYMPIA release candidate") &&
              body.includes("- Verified DEV SHA: " + previousTestedSha);
          }).sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
          const latest = reports[0];
          const baseline = String(latest?.body || "").match(/- LIVE rollback baseline: ([0-9a-f]{40})/i)?.[1];
          if (latest && baseline && baseline !== live.sha) continue;
          if (latest?.body?.includes("READY_FOR_ZEUS_FINAL_APPROVAL")) {
            return json({
              ok: true,
              message: "LIVE-kandidaten för det här ärendet är redan förberedd. OLYMPIA återanvänder samma beslut och releaseförslag.",
              issue: { number: previous.number, url: previous.html_url },
              requestBranch: null,
              candidateStarted: true,
              itemId: item.id,
              devSha: data.testedDevSha,
              decision: data.decision,
            });
          }
          try {
            const requestBranch = await startCandidateRequest(token, previous.number, item, { ...data, testedDevSha: previousTestedSha });
            return json({
              ok: true,
              message: "Pandoras ask återupptogs på samma beslut. Ingen dubblett av releaseförslaget skapas.",
              issue: { number: previous.number, url: previous.html_url },
              requestBranch,
              candidateStarted: true,
              itemId: item.id,
              devSha: data.testedDevSha,
              decision: data.decision,
            });
          } catch (_error) {
            return fail("Den befintliga Pandoras ask kunde inte återupptas säkert. LIVE är oförändrat.", 503);
          }
        }
      }
    }

    const decisionIssue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues", {
      method: "POST",
      body: JSON.stringify({ title: title(item, data.decision), body: issueBody(item, data, user.email) }),
    });
    let requestBranch: string | null = null;
    let candidateStarted: boolean | null = null;
    if (data.decision === "pandoras_ask") {
      try {
        requestBranch = await startCandidateRequest(token, decisionIssue.number, item, data);
        candidateStarted = true;
      } catch (requestError) {
        candidateStarted = false;
        console.error("OLYMPIA decision saved but release candidate request did not start", decisionIssue.number);
      }
    }
    return json({
      ok: true,
      message: data.decision === "release_package"
        ? "Ändringen lades i releasepaketet. Ingen LIVE-PR har startats."
        : candidateStarted === true
        ? "Pandoras ask registrerades. En selektiv LIVE-PR förbereds från verifierad kod; inget publiceras ännu."
        : candidateStarted === false
        ? "Pandoras ask registrerades, men kandidatkontrollen kunde inte starta. LIVE är oförändrat."
        : "Beslutet sparades i GitHub. OLYMPIA är uppdaterat.",
      issue: { number: decisionIssue.number, url: decisionIssue.html_url },
      requestBranch,
      candidateStarted,
      itemId: item.id,
      devSha: data.testedDevSha,
      decision: data.decision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "OLYMPIA_BACKEND_NOT_CONFIGURED") return fail("GitHub App saknas i DEV-serverhemligheterna. Ingen skrivning utfördes.", 503);
    if (message === "WORK_QUEUE_UNKNOWN") return fail("Ärendekön kunde inte verifieras. Ingen skrivning utfördes.", 503);
    if (message === "WORK_ITEM_NOT_FOUND") return fail("Ärendet hittades inte.", 404);
    if (message === "SOURCE_PR_NOT_MERGED_TO_DEV" || message === "SOURCE_PR_NOT_IN_DEV") return fail("PR:en måste vara mergad till DEV innan den kan godkännas eller skickas vidare.", 409);
    if (message === "SOURCE_PR_FILES_UNKNOWN") return fail("PR:ens ändrade filer kunde inte läsas.", 502);
    console.error("OLYMPIA decision bridge failed", message);
    return fail("Beslutet kunde inte sparas. Ingen ändring registrerades.", 502);
  }
}
