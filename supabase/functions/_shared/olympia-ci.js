(function (root) {
  "use strict";
  const REQUIRED_CHECKS = [/^check$/i, /^guard$/i, /^preview$/i, /^Cloudflare Pages$/i];
  const SUCCESS_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
  function assess(checkResponse, statusResponse, expectedSha) {
    const expected = String(expectedSha || "").toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(expected)) return { state: "unknown", code: "CI_SHA_INVALID", label: "Commitversionen kunde inte verifieras" };
    const checks = checkResponse || {}, status = statusResponse || {};
    const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
    const statuses = Array.isArray(status.statuses) ? status.statuses : [];
    const checkSha = String(checks.sha || "").toLowerCase(), statusSha = String(status.sha || "").toLowerCase();
    if ((checkSha && checkSha !== expected) || (statusSha && statusSha !== expected) ||
        runs.some(run => run.head_sha && String(run.head_sha).toLowerCase() !== expected)) return { state: "unknown", code: "CI_SHA_MISMATCH", label: "CI gäller en annan commitversion" };
    if (Number(checks.total_count) > runs.length) return { state: "unknown", code: "CI_CHECKS_INCOMPLETE", label: "Alla CI-kontroller kunde inte hämtas" };
    const names = runs.map(run => String(run.name || ""));
    if (!runs.length || REQUIRED_CHECKS.some(pattern => !names.some(name => pattern.test(name)))) return { state: "unknown", code: "CI_CHECKS_MISSING", label: "Obligatoriska CI-kontroller saknas" };
    const waiting = runs.filter(run => run.status !== "completed");
    if (waiting.length || (statuses.length > 0 && status.state === "pending")) return { state: "pending", code: "CI_PENDING", label: waiting.length ? "Väntar på: " + [...new Set(waiting.map(run => run.name || "GitHub"))].join(", ") : "GitHub-status väntar" };
    if (runs.some(run => !SUCCESS_CONCLUSIONS.has(run.conclusion)) || (statuses.length > 0 && ["failure", "error"].includes(String(status.state || "").toLowerCase()))) return { state: "failed", code: "CI_FAILED", label: "CI-kontroller underkända" };
    if (statuses.length > 0 && status.state !== "success") return { state: "unknown", code: "CI_STATUS_UNKNOWN", label: "GitHub-status kunde inte verifieras" };
    return { state: "success", code: "CI_GREEN", label: "Godkänd" };
  }
  root.olympiaCiValidation = Object.freeze({ assess });
})(typeof globalThis !== "undefined" ? globalThis : window);
