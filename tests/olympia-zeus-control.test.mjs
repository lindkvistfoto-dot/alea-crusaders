import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('OLYMPIA ZEUS CONTROL baseline and acceptance queue',()=>{
  it('preserves a versioned baseline and the full captured PR history',()=>{
    const baseline=JSON.parse(read('olympia/baseline-001.json'));
    const inventory=JSON.parse(read('olympia/history/pr-inventory-001.json'));
    expect(baseline.baseline_id).toBe('OLYMPIA-BASELINE-001');
    expect(baseline.refs.development.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(baseline.refs.live.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(inventory.complete).toBe(true);
    expect(inventory.pull_requests).toHaveLength(baseline.pull_requests.total);
    expect(baseline.approvals.zeus_product_acceptances).toEqual([]);
  });

  it('shows the verified Astrid pilot ready without claiming human approval',()=>{
    const queue=JSON.parse(read('olympia/work-items.json'));
    expect(queue.items.map(x=>x.id)).toEqual(['PILOT-001']);
    expect(queue.items[0].ready_for_human_acceptance).toBe(true);
    expect(queue.items[0].pr_number).toBe(385);
    expect(queue.items[0].dev_sha).toMatch(/^[a-f0-9]{40}$/);
    expect(queue.items[0].acceptance.decision).toBeNull();
  });

  it('shows the three human-facing views and gates decisions on a ready DEV version',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('ATT PROVA');
    expect(page).toContain('ATT PUBLICERA');
    expect(page).toContain('HISTORIK');
    expect(page).toContain('ready_for_human_acceptance');
    expect(page).toContain('/^[0-9a-f]{40}$/i.test(testedSha)');
    expect(page).toContain('i.user.type==="Bot"');
    expect(page).toContain('github.com/"+owner+"/"+repo+"/issues/new');
    const script=page.split('<script>')[1]?.split('</script>')[0]||'';
    expect(script.length).toBeGreaterThan(0);
    expect(()=>new Function(script)).not.toThrow();
    expect(page).toContain("esc(item.expected_result)+'</p>'+links+");
    expect(page).not.toContain("esc(item.expected_result)+'</p'>+links+");
  });

  it('does not represent unresolved database or deployment evidence as release-ready',()=>{
    const baseline=JSON.parse(read('olympia/baseline-001.json'));
    expect(baseline.database.reconciliation).toBe('VERIFIED_CORE_SCHEMA_MATCH_WITH_ENVIRONMENT_DIFFERENCES');
    expect(baseline.database.core_schema_audit.status).toBe('VERIFIED_CORE_SCHEMA_MATCH');
    expect(baseline.database.core_schema_audit.environment_differences).toHaveLength(2);
    expect(baseline.deployments.verification_policy).toContain('source_sha');
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(page).toContain('window.olympiaReleasePreflightReady===true');
    expect(page).toContain('candidatePr.base.sha===liveMatch[1]');
    expect(page).toContain('exactScope');
    expect(page).toContain('VERIFIED_CORE_SCHEMA_MATCH');
    expect(edge).toContain('CANDIDATE_SCOPE_NOT_ALLOWED');
    expect(edge).toContain('verifyPublishedManifest("main", live.sha)');
    expect(edge).toContain('verifyPublishedManifest("development", developmentSha)');
    expect(edge).toContain('pr.base?.sha !== live.sha');
    expect(edge).toContain('DEPLOYMENT_MANIFEST_UNVERIFIED');
    expect(page).toContain('if(renderId!==decisionRenderSequence)return;');
    expect(page).toContain('data-release-refresh');
    expect(page).toContain('Kontrollen kunde inte hämtas:');
    expect(page).toContain('candidateBlocked=!!(candidate&&candidate.includes("- Status: BLOCKED"))');
    expect(page).not.toContain('||!!candidate&&!candidateReady');
    expect(page).toContain('Kandidatstatus kunde inte hämtas.');
    expect(baseline.database.core_schema_audit.environment_differences[0]).toContain('endast i LIVE');
    expect(baseline.completeness.commit_history).toContain('100');
  });
  it('integrates OLYMPIA in ALEA admin and reuses the ALEA session',()=>{
    const app=read('index.html');
    const legacy=read('legacy/app.js');
    const page=read('olympia/zeus-control.html');
    expect(app).toContain("openAdminSection('olympia')");
    expect(app).toContain('data-admin-section="olympia"');
    expect(legacy).toContain("olympia:['OLYMPIA'");
    expect(page).toContain('localStorage.getItem("alea_supabase_session")');
    expect(app).toContain('src="./olympia/zeus-control.html?v=20261031-pandora-final-gate-6"');
    expect(page).toContain('event.key==="alea:dev:alea_supabase_session_dev"');
    expect(page).toContain('session_check');
    expect(page).toContain('window.olympiaAuthVerified');
    expect(page).not.toContain('type="module"');
    expect(page).not.toContain('supabase.auth.setSession');
    expect(page).not.toContain('signInWithPassword');
    expect(page).not.toContain('signInWithOAuth');
  });

  it('keeps Zeus decisions locked until the server verifies ALEA admin access',()=>{
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(page).toContain('!!window.olympiaAuthVerified');
    expect(page).toContain('request({action:"session_check"},session)');
    expect(page).toContain('setTimeout(()=>controller.abort(),12000)');
    expect(edge).toContain('data.action === "session_check"');
    expect(edge).toContain('async function githubToken(decision: string)');
    expect(edge).toContain('decision === "deployment_check"');
    expect(edge).toContain('? { contents: "read" }');
    expect(edge).toContain(': { issues: "write", contents: "write" }');
    expect(edge).toContain('if (decision === "final_approval") Object.assign(permissions, { pull_requests: "write", checks: "read", statuses: "read" });');
    expect(edge).toContain('githubToken(data.decision)');
    expect(edge).toContain('pr.mergeable !== true');
    expect(edge).toContain('pr.user?.login !== appLogin');
    expect(edge).toContain('const appLogin = await appBotLogin();');
    expect(edge).toContain('CANDIDATE_CHECKS_NOT_GREEN');
    expect(edge.indexOf('user.email?.toLowerCase() !== allowedEmail')).toBeLessThan(edge.indexOf('data.action === "session_check"'));
  });

  it('reads the ALEA DEV session from the namespaced storage used inside its iframe',()=>{
    const page=read('olympia/zeus-control.html');
    const scope=read('dev-storage-scope.js');
    expect(page).toContain('src="../dev-storage-scope.js');
    expect(scope).toContain("var prefix='alea:dev:'");
    expect(page).toContain('localStorage.getItem("alea_supabase_session_dev")');
  });

  it('isolates DEV auth storage from the LIVE ALEA session',()=>{
    const legacy=read('legacy/app.js');
    const page=read('olympia/zeus-control.html');
    expect(legacy).toContain("SUPABASE_SESSION_KEY='alea_supabase_session_dev'");
    expect(legacy).toContain('function sessionBelongsToProject(session)');
    expect(legacy).toContain('return payload.iss===SUPABASE_URL');
    expect(legacy).toContain('function projectSession()');
    expect(page).toContain('localStorage.getItem("alea_supabase_session_dev")');
    expect(page).toContain('function sessionBelongsToDev(session)');
    expect(page).toContain('return payload.iss===url+"/auth/v1"');
    expect(page).toContain('ALEA-sessionen gäller inte DEV.');
  });

  it('reads current branches and pull request counts from GitHub instead of the captured snapshot',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('api+"/branches/development"');
    expect(page).toContain('api+"/branches/main"');
    expect(page).toContain('is:pr is:open');
    expect(page).toContain('is:pr is:merged');
    expect(page).toContain('Aktuell GitHub-status OKÄND');
  });

  it('lists current open GitHub PRs and checks selected PR CI and mergeability on demand',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('pulls?state=open&per_page=100');
    expect(page).toContain('data-pr-status');
    expect(page).toContain('/check-runs');
    expect(page).toContain('pr.mergeable===true');
    expect(page).toContain('Status är OKÄND');
  });


  it('preserves Zeus approval across unrelated DEV changes but requires feature-file freshness',()=>{
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(page).toContain('currentDevSha');
    expect(page).not.toContain('testedSha===item.dev_sha');
    expect(page).toContain('candidatePr.mergeable===true');
    expect(page).toContain('statusesOk');
    expect(page).toContain('liveBranch.commit.sha===liveMatch[1]');
    expect(page).toContain('data-sha="\'+esc(currentDevSha)+\'"');
    expect(edge).toContain('/git/ref/heads/development');
    expect(edge).toContain('ref.object?.sha !== data.testedDevSha');
    expect(edge).toContain('async function hasAcceptedFeatureVersion');
    expect(edge).toContain('compare/\" + tested + \"...\" + currentSha');
    expect(edge).toContain('protectedPaths.has(file.filename)');
    expect(edge).toContain('Om Astrids bildvisningsfiler har ändrats sedan godkännandet');
    expect(workflow).toContain('CURRENT_DEV_SHA=');
    expect(workflow).toContain('PR_MERGE_SHA" != "$SOURCE_PR_SHA');
    expect(workflow).toContain('merge-base --is-ancestor "$TESTED_SHA" "$CURRENT_DEV_SHA"');
    expect(workflow).toContain('The accepted trophy-room files changed after Zeus tested this DEV version');
  });
});


