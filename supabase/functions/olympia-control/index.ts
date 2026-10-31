import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const OWNER = "lindkvistfoto-dot";
const REPO = "alea-crusaders";
const ALLOWED_ORIGIN = "https://lindkvistfoto-dot.github.io";
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
  const permissions: Record<string, string> = { issues: "write", contents: "write" };
  if (decision === "final_approval") Object.assign(permissions, { pull_requests: "write", checks: "read", statuses: "read" });
  const res = await fetch("https://api.github.com/app/installations/" + encodeURIComponent(installationId) + "/access_tokens", {
    method: "POST",
    headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + jwt, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ permissions, repository_ids: [1403008145] }),
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
  const res = await fetch("https://api.github.com" + path, {
    ...init,
    headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("GITHUB_REQUEST_FAILED_" + res.status);
  return data;
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
  const data = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/olympia/work-items.json?ref=development");
  if (typeof data.content !== "string") throw new Error("WORK_QUEUE_UNKNOWN");
  const queue = JSON.parse(atob(data.content.replace(/\n/g, "")));
  const item = Array.isArray(queue.items) ? queue.items.find((x: any) => x.id === itemId) : null;
  if (!item) throw new Error("WORK_ITEM_NOT_FOUND");
  return item;
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
async function verifyCandidate(token: string, item: any, data: any) {
  if (!Number.isInteger(data.candidateIssue) || data.candidateIssue < 1 ||
      typeof data.candidateTreeSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.candidateTreeSha)) {
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
  if (!body.includes("READY_FOR_ZEUS_FINAL_APPROVAL") ||
      !body.includes("- Candidate tree SHA: " + data.candidateTreeSha)) {
    throw new Error("CANDIDATE_NOT_READY");
  }
  const liveMatch = body.match(/- LIVE rollback baseline: ([0-9a-f]{40})/i);
  const prMatch = body.match(/- Release PR: #(\d+)/);
  if (!liveMatch || !prMatch) throw new Error("CANDIDATE_REPORT_INCOMPLETE");
  const live = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/main");
  if (live.sha !== liveMatch[1]) throw new Error("LIVE_BASELINE_CHANGED");
  const pr = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + prMatch[1]);
  if (pr.state !== "open" || pr.base?.ref !== "main" || pr.user?.login !== appLogin || pr.mergeable !== true) throw new Error("RELEASE_PR_NOT_VALID");
  if (!String(pr.body || "").includes("Zeus decision journal: #" + data.candidateIssue)) throw new Error("RELEASE_PR_DECISION_MISMATCH");
  const headCommit = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha);
  if (headCommit.commit?.tree?.sha !== data.candidateTreeSha) throw new Error("CANDIDATE_TREE_MISMATCH");
  const checks = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/check-runs");
  const statuses = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/status");
  if (!Array.isArray(checks.check_runs) || checks.check_runs.length === 0 ||
      checks.check_runs.some((check: any) => check.status !== "completed" || !["success", "neutral", "skipped"].includes(check.conclusion))) {
    throw new Error("CANDIDATE_CHECKS_NOT_GREEN");
  }
  if (Array.isArray(statuses.statuses) && statuses.statuses.length > 0 && statuses.state !== "success") {
    throw new Error("CANDIDATE_STATUS_NOT_GREEN");
  }
  return { issue, pr, report, liveSha: live.sha };
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
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin");
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: responseHeaders });
    return new Response("ok", { headers: responseHeaders });
  }
  if (req.method !== "POST") return fail("Endast POST stöds.", 405);
  if (req.headers.get("Origin") !== ALLOWED_ORIGIN) return fail("Origin nekad.", 403);

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

    const data = await req.json();
    if (!data || typeof data !== "object") return fail("Ogiltig begäran.", 400);
    if (data.action === "session_check") return json({ ok: true });
    if (!DECISIONS.has(data.decision)) return fail("Ogiltigt beslut.", 400);
    if (typeof data.itemId !== "string" || !/^PILOT-[0-9]{3}$/.test(data.itemId)) return fail("Ogiltigt ärende-ID.", 400);
    if (typeof data.testedDevSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.testedDevSha)) return fail("Testad DEV-version saknas eller är ogiltig.", 400);

    const token = await githubToken(data.decision);
    const item = await workItem(token, data.itemId);
    if (!item.ready_for_human_acceptance || !/^[0-9a-f]{40}$/i.test(item.dev_sha || "")) {
      return fail("Pilotens källversion är inte verifierad. Ingen skrivning utfördes.", 409);
    }
    if (item.pr_number !== 385 || item.id !== "PILOT-001") return fail("Pilotens PR-koppling kunde inte verifieras.", 409);

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
          CANDIDATE_DECISION_MISMATCH: "Kandidatbeslutet hör inte till detta Astrid-ärende.",
          CANDIDATE_NOT_READY: "Releasekandidaten är inte verifierad. LIVE förblir oförändrat.",
          CANDIDATE_REPORT_INCOMPLETE: "Kandidatrapporten saknar nödvändiga uppgifter.",
          LIVE_BASELINE_CHANGED: "LIVE har ändrats sedan kandidaten skapades. Skapa en ny kandidat.",
          RELEASE_PR_NOT_VALID: "Releaseförslaget är inte öppet, mergebart och verifierat mot main.",
          CANDIDATE_CHECKS_NOT_GREEN: "Releaseförslagets CI-kontroller är inte godkända. LIVE förblir oförändrat.",
          CANDIDATE_STATUS_NOT_GREEN: "Releaseförslagets statuskontroller är inte godkända. LIVE förblir oförändrat.",
          RELEASE_PR_DECISION_MISMATCH: "Releaseförslaget pekar på ett annat Zeus-beslut.",
          CANDIDATE_TREE_MISMATCH: "Releaseförslagets kod avviker från den testade kandidaten.",
        };
        return fail(messages[code] || "Kandidaten kunde inte verifieras. LIVE förblir oförändrat.", 409);
      }
      const approvalIssue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues", {
        method: "POST",
        body: JSON.stringify({ title: title(item, data.decision), body: issueBody(item, { ...data, releaseGroup: "Kandidat #" + data.candidateIssue }, user.email) }),
      });
      const liveBeforeMerge = await gh(token, "/repos/" + OWNER + "/" + REPO + "/commits/main");
      if (liveBeforeMerge.sha !== candidate.liveSha) {
        return fail("LIVE ändrades under slutgodkännandet. Skapa en ny kandidat; LIVE är oförändrat.", 409);
      }
      const merged = await gh(token, "/repos/" + OWNER + "/" + REPO + "/pulls/" + candidate.pr.number + "/merge", {
        method: "PUT",
        body: JSON.stringify({ sha: candidate.pr.head.sha, merge_method: "squash" }),
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
        devSha: item.dev_sha,
        decision: data.decision,
      });
    }

    if (data.decision === "pandoras_ask" || data.decision === "release_package") {
      const issues = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&creator=" + encodeURIComponent(await appBotLogin()));
      const accepted = await hasAcceptedFeatureVersion(token, issues as any[], item, data.testedDevSha);
      if (!accepted) return fail("Godkänn Astrid först. Om Astrids bildvisningsfiler har ändrats sedan godkännandet behöver du prova henne igen.", 409);
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
              message: "Astrids LIVE-kandidat är redan förberedd. OLYMPIA återanvänder samma beslut och releaseförslag.",
              issue: { number: previous.number, url: previous.html_url },
              requestBranch: null,
              candidateStarted: true,
              itemId: item.id,
              devSha: item.dev_sha,
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
              devSha: item.dev_sha,
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
      devSha: item.dev_sha,
      decision: data.decision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "OLYMPIA_BACKEND_NOT_CONFIGURED") return fail("GitHub App saknas i DEV-serverhemligheterna. Ingen skrivning utfördes.", 503);
    if (message === "WORK_QUEUE_UNKNOWN") return fail("Ärendekön kunde inte verifieras. Ingen skrivning utfördes.", 503);
    if (message === "WORK_ITEM_NOT_FOUND") return fail("Ärendet hittades inte.", 404);
    console.error("OLYMPIA decision bridge failed", message);
    return fail("Beslutet kunde inte sparas. Ingen ändring registrerades.", 502);
  }
});
