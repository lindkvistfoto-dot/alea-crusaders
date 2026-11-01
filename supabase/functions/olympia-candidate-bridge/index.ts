import { verifyGitHubActionsOidcToken } from "./oidc.ts";

const OWNER = "lindkvistfoto-dot";
const REPO = "alea-crusaders";
const REPOSITORY_ID = "1403008145";
const OIDC_AUDIENCE = "alea-olympia-candidate-pr";
const GH_API = "https://api.github.com";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (message: string, status: number) => json({ ok: false, message }, status);
const base64url = (value: string) => btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

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
  const derBytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), character => character.charCodeAt(0));
  if (match[1] === "PRIVATE KEY") return derBytes;
  if (match[1] !== "RSA PRIVATE KEY") throw new Error("GITHUB_APP_KEY_INVALID");
  const algorithm = der(0x30, Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00));
  return der(0x30, joinBytes(Uint8Array.of(0x02, 0x01, 0x00), algorithm, der(0x04, derBytes)));
}
async function appJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
  const signingInput = header + "." + payload;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return signingInput + "." + btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function githubToken() {
  const appId = Deno.env.get("OLYMPIA_GITHUB_APP_ID");
  const installationId = Deno.env.get("OLYMPIA_GITHUB_INSTALLATION_ID");
  const privateKey = Deno.env.get("OLYMPIA_GITHUB_APP_PRIVATE_KEY");
  if (!appId || !installationId || !privateKey) throw new Error("OLYMPIA_BACKEND_NOT_CONFIGURED");
  const jwt = await appJwt(appId, privateKey);
  const response = await fetch(GH_API + "/app/installations/" + encodeURIComponent(installationId) + "/access_tokens", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + jwt,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      permissions: { contents: "read", issues: "read", pull_requests: "write" },
      repository_ids: [Number(REPOSITORY_ID)],
    }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    console.error("OLYMPIA candidate GitHub token rejected", response.status, String(details.message || "").slice(0, 160));
    throw new Error("GITHUB_APP_TOKEN_FAILED");
  }
  const result = await response.json();
  if (typeof result.token !== "string") throw new Error("GITHUB_APP_TOKEN_FAILED");
  return result.token as string;
}
async function gh(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(GH_API + path, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("GITHUB_REQUEST_FAILED_" + response.status);
  return result;
}
async function appBotLogin() {
  const appId = Deno.env.get("OLYMPIA_GITHUB_APP_ID");
  const privateKey = Deno.env.get("OLYMPIA_GITHUB_APP_PRIVATE_KEY");
  if (!appId || !privateKey) throw new Error("OLYMPIA_BACKEND_NOT_CONFIGURED");
  const response = await fetch(GH_API + "/app", {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + await appJwt(appId, privateKey),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error("GITHUB_APP_IDENTITY_FAILED");
  const result = await response.json();
  if (typeof result.slug !== "string") throw new Error("GITHUB_APP_IDENTITY_FAILED");
  return result.slug + "[bot]";
}
async function contents(token: string, path: string, ref: string) {
  return await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/" + path + "?ref=" + encodeURIComponent(ref));
}
function decodedJson(content: string) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\n/g, "")), character => character.charCodeAt(0))));
}
function validSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}
function validWorkItem(item: any) {
  return !!item && /^PILOT-[0-9]{3}$/.test(String(item.id || "")) &&
    Number.isSafeInteger(item.pr_number) &&
    Array.isArray(item.release_source_prs) && item.release_source_prs.length > 0 &&
    item.release_source_prs.every((number: any) => Number.isSafeInteger(number) && number > 0) &&
    item.release_source_prs.includes(item.pr_number) &&
    Array.isArray(item.features) && item.features.length > 0 &&
    item.features.every((path: any) => typeof path === "string" && path.length > 0);
}
async function createCandidatePullRequest(token: string, claims: Record<string, unknown>, data: Record<string, unknown>) {
  const issueNumber = Number(data.issueNumber);
  const runId = String(data.runId || "");
  const runAttempt = Number(data.runAttempt);
  const candidateAttempt = Number(data.candidateAttempt);
  const requestCommitSha = String(data.requestCommitSha || "");
  const liveSha = String(data.liveSha || "");
  const devSha = String(data.testedDevSha || "");
  const candidateCommitSha = String(data.candidateCommitSha || "");
  const candidateTreeSha = String(data.candidateTreeSha || "");
  const candidateBranch = String(data.candidateBranch || "");
  const workflowBlobSha = String(data.workflowBlobSha || "");
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
      !/^[0-9]+$/.test(runId) || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      !Number.isSafeInteger(candidateAttempt) || candidateAttempt < 1 ||
      ![requestCommitSha, liveSha, devSha, candidateCommitSha, candidateTreeSha, workflowBlobSha].every(validSha)) {
    throw new Error("CANDIDATE_INPUT_INVALID");
  }

  const requestBranch = "olympia/release-requests/decision-" + issueNumber;
  const expectedRef = "refs/heads/" + requestBranch;
  const expectedWorkflowRef = OWNER + "/" + REPO + "/.github/workflows/olympia-release-candidate.yml@" + expectedRef;
  if (claims.repository !== OWNER + "/" + REPO ||
      String(claims.repository_id) !== REPOSITORY_ID ||
      claims.repository_owner !== OWNER ||
      claims.event_name !== "push" ||
      claims.ref !== expectedRef ||
      claims.workflow_ref !== expectedWorkflowRef ||
      !validSha(claims.workflow_sha) ||
      String(claims.run_id) !== runId ||
      String(claims.run_attempt) !== String(runAttempt) ||
      claims.sha !== requestCommitSha) {
    throw new Error("OIDC_WORKFLOW_IDENTITY_REJECTED");
  }

  const tokenForApp = token;
  const issue = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/issues/" + issueNumber);
  const appLogin = await appBotLogin();
  const issueBody = String(issue.body || "");
  const requestRef = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/" + encodeURIComponent(requestBranch));
  if (requestRef.object?.sha !== requestCommitSha) throw new Error("REQUEST_BRANCH_MOVED");
  const requestFile = await contents(tokenForApp, "olympia/release-requests/decision-" + issueNumber + ".json", requestBranch);
  const request = decodedJson(String(requestFile.content || ""));
  if (request.schema !== "olympia-release-request/v1" ||
      request.issueNumber !== issueNumber ||
      typeof request.itemId !== "string" ||
      !/^PILOT-[0-9]{3}$/.test(request.itemId) ||
      request.decision !== "pandoras_ask" ||
      request.testedDevSha !== devSha ||
      request.workflowBlobSha !== workflowBlobSha ||
      String(request.attempt) !== String(candidateAttempt)) {
    throw new Error("RELEASE_REQUEST_MISMATCH");
  }

  if (issue.user?.login !== appLogin ||
      !issueBody.includes("## OLYMPIA Zeus-beslut") ||
      !issueBody.includes("- Beslut: PANDORAS ASK") ||
      !issueBody.includes("- Ärende-ID: " + request.itemId) ||
      !issueBody.includes("- Testad DEV-commit (full SHA): " + devSha)) {
    throw new Error("OLYMPIA_DECISION_MISMATCH");
  }
  const queueFile = await contents(tokenForApp, "olympia/work-items.json", "development");
  const queue = decodedJson(String(queueFile.content || ""));
  const item = Array.isArray(queue.items) ? queue.items.find((entry: any) => entry.id === request.itemId) : null;
  if (!validWorkItem(item) || !item.ready_for_human_acceptance || item.pr_number !== request.prNumber) {
    throw new Error("WORK_ITEM_NOT_READY");
  }

  const workflow = await contents(tokenForApp, ".github/workflows/olympia-release-candidate.yml", String(claims.workflow_sha));
  if (workflow.sha !== workflowBlobSha) throw new Error("WORKFLOW_FILE_NOT_PINNED");

  const main = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/commits/main");
  if (main.sha !== liveSha) throw new Error("LIVE_BASELINE_CHANGED");
  const expectedBranch = "olympia/" + request.itemId.toLowerCase() + "/issue-" + issueNumber + "-live-" + liveSha;
  if (candidateBranch !== expectedBranch) throw new Error("CANDIDATE_BRANCH_INVALID");
  const candidateRef = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/" + encodeURIComponent(candidateBranch));
  if (candidateRef.object?.sha !== candidateCommitSha) throw new Error("CANDIDATE_BRANCH_MOVED");
  const commit = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/commits/" + candidateCommitSha);
  if (commit.commit?.tree?.sha !== candidateTreeSha || commit.parents?.[0]?.sha !== liveSha ||
      !String(commit.commit?.message || "").includes("release(" + request.itemId + "): verified candidate from LIVE (attempt " + candidateAttempt + ")")) {
    throw new Error("CANDIDATE_COMMIT_INVALID");
  }
  const comparison = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/compare/" + liveSha + "..." + candidateCommitSha);
  const allowed = new Set([...(Array.isArray(item.features) ? item.features : []), "tests/arcane-trophy-room.test.mjs"]);
  const changed = Array.isArray(comparison.files) ? comparison.files.map((file: any) => String(file.filename)) : [];
  if (comparison.status !== "ahead" || !changed.length || changed.some(path => !allowed.has(path))) {
    throw new Error("CANDIDATE_FILE_SCOPE_INVALID");
  }

  const existing = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/pulls?state=open&base=main&head=" + encodeURIComponent(OWNER + ":" + candidateBranch));
  let pull = Array.isArray(existing) ? existing[0] : null;
  if (pull) {
    if (pull.base?.ref !== "main" || pull.head?.sha !== candidateCommitSha ||
        !String(pull.body || "").includes("Zeus decision journal: #" + issueNumber)) {
      throw new Error("EXISTING_RELEASE_PR_MISMATCH");
    }
  } else {
    const body = [
      "## OLYMPIA release candidate · " + request.itemId,
      "",
      "- Prepared from LIVE baseline: " + liveSha,
      "- Source DEV PRs: #" + item.release_source_prs.join(", #"),
      "- Approved DEV test version: " + devSha,
      "- Exact candidate tree: " + candidateTreeSha,
      "- Zeus decision journal: #" + issueNumber,
      "- Tests: npm run check passed on the candidate.",
      "- Database migrations: none included.",
      "- Dependency changes: none included.",
      "- This PR is not approved for LIVE until OLYMPIA final approval is recorded.",
    ].join("\n");
    pull = await gh(tokenForApp, "/repos/" + OWNER + "/" + REPO + "/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: "release(" + request.itemId + "): " + item.title + " from verified LIVE candidate",
        head: candidateBranch,
        base: "main",
        body,
        draft: false,
      }),
    });
  }
  if (!Number.isSafeInteger(Number(pull.number)) || typeof pull.html_url !== "string") throw new Error("RELEASE_PR_CREATE_FAILED");
  return { number: Number(pull.number), url: pull.html_url };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return fail("Endast POST stöds.", 405);
  if (req.headers.has("Origin")) return fail("Browseranrop nekas.", 403);
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return fail("GitHub Actions OIDC-token saknas.", 401);
  try {
    const rawBody = await req.text();
    if (rawBody.length > 16000) return fail("Begäran är för stor.", 413);
    const data = JSON.parse(rawBody);
    const claims = await verifyGitHubActionsOidcToken(bearer, OIDC_AUDIENCE);
    const appToken = await githubToken();
    const pullRequest = await createCandidatePullRequest(appToken, claims, data);
    console.info("OLYMPIA candidate PR created", Number(data.issueNumber), String(data.runId), pullRequest.number);
    return json({ ok: true, pullRequest });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error("OLYMPIA candidate PR bridge failed", code);
    if (code.startsWith("OIDC_")) return fail("Kandidatens GitHub Actions-identitet kunde inte verifieras. Ingen LIVE-ändring gjordes.", 403);
    if (code === "OLYMPIA_BACKEND_NOT_CONFIGURED") return fail("OLYMPIA GitHub-brygga saknar DEV-konfiguration.", 503);
    if (code.startsWith("GITHUB_REQUEST_FAILED_")) return fail("GitHub kunde inte verifiera eller öppna release-PR:n. Ingen LIVE-ändring gjordes.", 502);
    return fail("Releasekandidatens uppgifter kunde inte verifieras. Ingen PR skapades och LIVE är oförändrat.", 409);
  }
});
