(()=>{'use strict';
const endpoint='https://wkiuyklzzroavclnsxna.supabase.co/functions/v1/olympia-control';
const key='sb_publishable_LEWEgrZpK5hktEw6UPCAog_zB2R83et';
const status=document.getElementById('zeus-session');
let verified=false,busy=false;
function belongsToDev(value){
 try{const token=String(value?.access_token||'');const part=token.split('.')[1];if(!part)return false;const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const payload=JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')));return payload.iss==='https://wkiuyklzzroavclnsxna.supabase.co/auth/v1'&&(!payload.exp||payload.exp*1000>Date.now()+15000)}catch(_){return false}
}
function session(){for(const name of ['alea_supabase_session_dev','alea_supabase_session']){try{const value=JSON.parse(localStorage.getItem(name)||'null');if(belongsToDev(value))return value}catch(_){}}return null}
async function call(action,session,timeout=20000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(action),signal:controller.signal});const result=await response.json().catch(()=>({}));return {response,result}}finally{clearTimeout(timer)}}
const connectionStages={session:'pending',zeus:'pending',github:'pending'};
function renderConnection(message,good){let el=document.getElementById('connection-health');if(!el){el=document.createElement('section');el.id='connection-health';el.className='panel';el.setAttribute('role','status');el.setAttribute('aria-live','polite');status.insertAdjacentElement('afterend',el)}el.replaceChildren();const heading=document.createElement('strong');heading.textContent='Anslutningskontroll · ALEA DEV';el.append(heading);for(const [key,label] of [['session','DEV-inloggning'],['zeus','Zeus-behörighet'],['github','GitHub PR-lista']]){const p=document.createElement('p');const state=connectionStages[key];p.style.margin='8px 0';p.style.color=state==='ok'?'#7fdfaa':state==='error'?'#fa9790':'#bdb3a4';p.textContent=(state==='ok'?'✓ ':state==='error'?'✕ ':'○ ')+label+(state==='pending'?' · inte verifierad':state==='ok'?' · fungerar':' · problem');el.append(p)}const detail=document.createElement('p');detail.style.borderLeft='3px solid '+(good?'#3ea776':'#e5b95d');detail.style.paddingLeft='10px';detail.textContent=message;el.append(detail)}
function showConnection(message,good){renderConnection(message,good)}
function explainConnection(error){const msg=String(error?.message||error||'');if(/GITHUB_APP_TOKEN_FAILED_422/i.test(msg))return 'GitHub App nekar begärda behörigheter (422). DEV-inloggningen fungerar. Kontrollera GitHub App-installationen.';if(/GITHUB_APP_TOKEN_FAILED_/i.test(msg))return 'GitHub App kunde inte skapa en installationstoken. DEV-inloggningen fungerar.';if(/session|invalid.jwt|expired.jwt/i.test(msg))return 'ALEA DEV-sessionen saknas eller har gått ut. Logga in igen.';if(/403|auktoriser|behörighet/i.test(msg))return 'Åtkomst nekad (403). Kontrollera Zeus-behörighet och GitHub App.';if(/401/i.test(msg))return 'Inloggning nekad (401). Logga in i ALEA DEV igen.';if(/429/i.test(msg))return 'GitHub begränsar anropen (429). Försök senare.';if(/502|503|504|fetch|timeout|abort/i.test(msg))return 'Supabase eller GitHub kunde inte nås. Försök uppdatera igen.';return msg||'Okänt anslutningsfel.'}
window.olympiaV2Request=async action=>{const current=session();if(!current){connectionStages.session='error';connectionStages.zeus='pending';connectionStages.github='pending';showConnection('ALEA DEV-session saknas. Logga in igen.',false);throw Error('Giltig ALEA DEV-session saknas')}try{const {response,result}=await call(action,current);if(!response.ok||result.ok!==true)throw Error(result.message||'Supabase HTTP '+response.status);if(action.action==='pull_request_list'){connectionStages.github='ok';showConnection('GitHub svarade: '+(result.pullRequests||[]).length+' PR mottagna.',true)};return result}catch(error){if(action.action==='pull_request_list')connectionStages.github='error';showConnection(explainConnection(error),false);throw error}};
async function verify(){const current=session();if(!current){connectionStages.session='error';connectionStages.zeus='pending';connectionStages.github='pending';status.textContent='ALEA DEV-session saknas. Logga in i ALEA DEV och öppna OLYMPIA 2.0 från Admin.';showConnection('ALEA DEV-session saknas. Logga in igen.',false);return}connectionStages.session='ok';try{const {response,result}=await call({action:'session_check'},current);verified=response.ok&&result.ok===true;window.olympiaV2ZeusVerified=verified;connectionStages.zeus=verified?'ok':'error';status.textContent=verified?'Zeus-behörighet verifierad · DEV-beslut tillgängliga':'DEV-beslut låsta: '+(result.message||'sessionen kunde inte verifieras');if(verified){showConnection('Zeus-session verifierad. Kontrollerar PR-listan…',true);await window.olympiaV2Refresh?.()}else showConnection(explainConnection(result.message),false)}catch(error){connectionStages.zeus='error';status.textContent='DEV-beslut låsta: '+(error.message||'anslutningsfel');showConnection(explainConnection(error),false)}}
function feedback(button,message){const card=button.closest('[data-pr]');let target=card.querySelector('[data-dev-result]');if(!target){target=document.createElement('p');target.className='notice';target.setAttribute('data-dev-result','');target.setAttribute('role','status');button.closest('.lane').append(target)}target.textContent=message;try{sessionStorage.setItem('olympia-v2-approval-'+card.dataset.pr,JSON.stringify({sha:button.dataset.headSha,message,at:Date.now()}))}catch(_){}}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-dev-approve]');if(!button||busy)return;const number=Number(button.dataset.devApprove),sha=button.dataset.headSha;feedback(button,'Klick registrerat · kontrollerar DEV-godkännande…');if(!verified){feedback(button,'Stopp: Zeus-session inte verifierad.');return}if(!Number.isSafeInteger(number)||number<1||!/^[a-f0-9]{40}$/i.test(sha)){feedback(button,'Stopp: ogiltigt PR-nummer eller SHA.');return}if(!confirm('Godkänn PR #'+number+' och squash-merga till development?')){feedback(button,'DEV-godkännande avbrutet.');return}busy=true;button.disabled=true;feedback(button,'PR #'+number+' · merging to DEV, please wait…');try{const {response,result}=await call({action:'approve_and_merge_dev',pullRequestNumber:number,pullRequestHeadSha:sha},session());if(!response.ok||result.ok!==true||result.merged!==true||!/^[a-f0-9]{40}$/i.test(result.sha||''))throw Error('HTTP '+response.status+' · '+(result.stage||'server')+' · '+(result.message||'GitHub bekräftade ingen merge'));feedback(button,'DEV-merge bekräftad av GitHub · '+result.sha);button.textContent='DEV godkänd ✓';await window.olympiaV2Refresh?.()}catch(error){feedback(button,'Ingen bekräftad merge: '+(error.name==='AbortError'?'Timeout, kontrollera PR-status innan nytt försök':error.message));button.disabled=false}finally{busy=false}},false);

