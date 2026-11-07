import { createClient } from "npm:@supabase/supabase-js@2.58.0";

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
    : decision === "pull_request_list" || decision === "pull_request_status"
    ? { pull_requests: "read", checks: "read", statuses: "read" }
    : decision === "idea_verify_live"
    ? { contents: "read", issues: "read", pull_requests: "read" }
    : (decision === "candidate_check" || decision === "auto_candidate_diagnostics")
    ? { contents: "read", issues: "read", pull_requests: "read" }
    : decision === "review_pull_request"
    ? { pull_requests: "write" }
    : decision === "approve_and_merge_dev"
    ? { pull_requests: "write", issues: "write", contents: "write" }
    : { issues: "write", contents: "write" };
  if (decision === "final_approval") Object.assign(permissions, { pull_requests: "write" });
  const readOnlyPrAction = decision === "pull_request_list" || decision === "pull_request_status";
  const tokenUrl = "https://api.github.com/app/installations/" + encodeURIComponent(installationId) + "/access_tokens";
  const tokenHeaders = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + jwt, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const requestToken = (body: Record<string, unknown>) => fetch(tokenUrl, {
    method: "POST", headers: tokenHeaders, body: JSON.stringify(body),
  });
  let res = await requestToken({ permissions, repository_ids: [1403008145] });
  if (res.status === 422 && readOnlyPrAction) {
    // An installation may lack the explicitly requested checks/statuses scope.
    // For read-only PR actions, use the installation's existing permissions
    // without requesting any new permissions. Write actions never fall back.
    console.warn("OLYMPIA read-only GitHub token: requested permission subset unavailable; using installed permissions");
    res = await requestToken({ repository_ids: [1403008145] });
  }
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
  const res = await fetch("https://api.github.com" + path, {
    ...init,
    headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (init.method === "PUT" && /\/pulls\/[0-9]+\/merge$/.test(path)) {
      console.error("OLYMPIA GitHub merge rejected", JSON.stringify({ status: res.status, reason: String(data.message || "unknown").slice(0, 240) }));
    }
    throw new Error("GITHUB_REQUEST_FAILED_" + res.status);
  }
  return data;
}
async function ghPublic(path: string) {
  const res = await fetch("https://api.github.com" + path, {
    headers: { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("GITHUB_PUBLIC_REQUEST_FAILED_" + res.status);
  return data;
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
    if (!comparison.files.some((file: any) => protectedPaths.has(file.filename))) return true;
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
    ghPublic("/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/check-runs?per_page=100"),
    ghPublic("/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/status"),
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
      message: blocked ? "Kandidatkontrollen blockerade publiceringen. LIVE är oförändrat." : "Kandidaten väntar på verifierad releasekontroll.",
      candidateRunUrl: runMatch?.[1] || null,
      releasePr: candidatePrMatch ? Number(candidatePrMatch[1]) : null,
      releaseUrl: candidatePrMatch?.[2] || null,
      releasePrSha,
    };
  }
  const sourcePrNumber = Number(String(item.id || "").match(/^PR-([1-9][0-9]*)$/)?.[1] || 0);
  const sourcePrLine = String(candidatePr?.body || "").match(/^- Source DEV PRs: (.+)$/m)?.[1] || "";
  const mergedReleaseIsForThisCandidate = Boolean(
    candidatePr?.merged_at &&
    candidatePr.base?.ref === "main" &&
    candidatePr.user?.login === appLogin &&
    candidatePr.head?.sha === releasePrSha &&
    candidatePr.merge_commit_sha &&
    sourcePrNumber > 0 &&
    sourcePrLine.split(/\s*,\s*/).includes("#" + sourcePrNumber) &&
    String(candidatePr.body || "").includes("Zeus decision journal: #" + issueNumber) &&
    releasePrTreeSha === treeMatch[1]
  );
  if (mergedReleaseIsForThisCandidate) {
    const publication = await liveMergePublicationStatus(token, String(candidatePr.merge_commit_sha));
    if (publication.onMain) {
      return {
        ready: false,
        published: publication.published,
        blocked: false,
        message: publication.published ? "Publicerad i LIVE · verifierad." : "LIVE-merge genomförd; inväntar verifierad Pages-publicering.",
        candidateTreeSha: treeMatch[1],
        releasePr: Number(candidatePrMatch[1]),
        releaseUrl: candidatePrMatch[2],
        releasePrSha,
        liveMergeSha: String(candidatePr.merge_commit_sha),
      };
    }
  }
  try {
    if (!releasePrSha || !releasePrTreeSha) throw new Error("CANDIDATE_HEAD_CHANGED");
    const verified = await verifyCandidate(token, item, {
      candidateIssue: issueNumber,
      candidateTreeSha: releasePrTreeSha,
      releasePrSha,
      testedDevSha,
    });
    const prMatch = String(report.body || "").match(/- Release PR: #(\d+) · (https:\/\/[^\s]+)/i);
    if (!prMatch) throw new Error("CANDIDATE_REPORT_INCOMPLETE");
    return {
      ready: true,
      blocked: false,
      message: "Redo för LIVE – releaseförslag verifierat.",
      candidateTreeSha: verified.candidateTreeSha,
      releasePr: Number(prMatch[1]),
      releaseUrl: prMatch[2],
      releasePrSha: verified.pr.head.sha,
      previewUrl: await verifiedCandidatePreview(token, verified.pr.head.sha),
      candidateRunUrl: runMatch?.[1] || null,
      liveSha: verified.liveSha,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      CANDIDATE_NOT_READY: "Kandidatrapporten är inte klar. LIVE är oförändrat.",
      CANDIDATE_REPORT_INCOMPLETE: "Kandidatrapporten saknar nödvändiga uppgifter.",
      LIVE_BASELINE_CHANGED: "LIVE har ändrats sedan kandidaten skapades. En ny kandidat behövs.",
      RELEASE_PR_NOT_VALID: "Releaseförslaget är inte öppet, mergebart och verifierat mot main.",
      CANDIDATE_CHECKS_NOT_GREEN: "Releaseförslagets CI-kontroller är inte godkända.",
      CANDIDATE_STATUS_NOT_GREEN: "Releaseförslagets statuskontroller är inte godkända.",
      RELEASE_PR_DECISION_MISMATCH: "Releaseförslaget pekar på ett annat Zeus-beslut.",
      CANDIDATE_HEAD_CHANGED: "Releaseförslaget har ändrats. Aktuell SHA och dess kontroller måste hämtas igen.",
      CANDIDATE_TREE_MISMATCH: "Releaseförslagets kod avviker från den testade kandidaten.",
      DEPLOYMENT_MANIFEST_UNVERIFIED: "Aktuell DEV- eller LIVE-publicering kunde inte verifieras.",
      CANDIDATE_SCOPE_NOT_ALLOWED: "Kandidaten innehåller ändringar utanför ärendets källomfattning.",
    };
    return {
      ready: false,
      blocked: true,
      message: messages[code] || "Kandidaten kunde inte verifieras. LIVE är oförändrat.",
      candidateTreeSha: releasePrTreeSha,
      releasePrSha,
      candidateRunUrl: runMatch?.[1] || null,
    };
  }
}

function title(item: any, decision: string) {
  const label: Record<string, string> = {
    accept: "ACCEPTANS",
    pandoras_ask: "PANDORAS ASK",
    release_package: "RELEASEPAKET",
    karon: "AVVAKTA · TILL KARON",
    needs_fix: "BEHÖVER RÄTTAS",
    final_approval: "LIVE APPROVAL",
  };
  return "[OLYMPIA " + label[decision] + "] " + item.id + " · " + item.title;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const response = await handleRequest(req);
  if (origin && ALLOWED_ORIGINS.has(origin)) response.headers.set("Access-Control-Allow-Origin", origin);
  return response;
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin");
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response("ok", { headers: { ...responseHeaders, "Access-Control-Allow-Origin": origin } });
  }
  if (req.method !== "POST") return fail("Endast POST stöds.", 405);
  if (!ALLOWED_ORIGINS.has(req.headers.get("Origin") || "")) return fail("Origin nekad.", 403);

  try {
    const auth = req.headers.get("Authorization") || "";
    const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return fail("Logga in i ALEA DEV för att registrera beslut.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const allowedEmail = Deno.env.get("OLYMPIA_ZEUS_EMAIL")?.trim().toLowerCase();
    if (!supabaseUrl || !supabaseKey || !allowedEmail) return fail("Zeus-autentisering är inte konfigurerad i DEV.", 503);
    const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await client.auth.getUser(bearer);
    const user = authData?.user;
    if (authError || !user || !user.email_confirmed_at || user.email?.toLowerCase() !== allowedEmail) {
      return fail("Kontot är inte auktoriserat att fatta OLYMPIA-beslut.", 403);
    }
    const ideaClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const data = await req.json();
    if (!data || typeof data !== "object") return fail("Ogiltig begäran.", 400);
    if (data.action === "session_check") return json({ ok: true });
    if (data.action === "system_alert_list" || data.action === "system_alert_ack") {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) return fail("OLYMPIA alert storage is not configured.", 503);
      const alertClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (data.action === "system_alert_list") {
        const [alertsResult, healthResult] = await Promise.all([
          alertClient.from("olympia_system_alerts").select("*").order("occurred_at", { ascending: false }).limit(100),
          alertClient.from("olympia_system_health").select("*").order("updated_at", { ascending: false }).limit(20),
        ]);
        if (alertsResult.error || healthResult.error) return fail("OLYMPIA alert data could not be read.", 503);
        return json({ ok: true, alerts: alertsResult.data || [], health: healthResult.data || [] });
      }
      const alertId = String(data.alert_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(alertId)) return fail("Ogiltigt larm-ID.", 400);
      const { data: alert, error: ackError } = await alertClient.rpc("olympia_system_alert_ack", {
        alert_id: alertId, actor_id: user.id,
      });
      if (ackError || !alert?.id) return fail("Larmet kunde inte kvitteras.", 409);
      return json({ ok: true, alert });
    }
    if (String(data.action || "").startsWith("idea_")) {
      const table = ideaClient.from("olympia_ideas");
      const statuses = new Set(["idea_bank", "to_process", "in_olympia", "done"]);
      const classifications = new Set(["fully_handled", "partially_handled", "not_handled", "superseded", "uncertain"]);
      const canonicalPr = (pr: any) => {
        const number = Number(pr?.number);
        if (!Number.isSafeInteger(number) || number < 1 || !classifications.has(String(pr?.classification || "")) ||
            !String(pr?.purpose || "").trim() || !String(pr?.recommendation || "").trim() ||
            String(pr.purpose).length > 2000 || String(pr.remaining_need || "").length > 4000 || String(pr.recommendation).length > 2000) {
          throw new Error("HISTORICAL_PR_INVALID");
        }
        return { number, url: "https://github.com/" + OWNER + "/" + REPO + "/pull/" + number,
          purpose: String(pr.purpose).trim(), classification: pr.classification,
          remaining_need: String(pr.remaining_need || "").trim(), recommendation: String(pr.recommendation).trim(), hidden: pr.hidden === true };
      };
      const eventFor = (action: string, actor: string, changes: Record<string, unknown>) => ({ action, actor, at: new Date().toISOString(), changes });
      const checkedIdea = (value: any) => {
        if (!value || typeof value !== "object" || !String(value.title || "").trim() || String(value.title).trim().length > 160 ||
            String(value.description || "").length > 4000 || !Array.isArray(value.historical_prs) || value.historical_prs.length > 38 ||
            !statuses.has(String(value.status || "idea_bank"))) throw new Error("IDEA_INPUT_INVALID");
        const prs = value.historical_prs.map(canonicalPr);
        if (new Set(prs.map((pr: any) => pr.number)).size !== prs.length) throw new Error("DUPLICATE_HISTORICAL_PR");
        const priority = Number(value.priority ?? 2);
        if (!Number.isInteger(priority) || priority < 1 || priority > 3) throw new Error("IDEA_INPUT_INVALID");
        return { title: String(value.title).trim(), description: String(value.description || "").trim(), priority, historical_prs: prs };
      };
      const errorText = (error: any) => {
        const code = String(error?.message || "");
        const databaseCode = String(error?.code || "");
        if (databaseCode === "PGRST205" || /could not find the table ['\"]public\.olympia_ideas['\"] in the schema cache/i.test(code)) {
          return fail("UPPSLAG-tabellen saknas i DEV-databasen. Databasmigrationen behöver driftsättas.", 503);
        }
        if (databaseCode === "42501" || /row-level security|permission denied for table/i.test(code)) {
          return fail("Zeus saknar administratörsbehörighet för UPPSLAG i DEV.", 403);
        }
        const messages: Record<string, string> = {
          IDEA_INPUT_INVALID: "Kontrollera rubrik, beskrivning och uppslagets PR-underlag.",
          HISTORICAL_PR_INVALID: "Varje historisk PR behöver nummer, syfte, klassning och rekommenderad åtgärd.",
          DUPLICATE_HISTORICAL_PR: "Samma historiska PR får bara kopplas en gång per uppslag.",
          IDEA_NOT_FOUND: "Uppslaget finns inte längre. Uppdatera sidan.",
          IDEA_CHANGED: "Uppslaget har ändrats i en annan vy. Läs in det igen innan du sparar.",
          HISTORICAL_PR_PROTECTED: "Historiska PR-kopplingar kan inte tas bort.",
          IDEA_DELETE_PROTECTED: "Historiska uppslag får inte raderas.",
          ACTIVE_PR_INVALID: "Välj en öppen PR mot development som aktivt utvecklingsärende.",
          ACTIVE_PR_ALREADY_REGISTERED: "Den aktiva PR:n finns redan som historisk PR på detta uppslag.",
          IMPORT_UNVERIFIED: "Importfilen behöver vara CLEAN OLYMPUS 2026-11-03, innehålla exakt 38 unika PR:ar och bekräftas efter granskning.",
          LIVE_NOT_VERIFIED: "LIVE-publicering har inte verifierats. Uppslaget är oförändrat.",
        };
        console.error("OLYMPIA UPPSLAG request failed", code.slice(0, 100));
        return fail(messages[code] || "UPPSLAG kunde inte spara ändringen. Kontrollera anslutningen och försök igen.", code === "IDEA_CHANGED" ? 409 : 400);
      };
      try {
        if (data.action === "idea_list") {
          const { data: rows, error } = await table.select("*").order("updated_at", { ascending: false });
          if (error) throw error;
          const ideas = Array.isArray(rows) ? rows : [];
          const hiddenPrNumbers = [...new Set(ideas.flatMap((idea: any) => (idea.historical_prs || []).filter((pr: any) => pr.hidden).map((pr: any) => Number(pr.number))))];
          return json({ ok: true, ideas, hiddenPrNumbers });
        }
        if (data.action === "idea_save") {
          const input = checkedIdea({ ...data, status: "idea_bank" });
          if (data.id) {
            const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
            if (readError) throw readError;
            if (!current) throw new Error("IDEA_NOT_FOUND");
            if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
            if (current.status === "in_olympia" || current.status === "done") throw new Error("IDEA_CHANGED");
            if ((current.historical_prs || []).length && input.historical_prs.length < current.historical_prs.length) throw new Error("HISTORICAL_PR_PROTECTED");
            const history = [...(Array.isArray(current.history) ? current.history : []), eventFor("edit", user.id, { title: input.title, description: input.description, historical_pr_count: input.historical_prs.length })];
            const { data: saved, error } = await table.update({ ...input, history, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", current.id).eq("updated_at", current.updated_at).select("*").single();
            if (error) throw error;
            return json({ ok: true, idea: saved });
          }
          const now = new Date().toISOString();
          const row = { ...input, status: "idea_bank", active_pr_number: null, completed_at: null, created_by: user.id, updated_by: user.id, created_at: now, updated_at: now, history: [eventFor("created", user.id, { title: input.title })] };
          const { data: saved, error } = await table.insert(row).select("*").single();
          if (error) throw error;
          return json({ ok: true, idea: saved });
        }
        if (data.action === "idea_delete") {
          const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
          if (readError) throw readError;
          if (!current) throw new Error("IDEA_NOT_FOUND");
          if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
          if ((current.historical_prs || []).length || current.import_source || current.active_pr_number) throw new Error("IDEA_DELETE_PROTECTED");
          const { error } = await table.delete().eq("id", current.id).eq("updated_at", current.updated_at);
          if (error) throw error;
          return json({ ok: true, deletedId: current.id });
        }
        if (data.action === "idea_set_status") {
          if (!statuses.has(data.status) || data.status === "done" || data.status === "in_olympia") return fail("Välj Idébank eller Att bearbeta. Pågående och genomfört kräver särskild verifiering.", 400);
          const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
          if (readError) throw readError;
          if (!current) throw new Error("IDEA_NOT_FOUND");
          if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
          const { data: saved, error } = await table.update({ status: data.status, active_pr_number: null, completed_at: null,
            history: [...(current.history || []), eventFor("status_changed", user.id, { from: current.status, to: data.status })], updated_by: user.id, updated_at: new Date().toISOString() })
            .eq("id", current.id).eq("updated_at", current.updated_at).select("*").single();
          if (error) throw error;
          return json({ ok: true, idea: saved });
        }
        if (data.action === "idea_activate") {
          const number = Number(data.activePrNumber);
          if (!Number.isSafeInteger(number) || number < 1) throw new Error("ACTIVE_PR_INVALID");
          const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
          if (readError) throw readError;
          if (!current) throw new Error("IDEA_NOT_FOUND");
          if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
          if ((current.historical_prs || []).some((pr: any) => Number(pr.number) === number)) throw new Error("ACTIVE_PR_ALREADY_REGISTERED");
          const token = await githubToken("pull_request_list");
          const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number);
          if (pr.state !== "open" || pr.base?.ref !== "development" || pr.draft) throw new Error("ACTIVE_PR_INVALID");
          const { data: saved, error } = await table.update({ status: "in_olympia", active_pr_number: number, completed_at: null,
            history: [...(current.history || []), eventFor("activated", user.id, { active_pr_number: number, url: pr.html_url })], updated_by: user.id, updated_at: new Date().toISOString() })
            .eq("id", current.id).eq("updated_at", current.updated_at).select("*").single();
          if (error) throw error;
          return json({ ok: true, idea: saved, pullRequest: { number, url: pr.html_url, title: pr.title } });
        }
        if (data.action === "idea_hide_historical_pr") {
          const number = Number(data.number);
          if (!Number.isSafeInteger(number) || number < 1 || typeof data.hidden !== "boolean") throw new Error("HISTORICAL_PR_INVALID");
          const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
          if (readError) throw readError;
          if (!current) throw new Error("IDEA_NOT_FOUND");
          if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
          let found = false;
          const prs = (current.historical_prs || []).map((pr: any) => {
            if (Number(pr.number) !== number) return pr;
            found = true;
            return { ...pr, hidden: data.hidden };
          });
          if (!found) throw new Error("IDEA_NOT_FOUND");
          const { data: saved, error } = await table.update({ historical_prs: prs,
            history: [...(current.history || []), eventFor("historical_pr_filter_changed", user.id, { number, hidden: data.hidden })], updated_by: user.id, updated_at: new Date().toISOString() })
            .eq("id", current.id).eq("updated_at", current.updated_at).select("*").single();
          if (error) throw error;
          return json({ ok: true, idea: saved });
        }
        if (data.action === "idea_import") {
          const source = data.sourceReport || {};
          if (data.confirmImport !== true || source.name !== "CLEAN OLYMPUS" || source.date !== "2026-11-03" || source.openPrCount !== 38 || !Array.isArray(data.ideas) || !data.ideas.length || data.ideas.length > 38) throw new Error("IMPORT_UNVERIFIED");
          const prsSeen = new Set<number>();
          const rows = data.ideas.map((idea: any) => {
            const input = checkedIdea({ ...idea, status: "idea_bank" });
            if (!input.historical_prs.length) throw new Error("IMPORT_UNVERIFIED");
            for (const pr of input.historical_prs) {
              if (prsSeen.has(pr.number)) throw new Error("IMPORT_UNVERIFIED");
              prsSeen.add(pr.number);
            }
            const now = new Date().toISOString();
            return { ...input, status: "idea_bank", active_pr_number: null, completed_at: null, import_source: "CLEAN OLYMPUS · 2026-11-03",
              created_by: user.id, updated_by: user.id, created_at: now, updated_at: now,
              history: [eventFor("clean_olympus_import", user.id, { source_report: "CLEAN OLYMPUS · 2026-11-03", historical_pr_count: input.historical_prs.length })] };
          });
          if (prsSeen.size !== 38) throw new Error("IMPORT_UNVERIFIED");
          const { data: existing, error: readError } = await table.select("historical_prs");
          if (readError) throw readError;
          const existingNumbers = new Set((existing || []).flatMap((idea: any) => (idea.historical_prs || []).map((pr: any) => Number(pr.number))));
          if ([...prsSeen].some(number => existingNumbers.has(number))) throw new Error("IMPORT_UNVERIFIED");
          const { data: saved, error } = await table.insert(rows).select("id,title,status,historical_prs,created_at,updated_at");
          if (error) throw error;
          return json({ ok: true, importedCount: saved?.length || 0, ideas: saved });
        }
        if (data.action === "idea_verify_live") {
          const { data: current, error: readError } = await table.select("*").eq("id", data.id).maybeSingle();
          if (readError) throw readError;
          if (!current || current.status !== "in_olympia" || !Number.isSafeInteger(Number(current.active_pr_number))) throw new Error("LIVE_NOT_VERIFIED");
          if (current.updated_at !== data.expectedUpdatedAt) throw new Error("IDEA_CHANGED");
          const token = await githubToken("idea_verify_live");
          const number = Number(current.active_pr_number);
          const sourcePr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + number);
          if (sourcePr.state !== "closed" || sourcePr.merged !== true || sourcePr.base?.ref !== "development") throw new Error("LIVE_NOT_VERIFIED");
          const sourceMergeSha = String(sourcePr.merge_commit_sha || "");
          if (!/^[0-9a-f]{40}$/i.test(sourceMergeSha)) throw new Error("LIVE_NOT_VERIFIED");
          const botLogin = await appBotLogin();
          let decision: any = null;
          for (let page = 1; page <= 20; page++) {
            const issues = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&page=" + page + "&creator=" + encodeURIComponent(botLogin));
            if (!Array.isArray(issues)) throw new Error("LIVE_NOT_VERIFIED");
            decision = issues.find((issue: any) => {
              const body = String(issue.body || "");
              return !issue.pull_request && body.includes("- Ärende-ID: PR-" + number) && body.includes("- PR: #" + number) &&
                body.includes("- Beslut: PANDORAS ASK") && /^[0-9]+$/.test(String(issue.number));
            }) || null;
            if (decision || issues.length < 100) break;
          }
          if (!decision) throw new Error("LIVE_NOT_VERIFIED");
          const testedMatch = String(decision.body || "").match(/- Testad DEV-commit \(full SHA\): ([0-9a-f]{40})/i);
          if (!testedMatch) throw new Error("LIVE_NOT_VERIFIED");
          const sourceInTestedDev = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + sourceMergeSha + "..." + testedMatch[1]);
          const sourceOnDev = sourceInTestedDev.status === "identical" || sourceInTestedDev.status === "ahead" && String(sourceInTestedDev.merge_base_commit?.sha || "").toLowerCase() === sourceMergeSha.toLowerCase();
          if (!sourceOnDev) throw new Error("LIVE_NOT_VERIFIED");
          const [closedReleasePrs, live] = await Promise.all([
            gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls?state=closed&base=main&per_page=100&sort=updated&direction=desc&page=1"),
            gh(token, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/main"),
          ]);
          if (!Array.isArray(closedReleasePrs)) throw new Error("LIVE_NOT_VERIFIED");
          const releasePr = closedReleasePrs.find((candidate: any) => candidate.merged_at && candidate.base?.ref === "main" &&
            String(candidate.body || "").includes("Zeus decision journal: #" + decision.number));
          if (!releasePr || releasePr.merged !== true) throw new Error("LIVE_NOT_VERIFIED");
          const releaseMergeSha = String(releasePr.merge_commit_sha || ""), mainSha = String(live.object?.sha || "");
          if (!/^[0-9a-f]{40}$/i.test(releaseMergeSha) || !/^[0-9a-f]{40}$/i.test(mainSha)) throw new Error("LIVE_NOT_VERIFIED");
          const releaseComparison = await gh(token, "/repos/" + OWNER + "/" + REPO + "/compare/" + releaseMergeSha + "..." + mainSha);
          const releaseOnMain = releaseComparison.status === "identical" || releaseComparison.status === "ahead" && String(releaseComparison.merge_base_commit?.sha || "").toLowerCase() === releaseMergeSha.toLowerCase();
          const manifestResponse = await fetch(PAGES_BASE + "/deployment-manifest.json?ts=" + Date.now(), { headers: { "Accept": "application/json", "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000) });
          const manifest = manifestResponse.ok ? await manifestResponse.json().catch(() => null) : null;
          if (!releaseOnMain || manifest?.environment !== "main" || manifest?.source_sha !== mainSha) throw new Error("LIVE_NOT_VERIFIED");
          const verifiedAt = new Date().toISOString();
          const { data: saved, error } = await table.update({ status: "done", completed_at: verifiedAt,
            history: [...(current.history || []), eventFor("live_verified", user.id, { active_pr_number: number, source_merge_sha: sourceMergeSha, decision_issue: decision.number, release_pr_number: releasePr.number, release_merge_sha: releaseMergeSha, main_sha: mainSha, manifest_source_sha: manifest.source_sha })], updated_by: user.id, updated_at: verifiedAt })
            .eq("id", current.id).eq("updated_at", current.updated_at).select("*").single();
          if (error) throw error;
          return json({ ok: true, idea: saved, verification: { prNumber: number, decisionIssue: decision.number, releasePrNumber: releasePr.number, releaseMergeSha, mainSha, publishedSha: manifest.source_sha, verifiedAt } });
        }
        return fail("UPPSLAG-åtgärden känns inte igen.", 400);
      } catch (error) {
        const response = errorText(error);
        if (response.status !== 400) return response;
        return response;
      }
    }
    if (data.action === "auto_candidate_diagnostics") {
      if (!Number.isSafeInteger(data.pullRequestNumber) || data.pullRequestNumber < 1 ||
          typeof data.testedDevSha !== "string" || !/^[a-f0-9]{40}$/i.test(data.testedDevSha)) {
        return fail("Ange giltigt PR-nummer och fullständig testad DEV-SHA.", 400);
      }
      try {
        const token = await githubToken("auto_candidate_diagnostics");
        const number = data.pullRequestNumber;
        const sha = data.testedDevSha.toLowerCase();
        const repoPath = "/repos/" + OWNER + "/" + REPO;
        const lockBranch = "olympia/auto-candidates/pr-" + number + "-" + sha;
        let locked = false;
        try {
          const lock = await gh(token, repoPath + "/git/ref/heads/" + lockBranch);
          locked = true;
          if (String(lock.object?.sha || "").toLowerCase() !== sha) {
            return json({ ok: true, state: "inconsistent", locked: true, message: "Kandidatlåset pekar på fel commit. Manuell granskning krävs." });
          }
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
        }
        const appLogin = await appBotLogin();
        let issue: any = null;
        let scanComplete = false;
        for (let page = 1; page <= 20; page++) {
          const issues = await gh(token, repoPath + "/issues?state=all&per_page=100&page=" + page + "&creator=" + encodeURIComponent(appLogin));
          if (!Array.isArray(issues)) throw new Error("CANDIDATE_DIAGNOSTICS_ISSUES_INVALID");
          issue = issues.find((candidate: any) => {
            const body = String(candidate.body || "");
            return !candidate.pull_request && body.includes("- Beslut: PANDORAS ASK") &&
              body.includes("- Ärende-ID: PR-" + number) &&
              body.includes("- Testad DEV-commit (full SHA): " + sha);
          });
          if (issue || issues.length < 100) { scanComplete = true; break; }
        }
        if (!scanComplete) return json({ ok: true, state: "unknown", locked, message: "Journalen kunde inte genomsökas fullständigt. Ingen återställning tillåten." });
        let requestPresent = false;
        if (issue) {
          try {
            await gh(token, repoPath + "/git/ref/heads/" + encodeURIComponent("olympia/release-requests/decision-" + issue.number));
            requestPresent = true;
          } catch (error) {
            if (!(error instanceof Error) || error.message !== "GITHUB_REQUEST_FAILED_404") throw error;
          }
        }
        // Resolve the actual release candidate through the existing server verifier.
        // This is read-only; never infer readiness from the existence of an issue.
        let candidate: any = null;
        if (requestPresent && issue) {
          try {
            const item = await workItem(token, "PR-" + number);
            candidate = await inspectCandidate(token, item, issue.number, sha);
          } catch (error) {
            // Candidate diagnostics must survive preview lookup errors.
            // Never infer readiness or permit LIVE approval from a fallback.
            console.warn("OLYMPIA preview diagnostics unavailable", error instanceof Error ? error.message : "unknown");
            candidate = { ready: false, blocked: false, message: "Releasebegäran finns. Förhandsvisningen kunde inte verifieras; LIVE-beslut förblir låsta." };
          }
        }
        if (issue && (!candidate || candidate.blocked === false)) {
          try {
            const comments = await gh(token, repoPath + "/issues/" + issue.number + "/comments?per_page=100");
            if (!Array.isArray(comments)) throw new Error("CANDIDATE_JOURNAL_INVALID");
            const latest = comments.filter((comment: any) => String(comment.body || "").includes("## OLYMPIA release candidate")).at(-1);
            const body = String(latest?.body || "");
            if (/Status:\s*BLOCKED\b/i.test(body)) {
              const reason = body.match(/^- Felorsak:\s*(.+)$/im)?.[1] || "Se felande kontroll i workflowloggen.";
              const workflowRunUrl = body.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+/)?.[0] || null;
              candidate = {
                ready: false,
                blocked: true,
                message: "BLOCKERAD – LIVE-kandidat kunde inte skapas. Felorsak: " + reason,
                workflowRunUrl
              };
            }
          } catch (error) {
            console.warn("OLYMPIA candidate journal status unavailable", error instanceof Error ? error.message : "unknown");
          }
        }
        const state = locked ? (requestPresent ? "requested" : "needs_review") : (issue ? "unlocked_issue" : "not_started");
        return json({ ok: true, state, locked, requestPresent, candidate,
          issue: issue ? { number: issue.number, url: issue.html_url } : null,
          message: state === "needs_review" ? "Lås finns men releasebegäran är inte verifierad. Återställ inte automatiskt." :
            state === "requested" ? "Lås och releasebegäran hittade. Kontrollera kandidatens separata CI innan LIVE-beslut." :
            state === "unlocked_issue" ? "Releaseärende finns utan automatiskt lås. Manuell granskning krävs." :
            "Ingen automatisk kandidatbegäran hittades." });
      } catch (error) {
        console.error("OLYMPIA candidate diagnostics failed", error instanceof Error ? error.message : "UNKNOWN");
        return fail("Kandidatens lås eller journal kunde inte verifieras. Ingen ändring gjordes.", 502);
      }
    }
    if (data.action === "pull_request_list") {
      try {
        const token = await githubToken("pull_request_list");
        const open = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls?state=open&per_page=100&sort=updated&direction=desc");
        if (!Array.isArray(open)) throw new Error("GITHUB_PR_LIST_INVALID_RESPONSE");
        // Only recent merged DEV PRs are needed for the active decision queue.
        // Older accepted items remain visible from the persistent Zeus decision journal.
        const recentClosed = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls?state=closed&base=development&per_page=100&page=1&sort=updated&direction=desc");
        if (!Array.isArray(recentClosed)) throw new Error("GITHUB_PR_LIST_INVALID_RESPONSE");
        const closed = recentClosed.filter((pr: any) => Boolean(pr.merged_at) && pr.base?.ref === "development");
        const byNumber = new Map<number, any>();
        for (const pr of [...open, ...closed]) byNumber.set(Number(pr.number), pr);
        const candidateToken = await githubToken("auto_candidate_diagnostics");
        const botLogin = await appBotLogin();
        const candidateIssues = await gh(candidateToken, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&creator=" + encodeURIComponent(botLogin));
        if (!Array.isArray(candidateIssues)) throw new Error("GITHUB_CANDIDATE_ISSUES_INVALID");
        const candidateIssueByNumber = new Map<number, any>();
        const activeCandidatePrs = new Set<number>();
        for (const issue of candidateIssues) {
          if (issue.pull_request) continue;
          candidateIssueByNumber.set(Number(issue.number), issue);
          const body = String(issue.body || "");
          if (issue.state !== "open" || !body.includes("- Beslut: PANDORAS ASK")) continue;
          const match = body.match(/^- Ärende-ID: PR-([1-9][0-9]*)$/m);
          if (match) activeCandidatePrs.add(Number(match[1]));
        }
        const publishedCandidatePrs = new Map<number, string>();
        for (const issue of candidateIssues) {
          if (issue.pull_request) continue;
          const body = String(issue.body || "");
          if (issue.user?.login !== botLogin || !body.includes("- Beslut: SLUTGODKÄNNANDE LIVE")) continue;
          const prMatch = body.match(/^- Ärende-ID: PR-([1-9][0-9]*)$/m);
          const testedMatch = body.match(/^- Testad DEV-commit \(full SHA\): ([0-9a-f]{40})$/mi);
          const candidateMatch = body.match(/^- Kandidatärende: #([1-9][0-9]*)$/m);
          const mergeMatch = body.match(/^- Merge SHA: ([0-9a-f]{40})$/mi);
          if (!prMatch || !testedMatch || !candidateMatch || !mergeMatch) continue;
          const candidateIssue = candidateIssueByNumber.get(Number(candidateMatch[1]));
          const candidateBody = String(candidateIssue?.body || "");
          if (!candidateIssue || !candidateBody.includes("- Beslut: PANDORAS ASK") ||
              !candidateBody.includes("- Ärende-ID: PR-" + prMatch[1]) ||
              !candidateBody.includes("- Testad DEV-commit (full SHA): " + testedMatch[1])) continue;
          const publication = await liveMergePublicationStatus(candidateToken, mergeMatch[1]);
          if (publication.published) publishedCandidatePrs.set(Number(prMatch[1]), mergeMatch[1]);
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
        return json({ ok: true, pullRequests });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub PR list failed", code);
        return fail("GitHub PR-listan kunde inte hämtas (" + code + ").", 502);
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
          gh(token, path + "/pulls/" + data.pullRequestNumber),
          gh(token, path + "/commits/" + data.pullRequestHeadSha + "/status"),
          gh(token, path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100"),
        ]);
        if (pr.head?.sha !== data.pullRequestHeadSha) return fail("PR-versionen har ändrats. Uppdatera listan och hämta status igen.", 409);
        return json({
          ok: true,
          pullRequest: { state: pr.state, draft: pr.draft, mergeable: pr.mergeable, mergeableState: pr.mergeable_state },
          statuses: Array.isArray(status.statuses) ? status.statuses : [],
          combinedStatusState: String(status.state || 'unknown'),
          checkRuns: Array.isArray(checks.check_runs) ? checks.check_runs : [],
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        console.error("OLYMPIA GitHub PR status failed", code);
        return fail("GitHub PR-status kunde inte hämtas (" + code + ").", 502);
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
          ghPublic(path + "/commits/" + data.pullRequestHeadSha + "/check-runs?per_page=100"),
          ghPublic(path + "/commits/" + data.pullRequestHeadSha + "/status"),
        ]);
        const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
        const statuses = Array.isArray(status.statuses) ? status.statuses : [];
        if ((!runs.length && !statuses.length) || Number(checks.total_count) > runs.length ||
            runs.some((check: any) => check.status !== "completed" ||
              !["success", "neutral", "skipped"].includes(check.conclusion)) ||
            (statuses.length > 0 && status.state !== "success")) {
          throw new Error("CI_NOT_GREEN");
        }
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
          CI_NOT_GREEN: "CI är inte färdig eller godkänd. Vänta in kontrollerna och försök igen.",
          DEV_ACCEPTANCE_SOURCE_UNVERIFIED: "GitHub bekräftade DEV-merge, men ändringen kunde inte kopplas säkert till DEV. Uppdatera status innan nästa beslut.",
        };
        return json({ ok: false, stage, errorCode: code, message: (messages[code] || "DEV-merge kunde inte bekräftas av GitHub. Ingen lyckad merge rapporteras. Kontrollera status och försök igen.") + " (Steg: " + stage + ")" }, code === "GITHUB_REQUEST_FAILED_409" ? 409 : 502);
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
