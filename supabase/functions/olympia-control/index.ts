import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const OWNER = "lindkvistfoto-dot";
const REPO = "alea-crusaders";
const ALLOWED_ORIGIN = "https://lindkvistfoto-dot.github.io";
const DECISIONS = new Set(["accept", "pandoras_ask", "release_package", "karon", "needs_fix"]);
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
function pemBytes(pem: string) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, "");
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
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
async function githubToken() {
  const appId = Deno.env.get("OLYMPIA_GITHUB_APP_ID");
  const installationId = Deno.env.get("OLYMPIA_GITHUB_INSTALLATION_ID");
  const privateKey = Deno.env.get("OLYMPIA_GITHUB_APP_PRIVATE_KEY");
  if (!appId || !installationId || !privateKey) throw new Error("OLYMPIA_BACKEND_NOT_CONFIGURED");
  const jwt = await appJwt(appId, privateKey);
  const res = await fetch("https://api.github.com/app/installations/" + encodeURIComponent(installationId) + "/access_tokens", {
    method: "POST",
    headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + jwt, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ permissions: { issues: "write", contents: "read" }, repository_ids: [1403008145] }),
  });
  if (!res.ok) throw new Error("GITHUB_APP_TOKEN_FAILED");
  const data = await res.json();
  if (typeof data.token !== "string") throw new Error("GITHUB_APP_TOKEN_FAILED");
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
async function workItem(token: string, itemId: string) {
  const data = await gh(token, "/repos/" + OWNER + "/" + REPO + "/contents/olympia/work-items.json?ref=development");
  if (typeof data.content !== "string") throw new Error("WORK_QUEUE_UNKNOWN");
  const queue = JSON.parse(atob(data.content.replace(/\n/g, "")));
  const item = Array.isArray(queue.items) ? queue.items.find((x: any) => x.id === itemId) : null;
  if (!item) throw new Error("WORK_ITEM_NOT_FOUND");
  return item;
}
function issueBody(item: any, data: any, actor: string) {
  const decisionLabels: Record<string, string> = {
    accept: "ACCEPTANS",
    pandoras_ask: "PANDORAS ASK",
    release_package: "RELEASEPAKET",
    karon: "TILL KARON",
    needs_fix: "BEHÖVER RÄTTAS",
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
    "",
    "### Zeus kommentar",
    comment || "Ingen kommentar angiven.",
    "",
    "Beslutet registrerades via OLYMPIA DEV Decision Bridge. GitHub är beständig beslutsjournal.",
  ].join("\n");
}
function title(item: any, decision: string) {
  const label: Record<string, string> = {
    accept: "ACCEPTANS",
    pandoras_ask: "PANDORAS ASK",
    release_package: "RELEASEPAKET",
    karon: "AVVAKTA · TILL KARON",
    needs_fix: "BEHÖVER RÄTTAS",
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
    if (!data || typeof data !== "object" || !DECISIONS.has(data.decision)) return fail("Ogiltigt beslut.", 400);
    if (typeof data.itemId !== "string" || !/^PILOT-[0-9]{3}$/.test(data.itemId)) return fail("Ogiltigt ärende-ID.", 400);
    if (typeof data.testedDevSha !== "string" || !/^[0-9a-f]{40}$/i.test(data.testedDevSha)) return fail("Testad DEV-version saknas eller är ogiltig.", 400);

    const token = await githubToken();
    const item = await workItem(token, data.itemId);
    if (!item.ready_for_human_acceptance || item.dev_sha !== data.testedDevSha) {
      return fail("DEV-versionen har ändrats eller är inte verifierad. Uppdatera OLYMPIA och prova igen.", 409);
    }
    if (item.pr_number !== 385 || item.id !== "PILOT-001") return fail("Pilotens PR-koppling kunde inte verifieras.", 409);

    if (data.decision === "pandoras_ask" || data.decision === "release_package") {
      const issues = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues?state=all&per_page=100&creator=" + encodeURIComponent(OWNER));
      const accepted = (issues as any[]).some(i => {
        const body = String(i.body || "");
        return body.includes("- Beslut: ACCEPTANS") &&
          body.includes("- Ärende-ID: " + item.id) &&
          body.includes("- Testad DEV-commit (full SHA): " + data.testedDevSha);
      });
      if (!accepted) return fail("Registrera först att du godkänner Astrid för exakt denna DEV-version.", 409);
    }

    const decisionIssue = await gh(token, "/repos/" + OWNER + "/" + REPO + "/issues", {
      method: "POST",
      body: JSON.stringify({ title: title(item, data.decision), body: issueBody(item, data, user.email) }),
    });
    return json({
      ok: true,
      message: "Beslutet sparades i GitHub. OLYMPIA är uppdaterat.",
      issue: { number: decisionIssue.number, url: decisionIssue.html_url },
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