// LIVE candidate workflow reuses the existing server-side Zeus decision bridge.
// No client action merges to main; final LIVE approval remains disabled.
let candidateStatusBusy=false;
window.olympiaV2CheckCandidateStatuses=async()=>{
 if(candidateStatusBusy)return;
 const targets=[...document.querySelectorAll('[data-candidate-status]')];
 if(!targets.length)return;
 if(!verified){targets.forEach(node=>node.textContent='LIVE-status väntar på Zeus-verifiering.');return}
 candidateStatusBusy=true;
 try{
  for(let i=0;i<targets.length;i+=3){
   await Promise.all(targets.slice(i,i+3).map(async node=>{
    const number=Number(node.dataset.candidateStatus),sha=node.dataset.mergeSha||'';
    if(!Number.isSafeInteger(number)||number<1||!/^[a-f0-9]{40}$/i.test(sha)){
     node.textContent='Kandidatens DEV-mergeversion saknas. Teknisk granskning krävs.';return;
    }
    try{
     const result=await window.olympiaV2Request({action:'auto_candidate_diagnostics',pullRequestNumber:number,testedDevSha:sha});
     if(!node.isConnected)return;
     node.replaceChildren();
     const line=document.createElement('p');node.append(line);
     const candidate=result.candidate;
     if(candidate?.ready===true&&candidate.releasePr&&candidate.releaseUrl){
      line.className='good';line.textContent='LIVE-kandidat #'+candidate.releasePr+' · verifierad och redo för granskning.';
      const checks=document.createElement('p');checks.className='good';checks.textContent='✓ Kontroller verifierade för aktuell SHA '+candidate.releasePrSha;node.append(checks);
      const link=document.createElement('a');link.className='action';link.href=candidate.releaseUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Visa verifierad LIVE-kandidat #'+candidate.releasePr;node.append(link);
      // A release PR is not a deploy preview. Never guess a Cloudflare URL.
      const review=document.createElement('div');review.className='live-review';
      const heading=document.createElement('strong');heading.textContent='LIVE · Förhandsgranskning';review.append(heading);
      const preview=document.createElement('button');preview.type='button';preview.disabled=true;
      preview.textContent='Förhandsvisa LIVE · inväntar säker preview';review.append(preview);
      if(candidate.previewUrl){
       try{const verifiedUrl=new URL(candidate.previewUrl);
        if(verifiedUrl.protocol==='https:'&&verifiedUrl.hostname.endsWith('.alea-crusaders.pages.dev')&&verifiedUrl.hostname!=='alea-crusaders.pages.dev'){
         preview.remove();const previewLink=document.createElement('a');previewLink.className='action';previewLink.href=verifiedUrl.href;previewLink.target='_blank';previewLink.rel='noopener noreferrer';previewLink.textContent='Förhandsvisa LIVE-kandidat #'+candidate.releasePr;review.append(previewLink);
        }
       }catch(_){}
      }
      const note=document.createElement('p');note.className='muted';note.textContent=candidate.previewUrl?'Förhandsvisningen är verifierad. Endast pilot #524 kan slutgodkännas i denna version.':'Kandidatens tester är godkända. En versionsbunden förhandsvisning saknas ännu. LIVE-beslut är låsta.';review.append(note);
      const decisions=document.createElement('div');decisions.className='actions';
      const pilotReady=number===524&&candidate.releasePr===528&&result.issue?.number>0&&/^[a-f0-9]{40}$/i.test(candidate.candidateTreeSha||'')&&/^[a-f0-9]{40}$/i.test(candidate.releasePrSha||'')&&Boolean(candidate.previewUrl);
      const approve=document.createElement('button');approve.type='button';approve.textContent='Godkänn LIVE';approve.disabled=!pilotReady;decisions.append(approve);
      if(pilotReady)approve.addEventListener('click',async()=>{
       if(busy||!verified)return;
       const confirmed=confirm('Godkänn LIVE-kandidat #528 för PR #524? Detta squash-mergar releaseförslaget till main och startar verklig LIVE-publicering. Åtgärden kan inte ångras automatiskt.');
       if(!confirmed)return;
       busy=true;approve.disabled=true;feedback(approve,'Verifierar LIVE-kandidat och publiceringsvillkor…');
       try{
        const {response:reply,result:outcome}=await call({action:'decision',decision:'final_approval',itemId:'PR-524',testedDevSha:sha,candidateIssue:result.issue.number,candidateTreeSha:candidate.candidateTreeSha,releasePrSha:candidate.releasePrSha},session(),60000);
        if(!reply.ok||outcome.ok!==true)throw Error(outcome.message||'LIVE-godkännandet kunde inte verifieras');
        feedback(approve,'GitHub bekräftade LIVE-merge · '+(outcome.mergeSha||'')+'. Publicering verifieras separat.');
        approve.textContent='LIVE-merge genomförd ✓';
        await window.olympiaV2Refresh?.();
       }catch(error){
        feedback(approve,'Ingen bekräftad LIVE-merge: '+(error.name==='AbortError'?'Timeout – kontrollera status innan nytt försök':error.message));
        // Do not enable retries without refreshing candidate and baseline status.
       }finally{busy=false}
      });
      for(const label of ['Lägg i releasepaket','Omarbeta','Kasta']){
       const control=document.createElement('button');control.type='button';control.disabled=true;control.textContent=label;decisions.append(control);
      }
      review.append(decisions);node.append(review);
     }else if(candidate?.blocked){line.textContent=candidate.message||'LIVE-kandidaten behöver granskas. Ingen publicering har skett.';}
     else if(candidate){line.textContent=candidate.message||'LIVE-kandidat förbereds.';}
     else {const labels={not_started:'Ingen automatisk LIVE-kandidat hittad för denna DEV-merge.',requested:'LIVE-kandidat begärd – verifiering pågår.',needs_review:'LIVE-förberedelsen behöver granskas.',unlocked_issue:'Releaseärende behöver granskas.',unknown:'LIVE-status kunde inte verifieras.',inconsistent:'LIVE-kandidatlåset behöver teknisk granskning.'};line.textContent=labels[result.state]||'LIVE-status okänd.';}
    }catch(_){if(node.isConnected)node.textContent='LIVE-status kunde inte hämtas. Ingen publicering har skett.'}
   }));
  }
 }finally{candidateStatusBusy=false}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(!verified)verify();else window.olympiaV2CheckCandidateStatuses?.()});
setInterval(()=>{if(!document.hidden&&verified)window.olympiaV2CheckCandidateStatuses?.()},30000);
verify();
})();