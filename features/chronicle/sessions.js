(function(){
'use strict';
let activeGameSession=null,sessionUiBusy=false,sessionTimer=null;
const $id=id=>document.getElementById(id);
const PHASES=[
 {key:'dawn',icon:'🌅',name:'Soluppgång',tone:'dawn'},
 {key:'morning',icon:'🌤️',name:'Förmiddag',tone:'morning'},
 {key:'afternoon',icon:'☀️',name:'Eftermiddag',tone:'afternoon'},
 {key:'evening',icon:'🌆',name:'Skymning',tone:'evening'},
 {key:'night',icon:'🌙',name:'Natt',tone:'night'}
];
function canManage(){try{return !!(activeUser()?.admin||centralCampaignRole==='gm')}catch(_){return false}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function localDateTime(value=new Date()){
 const d=new Date(value.getTime()-value.getTimezoneOffset()*60000);
 return d.toISOString().slice(0,16)
}
function localDate(){return localDateTime().slice(0,10)}
function localTime(){return localDateTime().slice(11,16)}
function characters(){try{return (chars||[]).filter(c=>c?._dbId&&c.ownerId!=='SLP').sort((a,b)=>String(a.identity?.namn||'').localeCompare(String(b.identity?.namn||''),'sv'))}catch(_){return []}}
function phase(value){return PHASES.find(item=>item.key===value)||PHASES[1]}
function setBannerPhase(value){
 const item=phase(value),header=document.querySelector('.alea-app-header');
 if(header){header.dataset.dayPhase=item.tone;header.style.setProperty('--alea-phase-filter',({
  dawn:'sepia(.14) saturate(1.2) hue-rotate(-8deg)',
  morning:'sepia(.04) saturate(1.1) hue-rotate(5deg)',
  afternoon:'sepia(.08) saturate(1.18) hue-rotate(18deg)',
  evening:'sepia(.28) saturate(1.35) hue-rotate(-12deg)',
  night:'brightness(.62) saturate(.85) hue-rotate(18deg)'
 })[item.tone])}
}
window.aleaSetBannerTimePhase=setBannerPhase;
async function refreshActive(){
 if(!centralCampaignId){activeGameSession=null;window.aleaCurrentGameSessionId=null;return null}
 const rows=await dbJson('game_sessions?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&status=in.(active,paused)&select=id,campaign_id,title,adventure_name,session_date,status,started_at,ended_at,summary,started_by,ended_by&order=started_at.desc&limit=1');
 activeGameSession=rows?.[0]||null;window.aleaCurrentGameSessionId=activeGameSession?.status==='active'?activeGameSession.id:null;
 renderButton();return activeGameSession
}
window.aleaGetActiveGameSessionId=async function(){try{const session=await refreshActive();return session?.status==='active'?session.id:null}catch(error){console.warn('Aktivt spelmöte kunde inte läsas',error);return null}};
function ensureUi(){
 const clock=document.querySelector('.alea-clock');
 if(clock&&!$id('gameSessionBtn')){
  const btn=document.createElement('button');btn.id='gameSessionBtn';btn.type='button';btn.className='btn game-session-nav';btn.title='Öppna Spelmöte';btn.textContent='🎲 Spelmöte';btn.addEventListener('click',openGameSessionPanel);clock.appendChild(btn)
 }
 if(!$id('gameSessionModal')){
  const modal=document.createElement('div');modal.id='gameSessionModal';modal.className='game-session-backdrop hidden';modal.setAttribute('role','presentation');
  modal.innerHTML='<section class="game-session-dialog" role="dialog" aria-modal="true" aria-labelledby="gameSessionTitle"><header><div><span class="game-session-eyebrow">ALEA · KRÖNIKA</span><h2 id="gameSessionTitle">Spelmöte</h2></div><button type="button" class="game-session-close" aria-label="Stäng">×</button></header><div id="gameSessionBody"></div></section>';
  modal.addEventListener('click',e=>{if(e.target===modal)closePanel()});modal.querySelector('.game-session-close').addEventListener('click',closePanel);document.body.appendChild(modal)
 }
}
function renderButton(){
 const btn=$id('gameSessionBtn');if(!btn)return;
 btn.disabled=sessionUiBusy;
 btn.textContent=activeGameSession?'🎲 Spelmöte · Pågår':'🎲 Spelmöte';
 btn.title=activeGameSession?'Öppna pågående Spelmöte':'Öppna Spelmöte'
}
function dialMarkup(){
 const active=phase(campaignDayState?.time_of_day);
 return '<div class="arcane-dial-wrap"><div class="arcane-dial" role="group" aria-label="Välj dygnsfas">'+PHASES.map((p,i)=>'<button type="button" class="arcane-dial-phase phase-'+p.tone+(p.key===active.key?' selected':'')+'" aria-pressed="'+(p.key===active.key)+'" onclick="setCampaignTimeOfDay(\''+p.key+'\')" '+(!canManage()?'disabled':'')+'><span class="arcane-dial-mark" aria-hidden="true">'+p.icon+'</span><span>'+p.name+'</span></button>').join('')+'</div><p class="arcane-dial-note">Dygnsfasen är ett fristående tillstånd. Byte ändrar inte dag, vila, rollpersoner eller strid.</p></div>'
}
function renderDay(){
 const d=campaignDayState;
 if(!d)return '<p class="game-session-muted">Ingen dagstatus finns för kampanjen.</p>';
 const manager=canManage(),current=phase(d.time_of_day);
 let html='<section class="chronicle-section"><div class="chronicle-section-head"><div><span class="game-session-eyebrow">SPEL VÄRLD</span><h3>Dag & dygnsfas</h3></div><strong class="world-day">Dag '+esc(d.day_number)+'</strong></div>'+dialMarkup()+
 '<div class="chronicle-grid"><div class="chronicle-card"><span>Aktuell dygnsfas</span><strong>'+current.icon+' '+current.name+'</strong></div><div class="chronicle-card"><span>Väder</span><strong>'+esc(d.weather||'Ej angivet')+'</strong></div><div class="chronicle-card"><span>Vila denna dag</span><strong>'+(Number(d.rest_hours)>0?esc(d.rest_hours)+' h':'Ingen vila')+'</strong></div></div>';
 if(manager)html+='<div class="chronicle-controls"><label class="game-session-field">Dagnummer<input id="arcaneDayNumber" type="number" min="1" step="1" value="'+esc(d.day_number)+'"></label><button class="btn" type="button" onclick="aleaSetCampaignDayNumber()">Spara dag</button><label class="game-session-field">Väder<input id="arcaneWeather" value="'+esc(d.weather||'')+'" placeholder="Exempelvis klart eller regn"></label><button class="btn" type="button" onclick="aleaSaveArcaneWeather()">Spara väder</button><button class="btn" type="button" onclick="aleaStartNextWorldDay()">Starta nästa dag</button></div>';
 html+='<div class="chronicle-rest"><h4>Vila och återhämtning</h4><p>Vila registreras som en separat handling. Återhämtningen följer kampanjens befintliga PSY- och ERF-regler.</p>'+(manager?'<div class="chronicle-rest-action"><label class="game-session-field">Vilotid i timmar<input id="arcaneRestHours" type="number" min="1" max="24" step="1" value="6"></label><button class="btn primary" type="button" onclick="aleaApplyCampaignRest()">Registrera vila</button></div>':'<p class="game-session-muted">Endast spelledaren kan registrera vila.</p>')+'</div></section>';
 return html
}
window.aleaSetCampaignDayNumber=async function(){
 if(!canManage()||!centralCampaignId)return;const value=Number($id('arcaneDayNumber')?.value);
 if(!Number.isInteger(value)||value<1){alert('Dagnumret måste vara ett heltal från 1.');return}
 try{const result=await dbJson('rpc/set_campaign_day_number',{method:'POST',body:JSON.stringify({p_campaign_id:centralCampaignId,p_day_number:value})});campaignDayState=Array.isArray(result)?result[0]:result;renderCampaignDayHeader();renderPanel();showBackupToast('✓ Dag '+value+' sparad')}
 catch(error){alert('Kunde inte spara dagnumret: '+error.message)}
};
window.aleaSaveArcaneWeather=async function(){
 if(!canManage()||!centralCampaignId)return;
 try{const result=await dbJson('rpc/set_campaign_weather',{method:'POST',body:JSON.stringify({p_campaign_id:centralCampaignId,p_weather:$id('arcaneWeather')?.value||''})});campaignDayState=Array.isArray(result)?result[0]:result;renderCampaignDayHeader();renderPanel();showBackupToast('✓ Vädret sparat')}
 catch(error){alert('Kunde inte spara vädret: '+error.message)}
};
window.aleaStartNextWorldDay=async function(){
 if(!canManage()||!centralCampaignId)return;
 if(!await askConfirm('Starta dag '+(Number(campaignDayState?.day_number||1)+1)+'?','En ny kampanjdag startas utan vila. Vila registreras separat.','Starta dag'))return;
 try{await dbJson('rpc/advance_campaign_day',{method:'POST',body:JSON.stringify({p_campaign_id:centralCampaignId,p_weather:$id('arcaneWeather')?.value||campaignDayState?.weather||'',p_rest_hours:0})});await loadCampaignDayState();renderCampaignDayHeader();renderPanel();showBackupToast('✓ Ny dag startad')}
 catch(error){alert('Kunde inte starta ny dag: '+error.message)}
};
window.aleaApplyCampaignRest=async function(){
 if(!canManage()||!centralCampaignId)return;const hours=Number($id('arcaneRestHours')?.value);
 if(!Number.isFinite(hours)||hours<=0||hours>24){alert('Ange en vilotid mellan 1 och 24 timmar.');return}
 if(!await askConfirm('Registrera '+hours+' timmars vila?','Vilan tillämpas enligt kampanjens befintliga regler för PSY och ERF.','Registrera vila'))return;
 try{const result=await dbJson('rpc/apply_campaign_rest',{method:'POST',body:JSON.stringify({p_campaign_id:centralCampaignId,p_rest_hours:hours})});campaignDayState=Array.isArray(result)?result[0]:result;await Promise.all([loadCampaignCharacterRestStates(),loadCampaignErfAwards()]);renderCampaignDayHeader();renderPanel();showBackupToast('✓ Vila registrerad')}
 catch(error){alert('Kunde inte registrera vila: '+error.message)}
};
async function getActiveParticipants(session){
 if(!session)return [];
 return dbJson('game_session_participants?session_id=eq.'+encodeURIComponent(session.id)+'&select=session_id,character_id,character_name_snapshot,participant_kind,joined_at,left_at&left_at=is.null&order=character_name_snapshot.asc')
}
async function getHistory(){
 if(!centralCampaignId)return [];
 return dbJson('game_sessions?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=id,title,adventure_name,session_date,status,started_at,ended_at,summary&order=started_at.desc&limit=25')
}
function elapsed(start,end=null){
 const ms=Math.max(0,(new Date(end||Date.now()).getTime()-new Date(start).getTime()));
 const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);
 return h+' h '+String(m).padStart(2,'0')+' min'
}
function renderSession(session,participants){
 const manager=canManage(),people=characters(),roster=new Set(participants.map(p=>String(p.character_id)));
 if(!session){
  return '<section class="chronicle-section"><div class="chronicle-section-head"><div><span class="game-session-eyebrow">VERKLIGT SPELMÖTE</span><h3>Ej startat</h3></div><span class="game-session-status-pill">Ej startat</span></div>'+(manager?
   '<div class="chronicle-start-grid"><label class="game-session-field">Datum<input id="gameSessionDate" type="date" value="'+localDate()+'"></label><label class="game-session-field">Starttid<input id="gameSessionStartTime" type="time" value="'+localTime()+'"></label><label class="game-session-field">Spelmöte<input id="gameSessionName" maxlength="120" placeholder="Exempelvis Skelettbyns hemlighet"></label><label class="game-session-field">Äventyr<input id="gameSessionAdventure" maxlength="160" placeholder="Aktuellt äventyr (valfritt)"></label></div><fieldset class="game-session-roster"><legend>Deltagande rollpersoner</legend>'+(people.length?people.map(c=>'<label><input type="checkbox" value="'+esc(c._dbId)+'" checked><span>'+esc(c.identity?.namn||c.name||'Namnlös')+'</span></label>').join(''):'<p>Inga sparade spelarrollpersoner hittades.</p>')+'</fieldset><button id="gameSessionStartBtn" class="btn primary game-session-action" type="button">Starta Spelmöte</button>'
   :'<p class="game-session-muted">Spelledaren kan starta ett nytt Spelmöte.</p>')+'</section>'
 }
 const status=session.status==='closed'?'Avslutat':session.status==='paused'?'Pausat':'Pågår';
 let html='<section class="chronicle-section"><div class="chronicle-section-head"><div><span class="game-session-eyebrow">VERKLIGT SPELMÖTE</span><h3>'+status+'</h3></div><span class="game-session-status-pill '+(session.status==='active'?'is-active':'')+'">'+status+'</span></div><div class="chronicle-session-title">'+esc(session.title||'Spelmöte')+'</div>'+(session.adventure_name?'<p class="game-session-muted">Äventyr: '+esc(session.adventure_name)+'</p>':'')+'<div class="chronicle-session-timing"><div><span>Datum</span><strong>'+esc(session.session_date)+'</strong></div><div><span>Starttid</span><strong>'+esc(new Date(session.started_at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}))+'</strong></div><div><span>Speltid</span><strong id="gameSessionElapsed">'+elapsed(session.started_at,session.ended_at)+'</strong></div></div>';
 if(session.status==='active'&&manager){
  html+='<label class="game-session-field">Sammanfattning vid avslut<textarea id="gameSessionSummary" rows="3" placeholder="Viktiga händelser, beslut och cliffhanger"></textarea></label><fieldset class="game-session-roster"><legend>Deltagande rollpersoner</legend>'+(people.length?people.map(c=>'<label><input type="checkbox" value="'+esc(c._dbId)+'" '+(roster.has(String(c._dbId))?'checked':'')+'><span>'+esc(c.identity?.namn||c.name||'Namnlös')+'</span></label>').join(''):'<p>Inga sparade spelarrollpersoner hittades.</p>')+'</fieldset><div class="game-session-actions"><button id="gameSessionSaveRoster" class="btn" type="button">Spara deltagare</button><button id="gameSessionEndBtn" class="btn danger" type="button">Avsluta Spelmöte</button></div>';
 }else{
  html+='<p class="game-session-muted">'+(session.ended_at?'Avslutat '+esc(new Date(session.ended_at).toLocaleString('sv-SE')):'Pausat')+'</p>'+(session.summary?'<div class="chronicle-summary"><strong>Sammanfattning</strong><p>'+esc(session.summary)+'</p></div>':'')+(session.status==='paused'&&manager?'<button id="gameSessionResumeBtn" class="btn primary" type="button">Återuppta Spelmöte</button>':'');
 }
 return html+'</section>'
}
function renderHistory(rows){
 rows=rows.filter(s=>s.status==='closed');
 if(!rows.length)return '<section class="chronicle-section"><h3>Tidigare spelmöten</h3><p class="game-session-muted">Inga tidigare Spelmöten.</p></section>';
 return '<section class="chronicle-section"><h3>Tidigare spelmöten</h3><div class="chronicle-history">'+rows.map(s=>'<details><summary><span>'+esc(s.session_date)+' · '+esc(s.title||'Spelmöte')+'</span><em>'+(s.status==='closed'?'Avslutat':'Pågår')+'</em></summary><div><p>Start '+esc(new Date(s.started_at).toLocaleString('sv-SE'))+(s.ended_at?' · Slut '+esc(new Date(s.ended_at).toLocaleString('sv-SE')):'')+'</p>'+(s.adventure_name?'<p>Äventyr: '+esc(s.adventure_name)+'</p>':'')+(s.summary?'<p>'+esc(s.summary)+'</p>':'')+'</div></details>').join('')+'</div></section>'
}
function renderPanel(){
 const body=$id('gameSessionBody');if(!body)return;
 const session=activeGameSession;
 body.innerHTML=renderSession(session,window.aleaSessionParticipants||[])+renderDay()+(window.aleaSessionHistory?renderHistory(window.aleaSessionHistory):'');
 $id('gameSessionStartBtn')?.addEventListener('click',startSession);
 $id('gameSessionEndBtn')?.addEventListener('click',()=>endSession(session));
 $id('gameSessionSaveRoster')?.addEventListener('click',()=>saveRoster(session,window.aleaSessionParticipants||[]));
  $id('gameSessionResumeBtn')?.addEventListener('click',()=>setSessionStatus(session,'active'));
 setBannerPhase(campaignDayState?.time_of_day);
}
window.aleaRefreshChroniclePanel=()=>{if(!$id('gameSessionModal')?.classList.contains('hidden'))renderPanel()};
async function openPanel(){
 ensureUi();const modal=$id('gameSessionModal');if(!modal)return;
 modal.classList.remove('hidden');document.body.classList.add('game-session-open');
 if(sessionTimer)clearInterval(sessionTimer);
 sessionTimer=setInterval(()=>{const el=$id('gameSessionElapsed');if(el&&activeGameSession?.status==='active')el.textContent=elapsed(activeGameSession.started_at)},30000);
 await loadAndRender()
}
function closePanel(){if(sessionTimer)clearInterval(sessionTimer);sessionTimer=null;$id('gameSessionModal')?.classList.add('hidden');document.body.classList.remove('game-session-open')}
async function loadAndRender(){
 ensureUi();sessionUiBusy=true;renderButton();const body=$id('gameSessionBody');if(body)body.innerHTML='<p class="game-session-muted">Laddar Spelmöte…</p>';
 try{
  if(!centralCampaignId){if(body)body.innerHTML='<p class="game-session-muted">Logga in och välj en kampanj först.</p>';return}
  await loadCampaignDayState();const session=await refreshActive();
  window.aleaSessionParticipants=await getActiveParticipants(session);
  window.aleaSessionHistory=await getHistory();renderPanel();
 }catch(error){if(body)body.innerHTML='<p class="game-session-error">Kunde inte läsa Spelmöte: '+esc(error.message)+'</p>'}
 finally{sessionUiBusy=false;renderButton()}
}
async function startSession(){
 if(sessionUiBusy||!canManage()||!centralCampaignId)return;
 const date=$id('gameSessionDate')?.value||localDate(),time=$id('gameSessionStartTime')?.value||localTime();
 const start=new Date(date+'T'+time+':00');
 if(Number.isNaN(start.getTime())){alert('Ange ett giltigt startdatum och klockslag.');return}
 const title=$id('gameSessionName')?.value.trim()||'Spelmöte';
 const adventure=$id('gameSessionAdventure')?.value.trim()||null;
 const selected=new Set([...document.querySelectorAll('#gameSessionBody .game-session-roster input:checked')].map(x=>x.value));
 const people=characters().filter(c=>selected.has(String(c._dbId)));
 sessionUiBusy=true;renderButton();
 try{
  const rows=await dbJson('game_sessions',{method:'POST',body:JSON.stringify({campaign_id:centralCampaignId,title,adventure_name:adventure,session_date:date,status:'active',started_at:start.toISOString(),started_by:activeUser()?.id||null})});
  const session=rows?.[0];if(!session)throw Error('Databasen returnerade inget Spelmöte.');
  if(people.length)await dbJson('game_session_participants',{method:'POST',body:JSON.stringify(people.map(c=>({campaign_id:centralCampaignId,session_id:session.id,character_id:c._dbId,character_name_snapshot:c.identity?.namn||c.name||'Namnlös',participant_kind:'player'})))});
  showBackupToast('✓ Spelmöte startat');await loadAndRender()
 }catch(error){alert('Kunde inte starta Spelmöte: '+error.message);sessionUiBusy=false;renderButton();await loadAndRender()}
}
async function saveRoster(session,existing){
 if(sessionUiBusy||!canManage())return;
 const selected=new Set([...document.querySelectorAll('#gameSessionBody .game-session-roster input:checked')].map(x=>x.value));
 const current=new Set(existing.map(p=>String(p.character_id))),people=characters();
 const additions=people.filter(c=>selected.has(String(c._dbId))&&!current.has(String(c._dbId)));
 const removals=existing.filter(p=>!selected.has(String(p.character_id)));
 sessionUiBusy=true;renderButton();
 try{
  if(removals.length)await dbJson('game_session_participants?session_id=eq.'+encodeURIComponent(session.id)+'&character_id=in.('+removals.map(p=>encodeURIComponent(p.character_id)).join(',')+')',{method:'DELETE',headers:{Prefer:'return=minimal'}});
  if(additions.length)await dbJson('game_session_participants',{method:'POST',body:JSON.stringify(additions.map(c=>({campaign_id:session.campaign_id,session_id:session.id,character_id:c._dbId,character_name_snapshot:c.identity?.namn||c.name||'Namnlös',participant_kind:'player'})))});
  showBackupToast('✓ Deltagare sparade');await loadAndRender()
 }catch(error){alert('Kunde inte spara deltagarna: '+error.message);sessionUiBusy=false;renderButton();await loadAndRender()}
}
async function endSession(session){
 if(!await askConfirm('Avsluta Spelmötet?','Sluttid och sammanfattning sparas i kampanjens möteshistorik.','Avsluta Spelmöte'))return;
 if(sessionUiBusy||!canManage())return;
 sessionUiBusy=true;renderButton();
 try{
  await dbJson('game_sessions?id=eq.'+encodeURIComponent(session.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'closed',ended_at:new Date().toISOString(),summary:$id('gameSessionSummary')?.value.trim()||null,ended_by:activeUser()?.id||null,updated_at:new Date().toISOString()})});
  await refreshActive();showBackupToast('✓ Spelmöte avslutat');await loadAndRender()
 }catch(error){alert('Kunde inte avsluta Spelmöte: '+error.message);sessionUiBusy=false;renderButton()}
}
async function setSessionStatus(session,status){
 if(sessionUiBusy||!canManage())return;
 sessionUiBusy=true;renderButton();
 try{await dbJson('game_sessions?id=eq.'+encodeURIComponent(session.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status,updated_at:new Date().toISOString()})});await loadAndRender()}
 catch(error){alert('Kunde inte återuppta Spelmötet: '+error.message);sessionUiBusy=false;renderButton()}
}
 function openGameSessionPanel(){return openPanel()}
 window.openGameSessionPanel=openGameSessionPanel;window.closeGameSessionPanel=closePanel;
window.openCampaignDay=openPanel;
ensureUi();renderButton();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureUi,{once:true});
})();
