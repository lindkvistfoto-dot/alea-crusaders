export const IDEA_STATUSES = Object.freeze(['idea_bank', 'to_process', 'in_olympia', 'done']);
export const PR_CLASSIFICATIONS = Object.freeze([
  'fully_handled', 'partially_handled', 'not_handled', 'superseded', 'uncertain',
]);

export function validateHistoricalPr(pr) {
  const number = Number(pr?.number);
  if (!Number.isSafeInteger(number) || number < 1) return 'PR-numret måste vara ett positivt heltal.';
  if (!PR_CLASSIFICATIONS.includes(pr?.classification)) return 'Välj en giltig klassning.';
  if (!String(pr?.purpose || '').trim()) return 'Ange PR:ns ursprungliga syfte.';
  if (!String(pr?.recommendation || '').trim()) return 'Ange en rekommenderad åtgärd.';
  if (String(pr?.remaining_need || '').length > 4000 || String(pr?.purpose || '').length > 2000 || String(pr?.recommendation || '').length > 2000) return 'PR-underlaget är för långt.';
  return '';
}

export function normalizeHistoricalPr(pr) {
  const number = Number(pr.number);
  return {
    number,
    url: `https://github.com/lindkvistfoto-dot/alea-crusaders/pull/${number}`,
    purpose: String(pr.purpose || '').trim(),
    classification: pr.classification,
    remaining_need: String(pr.remaining_need || '').trim(),
    recommendation: String(pr.recommendation || '').trim(),
    hidden: Boolean(pr.hidden),
  };
}

export function validateIdeaPayload(input) {
  if (!input || typeof input !== 'object') return 'Uppslaget är ogiltigt.';
  if (!String(input.title || '').trim() || String(input.title).trim().length > 160) return 'Rubriken ska innehålla 1–160 tecken.';
  if (String(input.description || '').length > 4000) return 'Beskrivningen får innehålla högst 4 000 tecken.';
  if (!IDEA_STATUSES.includes(input.status)) return 'Välj en giltig status.';
  if ((input.status === 'in_olympia' || input.status === 'done') && (!Number.isSafeInteger(Number(input.active_pr_number)) || Number(input.active_pr_number) < 1)) return 'Pågående och genomförda uppslag behöver en kopplad PR.';
  if (input.status === 'done' && !input.completed_at) return 'Genomfört kräver verifierad LIVE-publicering.';
  if (input.status !== 'done' && input.completed_at) return 'Endast genomförda uppslag får ha ett LIVE-datum.';
  if (!Array.isArray(input.historical_prs) || input.historical_prs.length > 38) return 'Historiklistan ska innehålla högst 38 PR:ar.';
  const numbers = new Set();
  for (const pr of input.historical_prs) {
    const error = validateHistoricalPr(pr);
    if (error) return `PR #${pr?.number ?? '?'}: ${error}`;
    if (numbers.has(Number(pr.number))) return `PR #${pr.number} är kopplad mer än en gång till samma uppslag.`;
    numbers.add(Number(pr.number));
  }
  return '';
}

export function normalizeImportPayload(input) {
  if (input?.schema !== 'olympia-uppslag-import/v1' || input?.source_report?.date !== '2026-11-03' || input?.source_report?.name !== 'CLEAN OLYMPUS') {
    return { error: 'Importfilen måste ange CLEAN OLYMPUS-underlaget från 3 november 2026.' };
  }
  if (!Array.isArray(input.ideas) || input.ideas.length < 1 || input.ideas.length > 38) return { error: 'Importfilen ska innehålla 1–38 uppslag.' };
  const allNumbers = new Set();
  const ideas = input.ideas.map((idea, index) => {
    const row = { ...idea, status: 'idea_bank', active_pr_number: null, completed_at: null };
    if (!Array.isArray(row.historical_prs) || row.historical_prs.length < 1) return null;
    for (const pr of row.historical_prs) {
      const error = validateHistoricalPr(pr);
      if (error) throw new Error(`Uppslag ${index + 1}: PR #${pr?.number ?? '?'}: ${error}`);
      const number = Number(pr.number);
      if (allNumbers.has(number)) throw new Error(`PR #${number} förekommer mer än en gång i importfilen.`);
      allNumbers.add(number);
    }
    const error = validateIdeaPayload(row);
    if (error) throw new Error(`Uppslag ${index + 1}: ${error}`);
    return { ...row, historical_prs: row.historical_prs.map(normalizeHistoricalPr) };
  });
  if (ideas.some(row => !row)) return { error: 'Alla importuppslag behöver minst en historisk PR.' };
  if (allNumbers.size !== Number(input.source_report.open_pr_count)) return { error: `Importfilen innehåller ${allNumbers.size} unika PR:ar, men rapporten anger ${input.source_report.open_pr_count}.` };
  return { ideas };
}

export function suppressedHistoricalPrNumbers(ideas) {
  return [...new Set((ideas || []).flatMap(idea => (idea.historical_prs || [])
    .filter(pr => pr.hidden === true).map(pr => Number(pr.number))
    .filter(number => Number.isSafeInteger(number) && number > 0)))];
}

export function shouldMarkCompleted({ sourcePr, testedDevSha, sourceComparison, decisionIssue, releasePr, mainSha, releaseComparison, manifest }) {
  const sourceSha = String(sourcePr?.merge_commit_sha || ''), releaseSha = String(releasePr?.merge_commit_sha || '');
  const isAncestor = (comparison, mergeSha) => comparison?.status === 'identical' ||
    (comparison?.status === 'ahead' && String(comparison?.merge_base_commit?.sha || '').toLowerCase() === mergeSha.toLowerCase());
  if (!sourcePr || sourcePr.state !== 'closed' || sourcePr.merged !== true || sourcePr.base?.ref !== 'development' ||
      !/^[a-f0-9]{40}$/i.test(sourceSha) || !/^[a-f0-9]{40}$/i.test(String(testedDevSha || '')) ||
      !decisionIssue || !String(decisionIssue.body || '').includes(`- Ärende-ID: PR-${sourcePr.number}`) ||
      !String(decisionIssue.body || '').includes(`- Testad DEV-commit (full SHA): ${testedDevSha}`) ||
      !String(decisionIssue.body || '').includes('- Beslut: PANDORAS ASK') ||
      !releasePr || releasePr.merged !== true || releasePr.base?.ref !== 'main' ||
      !String(releasePr.body || '').includes(`Zeus decision journal: #${decisionIssue.number}`) ||
      !/^[a-f0-9]{40}$/i.test(releaseSha) || !/^[a-f0-9]{40}$/i.test(String(mainSha || ''))) return false;
  return isAncestor(sourceComparison, sourceSha) && isAncestor(releaseComparison, releaseSha) &&
    manifest?.environment === 'main' && manifest?.source_sha === mainSha;
}
