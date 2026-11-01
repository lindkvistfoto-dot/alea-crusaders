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
    expect(queue.items.map(x=>x.id)).toEqual(['PILOT-001','PILOT-002']);
    expect(queue.items[0].ready_for_human_acceptance).toBe(true);
    expect(queue.items[0].pr_number).toBe(385);
    expect(queue.items[0].dev_sha).toMatch(/^[a-f0-9]{40}$/);
    expect(queue.items[0].acceptance.decision).toBeNull();
  });

  it('tracks PILOT-002 image publication and allows visual acceptance after all images are verified in DEV',()=>{
    const queue=JSON.parse(read('olympia/work-items.json'));
    const pilot=queue.items.find(x=>x.id==='PILOT-002');
    expect(pilot.image_count).toBe(3);
    expect(pilot.images).toHaveLength(3);
    expect(new Set(pilot.images.map(image=>image.asset_key)).size).toBe(3);
    expect(pilot.images.every(image=>image.alpha===true&&image.width===1143&&image.height===1376)).toBe(true);
    expect(pilot.images.every(image=>image.dev_publication_status==='verified')).toBe(true);
    expect(pilot.image_status).toBe('published');
    expect(pilot.release_source_prs).toEqual([432,434,435,436,437,448]);
    expect(pilot.dev_sha).toBe('53701a734a4f7eb971d446c5fe0c816fc176cb15');
    expect(pilot.ready_for_human_acceptance).toBe(true);
    expect(pilot.features).toEqual(['features/trophy-room/room.css','features/trophy-room/room.js','index.html']);
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('imagesReady=imageCount===0||item.image_status==="published"');
    expect(page).toContain('Bilder: ');
  });

  it('shows the four mobile-first views and gates decisions on a ready DEV version',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('PR-flöde');
    expect(page).toContain('data-panel="images"');
    expect(page).toContain('data-panel="storage"');
    expect(page).toContain('Historik');
    expect(page).toContain('ready_for_human_acceptance');
    expect(page).toContain('/^[0-9a-f]{40}$/i.test(testedSha)');
    expect(page).toContain('i.user.type==="Bot"');
    expect(page).toContain('github.com/"+owner+"/"+repo+"/issues/new');
    const script=page.split('<script>')[1]?.split('</script>')[0]||'';
    expect(script.length).toBeGreaterThan(0);
    expect(()=>new Function(script)).not.toThrow();
    expect(page).toContain('data-preview-toggle');
    expect(page).toContain('data-preview-fullscreen');
    expect(page).toContain('class="steps" aria-label="Ändringens steg"');
    expect(page).toContain("esc(item.purpose||item.expected_result||\"\")+'</p>'+stepHtml");
  });

  it('provides honest preview states and a single swipeable mobile workspace',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('touchstart');
    expect(page).toContain('Math.abs(dx)<Math.abs(dy)*1.5');
    expect(page).toContain('olympia-preview');
    expect(page).toContain('function cloudflarePreview(sha,pullRequestNumber)');
    expect(page).toContain('latest.state==="success"&&latest.url');
    expect(page).toContain('events.sort(function(a,b){var ar=');
    expect(page).toContain('result.state==="failed"');
    expect(page).toContain('previewMarkup(candidateStatus.releasePrSha,"LIVE-kandidat",candidateStatus.releasePr)');
    expect(page).toContain('.pages\\.dev');
    expect(page).toContain('data-pr-approve');
    expect(page).toContain('aria-busy');
    expect(page).toContain('Registrerat · behandlar…');
    expect(page).toContain('Slutgodkänn LIVE');
    expect(page).toContain('Visa i LIVE');
  });

  it('copies the OLYMPIA static pages into the Pages build output',()=>{
    const vite=read('vite.config.js');
    expect(vite).toContain('copyStaticTree("alea-copy-olympia", "olympia", "olympia")');
  });

  it('uses only the exact Cloudflare Pages check summary URL for a successful queried SHA',async()=>{
    const page=read('olympia/zeus-control.html');
    const helperStart=page.indexOf('function pagesPreviewUrl(value){');
    const functionStart=page.indexOf('async function cloudflarePreview(sha,pullRequestNumber){',helperStart);
    const functionEnd=page.indexOf('function previewMarkup(sha,label,pullRequestNumber){',functionStart);
    const source=page.slice(helperStart,functionEnd);
    const sha='a'.repeat(40);
    const url='https://ca4ed2b2.alea-crusaders.pages.dev/';
    const check=(overrides={})=>({name:'Cloudflare Pages',head_sha:sha,status:'completed',conclusion:'success',created_at:'2026-11-01T12:01:00Z',completed_at:'2026-11-01T12:02:00Z',details_url:'https://dash.cloudflare.com/deployments/logs',output:{summary:'<strong>Preview URL:</strong> '+url+'<br>Branch Preview URL: https://codex-preview.alea-crusaders.pages.dev'},...overrides});
    const previewFor=(status,checks)=>{
      const window={olympiaAuthenticatedRequest:async()=>({response:{ok:true},result:{ok:true,statuses:status,checkRuns:checks}})};
      const run=new Function('window','previewBySha','previewRequests',`${source}; return cloudflarePreview;`);
      return run(window,{},{});
    };
    await expect(previewFor([],[check()])(sha,457)).resolves.toEqual({state:'ready',url,sha});
    await expect(previewFor([],[check({head_sha:'b'.repeat(40)})])(sha,457)).resolves.toEqual({state:'missing',sha});
    await expect(previewFor([],[check({conclusion:'failure'})])(sha,457)).resolves.toEqual({state:'failed',sha});
    await expect(previewFor([],[check({output:{summary:'Deployment finished without a preview URL'}})])(sha,457)).resolves.toEqual({state:'missing',sha});
    await expect(previewFor([],[check({output:{summary:'Preview URL: https://example.com/abc.pages.dev'}})])(sha,457)).resolves.toEqual({state:'missing',sha});
    await expect(previewFor([],[check({status:'in_progress',conclusion:null,output:{summary:'Building'}})])(sha,457)).resolves.toEqual({state:'pending',sha});
    await expect(previewFor([{context:'Cloudflare Pages',state:'pending',target_url:url,updated_at:'2026-11-01T12:03:00Z'}],[check()])(sha,457)).resolves.toEqual({state:'pending',sha});
  });
  it('routes ordinary merged DEV PRs through the same Zeus decision flow',()=>{
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(page).toContain('id:"PR-"+Number(pr.number)');
    expect(page).toContain('prWorkItem(sourcePr)');
    expect(edge).toContain('const generic = itemId.match(/^PR-([1-9][0-9]*)$/)');
    expect(edge).toContain('action === "approve_and_merge_dev"');
    expect(edge).toContain('merge_method: "squash"');
    expect(edge).toContain('data.pullRequestHeadSha');
    expect(edge).toContain('event: "APPROVE"');
    expect(edge).toContain('PILOT-[0-9]{3}|PR-[1-9][0-9]*');
    expect(edge).not.toContain('PILOT-003');
    expect(workflow).toContain('PILOT-[0-9]{3}|PR-[1-9][0-9]*');
    expect(workflow).not.toContain('PILOT-003');
    expect(workflow).toContain('gh api --paginate "repos/$REPOSITORY/pulls/$PRIMARY_PR/files?per_page=100"');
    expect(edge).toContain('if (data.decision === "final_approval")');
  });

  it('keeps the main flow compact and orders decisions before active work',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('function itemPriority(item)');
    expect(page).toContain('.sort(function(a,b){return itemPriority(a)-itemPriority(b)})');
    expect(page).toContain('if(candidateStatus&&candidateStatus.candidateReady)return 0');
    expect(page).toContain('if(ready||accepted)return 0');
    expect(page).toContain('if(published)return 3');
    expect(page).toContain('class="auth-status"');
    expect(page).toContain('authBox.dataset.state');
    expect(page).toContain('.step.skipped');
    expect(page).toContain("rejected?'skipped'");
    expect(page).toContain('var registered=new Set(items.flatMap');
    expect(page).toContain('var open=openPullRequestError?[]:(openPullRequests||[]).filter(function(pr){return !registered.has(Number(pr.number))})');
    expect(page).toContain("if(published.length)html+='<h2 class=\"queue-section-title\">Publicerade</h2>'");
    expect(page).not.toContain('id="live-pr-list"');
    expect(page).toContain('Övriga öppna PR');
    expect(page).not.toContain('id="zeus-auth" class="notice"');
  });

  it('requires the live decision snapshot to include the current PR and image scope',async()=>{
    const page=read('olympia/zeus-control.html');
    const start=page.indexOf('async function verifyLiveScope(item,testedSha){');
    const end=page.indexOf('async function renderRefs()',start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source=page.slice(start,end);
    let historical;
    const response=()=>({encoding:'base64',content:Buffer.from(JSON.stringify(historical),'utf8').toString('base64')});
    const verify=new Function('api','json',source+';return verifyLiveScope;')('https://api.github.com/repos/example/repo',async()=>response());
    const current=JSON.parse(read('olympia/work-items.json')).items.find(item=>item.id==='PILOT-002');
    historical={items:[JSON.parse(JSON.stringify(current))]};
    await expect(verify(current,current.dev_sha)).resolves.toBe(true);
    const partial=JSON.parse(JSON.stringify(current));
    partial.release_source_prs=[432];
    partial.images=[];
    partial.image_count=0;
    partial.image_status='published';
    historical={items:[partial]};
    await expect(verify(current,current.dev_sha)).resolves.toBe(false);
    historical=null;
    await expect(verify(current,current.dev_sha)).resolves.toBe(false);
  });

  it('does not represent unresolved database or deployment evidence as release-ready',()=>{
    const baseline=JSON.parse(read('olympia/baseline-001.json'));
    expect(baseline.database.reconciliation).toBe('VERIFIED_CORE_SCHEMA_MATCH_WITH_ENVIRONMENT_DIFFERENCES');
    expect(baseline.database.core_schema_audit.status).toBe('VERIFIED_CORE_SCHEMA_MATCH');
    expect(baseline.database.core_schema_audit.environment_differences).toHaveLength(2);
    expect(baseline.deployments.verification_policy).toContain('source_sha');
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(page).toContain('window.olympiaReleasePreflightReady=lines.length===0&&!unknown');
    expect(edge).toContain('pr.base?.sha !== live.sha');
    expect(edge).toContain('new Set([...(Array.isArray(item.features) ? item.features : []), "tests/arcane-trophy-room.test.mjs"])');
    expect(edge).toContain('function configuredWorkItem(item: any)');
    expect(edge).toContain('async function verifyReleaseSources');
    expect(edge).not.toContain('item.pr_number !== 385');
    expect(edge).not.toContain('item.id !== "PILOT-001"');
    expect(page).not.toContain('candidatePr.base.sha===liveMatch[1]');
    expect(page).not.toContain('exactScope');
    expect(page).toContain('VERIFIED_CORE_SCHEMA_MATCH');
    expect(edge).toContain('CANDIDATE_SCOPE_NOT_ALLOWED');
    expect(edge).toContain('verifyPublishedManifest("main", live.sha)');
    expect(edge).toContain('verifyPublishedManifest("development", developmentSha)');
    expect(edge).toContain('pr.base?.sha !== live.sha');
    expect(edge).toContain('DEPLOYMENT_MANIFEST_UNVERIFIED');
    expect(page).toContain('if(renderId!==decisionRenderSequence)return;');
    expect(page).toContain('data-release-refresh');
    expect(page).toContain('Kontrollen kunde inte hämtas:');
    expect(page).toContain('candidateBlocked=check.result.blocked===true');
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
    expect(app).toContain('admin-olympia-fullscreen');
    expect(app).toContain('src="./olympia/zeus-control.html?v=20261101-repair-pr-list-fullscreen-v1"');
    expect(page).toContain('event.key==="alea:dev:alea_supabase_session_dev"');
    expect(page).toContain('session_check');
    expect(page).toContain('window.olympiaAuthVerified');
    expect(page).not.toContain('type="module"');
    expect(page).not.toContain('supabase.auth.setSession');
    expect(page).not.toContain('signInWithPassword');
    expect(page).not.toContain('signInWithOAuth');
  });

  it('routes deployment and candidate checks through the ALEA-authenticated bridge',()=>{
    const page=read('olympia/zeus-control.html');
    const outerScript=page.split('<script>')[1]?.split('</script>')[0]||'';
    expect(page).toContain('window.olympiaAuthenticatedRequest=async function(payload)');
    expect(outerScript).toContain('window.olympiaAuthenticatedRequest({action:"deployment_check"})');
    expect(outerScript).toContain('window.olympiaAuthenticatedRequest({action:"candidate_check"');
    expect(outerScript).toContain('action:"approve_and_merge_dev"');
    const inlineScripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
    expect(inlineScripts.length).toBeGreaterThanOrEqual(2);
    for(const script of inlineScripts)expect(()=>new Function(script)).not.toThrow();
  });

  it('uses the authenticated candidate check as the sole status source',()=>{
    const page=read('olympia/zeus-control.html');
    const decisions=page.slice(page.indexOf('async function renderDecisions()'),page.indexOf('function renderHistory()'));
    expect(decisions).toContain('window.olympiaAuthenticatedRequest({action:"candidate_check"');
    expect(decisions).not.toContain('i.comments_url');
    expect(decisions).not.toContain('candidateRows=');
    expect(decisions).toContain('candidateMessage=String(check.result.message||"")');
    expect(decisions).toContain('Kandidatstatus kunde inte hämtas. Det betyder inte att kandidatbygget har misslyckats.');
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
    expect(edge).toContain('? { contents: "read", issues: "read", pull_requests: "read" }');
    expect(edge).toContain('if (decision === "final_approval") Object.assign(permissions, { pull_requests: "write" });');
    expect(edge).not.toContain('checks: "read"');
    expect(edge).not.toContain('statuses: "read"');
    expect(edge).toContain('async function ghPublic(path: string)');
    expect(edge).toContain('const checks = await ghPublic("/repos/" + OWNER + "/" + REPO + "/commits/" + pr.head.sha + "/check-runs");');
    expect(edge).not.toContain('/commits/" + pr.head.sha + "/status');
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
    expect(legacy).toContain("sessionKey:'alea_supabase_session_dev'");
    expect(legacy).toContain("const SUPABASE_SESSION_KEY=ALEA_SUPABASE_CONFIG.sessionKey;");
    expect(legacy).toContain('function sessionBelongsToProject(session)');
    expect(legacy).toContain('return payload.iss===SUPABASE_URL');
    expect(legacy).toContain('function projectSession()');
    expect(page).toContain('localStorage.getItem("alea_supabase_session_dev")');
    expect(page).toContain('function sessionBelongsToDev(session)');
    expect(page).toContain('return payload.iss===url+"/auth/v1"');
    expect(page).toContain('ALEA-sessionen gäller inte DEV.');
  });

  it('reads current branch SHAs through the authenticated ALEA bridge',()=>{
    const page=read('olympia/zeus-control.html');
    expect(page).toContain('window.olympiaAuthenticatedRequest({action:"current_refs"})');
    expect(page).not.toContain('api+"/branches/development"');
    expect(page).not.toContain('api+"/branches/main"');
    expect(page).toContain('is:pr is:open');
    expect(page).toContain('is:pr is:merged');
    expect(page).toContain('currentDevSha=sha;');
    expect(page).toContain('Promise.allSettled([');
    expect(page).toContain('currentDevSha=String(devSha);renderTrial();');
    expect(page).toContain('Övrig GitHub-status kunde inte hämtas');
    expect(page).toContain('Aktuell GitHub-status OKÄND');
    expect(page).toContain('window.olympiaRefreshRefs=renderRefs;');
    expect(page).toContain('if(window.olympiaRefreshRefs)await window.olympiaRefreshRefs();');
  });

  it('lists current open GitHub PRs and checks selected PR CI and mergeability on demand',()=>{
    const page=read('olympia/zeus-control.html');
    const trial=page.slice(page.indexOf('function renderTrial()'),page.indexOf('window.olympiaRefreshTrial=renderTrial'));
    expect(page).toContain('window.olympiaAuthenticatedRequest({action:"pull_request_list"})');
    expect(page).toContain('finally{pullRequestsRefresh=null}');
    expect(page).toContain('Aktuella PR visas inte eftersom GitHub-statusen inte kunde bekräftas.');
    expect(trial).toContain('var open=openPullRequestError?[]:');
    expect(trial).not.toContain('Visar senast hämtade öppna PR');
    expect(page).toContain('data-pr-status');
    expect(page).toContain('action:"pull_request_status"');
    expect(page).toContain('pr.mergeable===true');
    expect(page).toContain('Status är OKÄND');
    const cloudflare=page.slice(page.indexOf('async function cloudflarePreview'),page.indexOf('function itemPriority'));
    expect(cloudflare).toContain('action:"pull_request_status"');
    expect(cloudflare).not.toContain('json(api+"/commits/');
    expect(page).not.toContain('json(api+"/pulls/"+number)');
    const edge=read('supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('decision === "deployment_check" || decision === "current_refs"');
    expect(edge).toContain('data.action === "current_refs"');
    expect(edge).toContain('OLYMPIA GitHub branch status failed');
    expect(edge).toContain('data.action === "pull_request_status"');
    expect(edge).toContain('OLYMPIA GitHub PR status failed');
    expect(edge).toContain('decision === "pull_request_list"');
    expect(edge).toContain('data.action === "pull_request_list"');
    expect(edge).toContain('pull_requests: "read"');
    expect(edge).toContain('/pulls?state=open&per_page=100&sort=updated&direction=desc');
  });

  it('opens the existing OLYMPIA admin section across the full viewport on mobile',()=>{
    const app=read('index.html');
    const styles=read('src/styles/app.css');
    expect(app).toContain('class="adminbox admin-detail admin-olympia-fullscreen hidden"');
    expect(app).toContain('class="admin-olympia-frame"');
    expect(styles).toContain('#adminOlympia.admin-olympia-fullscreen{position:fixed;inset:0');
    expect(styles).toContain('width:100vw;height:100vh;height:100dvh');
    expect(styles).toContain('#adminOlympia .admin-olympia-frame{display:block;width:100%;height:100%');
  });


  it('preserves Zeus approval across unrelated DEV changes but requires feature-file freshness',()=>{
    const page=read('olympia/zeus-control.html');
    const edge=read('supabase/functions/olympia-control/index.ts');
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(page).toContain('currentDevSha');
    expect(page).toContain('Godkänn DEV');
    expect(page).not.toContain('Godkänn Astrid');
    expect(page).not.toContain('testedSha===item.dev_sha');
    expect(page).toContain('action:"candidate_check"');
    expect(edge).toContain('async function inspectCandidate');
    expect(edge).toContain('verifyCandidate(token, item, {');
    expect(edge).toContain('decision === "candidate_check"');
    expect(page).not.toContain('candidatePr.mergeable===true');
    expect(page).not.toContain('liveBranch.commit.sha===liveMatch[1]');
    expect(page).toContain('data-sha="\'+esc(currentDevSha)+\'"');
    expect(edge).toContain('/git/ref/heads/development');
    expect(edge).toContain('ref.object?.sha !== data.testedDevSha');
    expect(edge).toContain('async function hasAcceptedFeatureVersion');
    expect(edge).toContain('compare/\" + tested + \"...\" + currentSha');
    expect(edge).toContain('protectedPaths.has(file.filename)');
    expect(edge).toContain('Om berörda filer har ändrats sedan godkännandet');
    expect(workflow).toContain('CURRENT_DEV_SHA=');
    expect(workflow).toContain('PR_MERGE_SHA" != "$SOURCE_PR_SHA');
    expect(workflow).toContain('merge-base --is-ancestor "$TESTED_SHA" "$CURRENT_DEV_SHA"');
    expect(workflow).toContain('The accepted change files changed after Zeus tested this DEV version. Refresh OLYMPIA and test again.');
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
    expect(block).toContain('window.olympiaAuthenticatedRequest({action:"deployment_check"})');
    expect(block).not.toContain('json(api+"/branches/main")');
    expect(block).not.toContain('json(api+"/branches/development")');
    expect(edge).toContain('data.action === "candidate_check"');
    expect(edge).toContain('githubToken("candidate_check")');
    expect(page).toContain('if(window.olympiaRefreshBlockers)await window.olympiaRefreshBlockers()');
  });
});
