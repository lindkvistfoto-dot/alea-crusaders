export const REQUIRED_CI_CHECKS = ["check", "guard", "preview", "Cloudflare Pages"] as const;

export type CiState = "pending" | "failed" | "success" | "unknown";
export interface CiResult {
  state: CiState;
  label: string;
  previewUrl: string | null;
}

export function classifyCi(
  checkRuns: any[],
  statuses: any[],
  expectedSha: string,
  checkTotalCount?: number,
  statusTotalCount?: number,
  combinedStatus?: string,
): CiResult {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  const contexts = Array.isArray(statuses) ? statuses : [];
  if ((Number.isInteger(checkTotalCount) && Number(checkTotalCount) > runs.length) ||
      (Number.isInteger(statusTotalCount) && Number(statusTotalCount) > contexts.length)) {
    return { state: "unknown", label: "GitHub-statuslistan är ofullständig", previewUrl: null };
  }
  if (runs.some((run: any) =>
      ["failure", "error", "cancelled", "timed_out", "action_required", "startup_failure"].includes(String(run.conclusion || "").toLowerCase())) ||
      contexts.some((status: any) => ["failure", "error"].includes(String(status.state || "").toLowerCase())) ||
      ["failure", "error"].includes(String(combinedStatus || "").toLowerCase())) {
    return { state: "failed", label: "Tester underkända", previewUrl: null };
  }
  if (combinedStatus === "pending" || runs.some((run: any) => run.status !== "completed") ||
      contexts.some((status: any) => status.state === "pending")) {
    return { state: "pending", label: "Tester pågår", previewUrl: null };
  }

  for (const name of REQUIRED_CI_CHECKS) {
    const matches = runs.filter((run: any) => String(run.name || "").toLowerCase() === name.toLowerCase());
    if (!matches.length) {
      return { state: "unknown", label: "Obligatorisk check saknas: " + name, previewUrl: null };
    }
    if (matches.some((run: any) => String(run.head_sha || "").toLowerCase() !== expectedSha.toLowerCase())) {
      return { state: "unknown", label: "CI gäller inte aktuell commit", previewUrl: null };
    }
    if (matches.some((run: any) => run.conclusion !== "success")) {
      return { state: "failed", label: name + " är inte godkänd", previewUrl: null };
    }
  }

  const cloudflare = runs.find((run: any) =>
    String(run.name || "").toLowerCase() === "cloudflare pages" &&
    String(run.head_sha || "").toLowerCase() === expectedSha.toLowerCase());
  const summary = String(cloudflare?.output?.summary || "");
  const reportedSha = summary.match(/Latest commit:<\/strong>[\s\S]{0,120}<code>([a-f0-9]{7,40})<\/code>/i)?.[1] || "";
  const href = summary.match(/<strong>Preview URL:<\/strong>[\s\S]{0,240}?<a href=['"](https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev)['"]/i)?.[1] || "";
  const previewUrl = reportedSha && expectedSha.toLowerCase().startsWith(reportedSha.toLowerCase()) && href
    ? href.replace(/\/$/, "") + "/olympia-v2/" : null;
  if (!previewUrl) {
    return { state: "unknown", label: "Cloudflare-preview saknas eller gäller annan commit", previewUrl: null };
  }
  if (contexts.length > 0 && contexts.some((status: any) =>
      !["success"].includes(String(status.state || "").toLowerCase()))) {
    return { state: "unknown", label: "GitHub commit-status är okänd", previewUrl };
  }
  return { state: "success", label: "Godkänd · commit " + expectedSha.slice(0, 10), previewUrl };
}
