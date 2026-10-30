export function reconcileRelease({ developmentPrs = [], liveCommits = [], developmentCommits = [] } = {}) {
  const liveShas = new Set(liveCommits.map(x => x.sha).filter(Boolean));
  const livePatches = new Set(liveCommits.map(x => x.patchId).filter(Boolean));
  const devShas = new Set(developmentCommits.map(x => x.sha).filter(Boolean));
  const devPatches = new Set(developmentCommits.map(x => x.patchId).filter(Boolean));

  const prs = developmentPrs.map(pr => {
    if (!pr.mergeSha) return { ...pr, reconciliation: "unknown", reason: "Missing merge SHA" };
    if (pr.inLiveHistory || liveShas.has(pr.mergeSha)) return { ...pr, reconciliation: "published", reason: "Merge commit is in LIVE history" };
    const sourcePatchIds = [...new Set((pr.patchIds || []).filter(Boolean))];
    if (pr.patchId && livePatches.has(pr.patchId)) return { ...pr, reconciliation: "published", reason: "Equivalent patch is in LIVE history" };
    if (sourcePatchIds.length && sourcePatchIds.every(id => livePatches.has(id))) return { ...pr, reconciliation: "published", reason: "Every PR commit has an equivalent patch in LIVE" };
    const matchedParts = sourcePatchIds.filter(id => livePatches.has(id)).length;
    if (matchedParts) return { ...pr, reconciliation: "partial", reason: matchedParts + " of " + sourcePatchIds.length + " PR commit patches found in LIVE" };
    if (!pr.patchId && !sourcePatchIds.length) return { ...pr, reconciliation: "unknown", reason: "Could not calculate PR patch identity" };
    return { ...pr, reconciliation: "pending", reason: "No equivalent change found in LIVE history" };
  });

  const liveOnly = liveCommits
    .filter(commit => !devShas.has(commit.sha) && (!commit.patchId || !devPatches.has(commit.patchId)))
    .map(commit => ({ ...commit, reconciliation: commit.patchId ? "missing-in-development" : "unknown" }));
  const devOnly = developmentCommits
    .filter(commit => !liveShas.has(commit.sha) && (!commit.patchId || !livePatches.has(commit.patchId)))
    .map(commit => ({ ...commit, reconciliation: commit.patchId ? "pending-live" : "unknown" }));

  return {
    pendingPrs: prs.filter(pr => pr.reconciliation === "pending"),
    publishedPrs: prs.filter(pr => pr.reconciliation === "published"),
    unknownPrs: prs.filter(pr => pr.reconciliation === "unknown"),
    partialPrs: prs.filter(pr => pr.reconciliation === "partial"),
    liveOnly,
    devOnly,
    prs
  };
}