describe('OLYMPIA LIVE decision semantics',()=>{
  it('reuses an unchanged Astrid Pandora decision after OLYMPIA-only DEV changes',()=>{
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('const previousTestedSha = previousBody.match');
    expect(edge).toContain('hasAcceptedFeatureVersion(token, issues as any[], item, previousTestedSha)');
    expect(edge).toContain('testedDevSha: previousTestedSha');
    expect(edge).toContain('workflowBlobSha,');
  });
  it('queues release-package decisions without starting a LIVE candidate',()=>{
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('if (data.decision === "pandoras_ask") {');
    expect(edge).toContain('Ändringen lades i releasepaketet. Ingen LIVE-PR har startats.');
    expect(edge).toContain('Pandoras ask registrerades. En selektiv LIVE-PR förbereds från verifierad kod; inget publiceras ännu.');
  });
  it('lets only Pandoras Ask start the one-item LIVE candidate workflow',()=>{
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(workflow).toContain('Only a Pandoras Ask start order can create a single-item LIVE PR candidate.');
    expect(workflow).not.toContain('DECISION" == "pandoras_ask" || "$DECISION" == "release_package"');
  });
});


describe('OLYMPIA server-side deployment preflight',()=>{
  it('verifies DEV and LIVE through the authenticated read-only decision bridge',()=>{
    const edge=read('supabase/functions/olympia-control/index.ts');
    const page=read('olympia/zeus-control.html');
    const block=page.slice(page.indexOf('async function renderBlockers(){'),page.indexOf('async function renderDecisions(){'));
    expect(edge).toContain('data.action === "deployment_check"');
    expect(edge).toContain('githubToken("deployment_check")');
    expect(edge).toContain('verifyPublishedManifest("main", liveSha)');
    expect(edge).toContain('verifyPublishedManifest("development", developmentSha)');
    expect(edge).toContain('? { contents: "read" }');
    expect(block).toContain('request({action:"deployment_check"},session)');
    expect(block).not.toContain('json(api+"/branches/main")');
    expect(block).not.toContain('json(api+"/branches/development")');
    expect(page).toContain('if(window.olympiaRefreshBlockers)await window.olympiaRefreshBlockers()');
  });
});
