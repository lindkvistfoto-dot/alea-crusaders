(function(){
'use strict';
let activeGameSession=null,sessionUiBusy=false;
const $id=id=>document.getElementById(id);
function gameSessionCanManage(){try{return !!(activeUser()?.admin||centralCampaignRole==='gm')}catch(_){return false}}
function localSessionDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function sessionEsc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sessionCharacters(){try{return (chars||[]).filter(c=>c?._dbId&&c.ownerId!=='SLP').sort((a,b)=>String(a.identity?.namn||'').localeCompare(String(b.identity?.namn||''),'sv'))}catch(_){return []}}
async function refreshActiveGameSession(){
 if(!centralCampaignId){activeGameSession=null;window.aleaCurrentGameSessionId=null;return null}
 const rows=await dbJson('game_sessions?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&status=in.(active,paused)&select=id,campaign_id,title,session_date,status,started_at,ended_at,started_by,ended_by&order=started_at.desc&limit=1');
 activeGameSession=rows?.[0]||null;window.aleaCurrentGameSessionId=activeGameSession?.id||null;renderSessionButton();return activeGameSession
}
window.aleaGetActiveGameSessionId=async function(){try{return (await refreshActiveGameSession())?.id||null}catch(error){console.warn('Aktivt speltillfälle kunde inte läsas',error);return null}}
function ensureSessionUi(){
 const clock=document.querySelector('.alea-clock');
 if(!clock)return;
 if(!$id('gameSessionBtn')){
  const btn=document.createElement('button');btn.id='gameSessionBtn';btn.type='button';btn.className='btn game-session-nav';btn.title='Starta eller hantera speltillfället';btn.textContent='🎲 Session';btn.addEventListener('click',openGameSessionPanel);clock.appendChild(btn)
 }
 if(!$id('gameSessionModal')){
  const modal=document.createElement('div');modal.id='gameSessionModal';modal.className='game-session-backdrop hidden';modal.setAttribute('role','presentation');
  modal.innerHTML='<section class="game-session-dialog" role="dialog" aria-modal="true" aria-labelledby="gameSessionTitle"><header><div><span class="game-session-eyebrow">ALEA · KRÖNIKA</span><h2 id="gameSessionTitle">Speltillfälle</h2></div><button type="button" class="game-session-close" aria-label="Stäng">×</button></header><div id="gameSessionBody"></div></section>';
  modal.addEventListener('click',e=>{if(e.target===modal)closeGameSessionPanel()});modal.querySelector('.game-session-close').addEventListener('click',closeGameSessionPanel);document.body.appendChild(modal)
 }
}
function renderSessionButton(){
 const btn=$id('gameSessionBtn');if(!btn)return;
 btn.disabled=!centralCampaignId||!gameSessionCanManage()||sessionUiBusy;
 btn.textContent=activeGameSession?(activeGameSession.status==='paused'?'⏸ Session':'🎲 Session · Pågår'):'🎲 Session';
 btn.title=activeGameSession?'Öppna aktivt speltillfälle':'Starta ett speltillfälle';
}
function renderSessionBody(session,participants=[]){
 const body=$id('gameSessionBody');if(!body)return;
 const manager=gameSessionCanManage(),characters=sessionCharacters();
 if(!manager){body.innerHTML='<p class="game-session-muted">Endast spelledaren kan hantera speltillfällen.</p>';return}
 if(!session){
  body.innerHTML='<p class="game-session-muted">Starta ett speltillfälle för att samla statistik och händelser för kvällen.</p><label class="game-session-field">Namn<input id="gameSessionName" maxlength="120" placeholder="Exempelvis Skelettbyns hemlighet"></label><label class="game-session-field">Datum<input id="gameSessionDate" type="date" value="'+localSessionDate()+'"></label><fieldset class="game-session-roster"><legend>Deltagande rollpersoner</legend>'+(characters.length?characters.map(c=>'<label><input type="checkbox" value="'+sessionEsc(c._dbId)+'" checked><span>'+sessionEsc(c.identity?.namn||c.name||'Namnlös')+'</span></label>').join(''):'<p>Inga sparade spelarrollpersoner hittades.</p>')+'</fieldset><button id="gameSessionStartBtn" class="btn primary game-session-action">Starta session</button>';
  $id('gameSessionStartBtn')?.addEventListener('click',startGameSession);
  return
 }
 const roster=new Set(participants.map(p=>String(p.character_id)));
 const status=session.status==='paused'?'Pausad':'Pågår';
 body.innerHTML='<div class="game-session-status"><strong>'+status+'</strong><span>'+sessionEsc(session.session_date)+'</span></div><p class="game-session-title">'+sessionEsc(session.title||'Speltillfälle')+'</p><p class="game-session-muted">Startad '+sessionEsc(new Date(session.started_at).toLocaleString('sv-SE'))+'</p><fieldset class="game-session-roster"><legend>Deltagande rollpersoner</legend>'+(characters.length?characters.map(c=>'<label><input type="checkbox" value="'+sessionEsc(c._dbId)+'" '+(roster.has(String(c._dbId))?'checked':'')+'><span>'+sessionEsc(c.identity?.namn||c.name||'Namnlös')+'</span></label>').join(''):'<p>Inga sparade spelarrollpersoner hittades.</p>')+'</fieldset><button id="gameSessionSaveRoster" class="btn game-session-action">Spara deltagare</button><div class="game-session-actions">'+(session.status==='paused'?'<button id="gameSessionResumeBtn" class="btn primary">Återuppta</button>':'<button id="gameSessionPauseBtn" class="btn">Pausa</button>')+'<button id="gameSessionEndBtn" class="btn danger">Avsluta session</button></div>';
 $id('gameSessionSaveRoster')?.addEventListener('click',()=>saveSessionRoster(session,participants));
 $id('gameSessionPauseBtn')?.addEventListener('click',()=>setGameSessionStatus(session,'paused'));
 $id('gameSessionResumeBtn')?.addEventListener('click',()=>setGameSessionStatus(session,'active'));
 $id('gameSessionEndBtn')?.addEventListener('click',()=>endGameSession(session))
}
async function openGameSessionPanel(){
 ensureSessionUi();const modal=$id('gameSessionModal');if(!modal)return;
 modal.classList.remove('hidden');document.body.classList.add('game-session-open');
 await loadAndRenderSession()
}
function closeGameSessionPanel(){$id('gameSessionModal')?.classList.add('hidden');document.body.classList.remove('game-session-open')}
async function loadAndRenderSession(){
 ensureSessionUi();sessionUiBusy=true;renderSessionButton();const body=$id('gameSessionBody');if(body)body.innerHTML='<p class="game-session-muted">Laddar speltillfälle…</p>';
 try{const session=await refreshActiveGameSession();let participants=[];if(session)participants=await dbJson('game_session_participants?session_id=eq.'+encodeURIComponent(session.id)+'&select=session_id,character_id,character_name_snapshot,participant_kind,joined_at,left_at&left_at=is.null&order=character_name_snapshot.asc');renderSessionBody(session,participants)}
 catch(error){if(body)body.innerHTML='<p class="game-session-error">Kunde inte läsa speltillfället: '+sessionEsc(error.message)+'</p>'}
 finally{sessionUiBusy=false;renderSessionButton()}
}
async function startGameSession(){
 if(sessionUiBusy||!gameSessionCanManage()||!centralCampaignId)return;
 const title=$id('gameSessionName')?.value.trim()||'Speltillfälle',date=$id('gameSessionDate')?.value||localSessionDate();
 const chosen=[...document.querySelectorAll('#gameSessionBody .game-session-roster input:checked')].map(x=>x.value);
 const people=sessionCharacters().filter(c=>chosen.includes(String(c._dbId)));
 sessionUiBusy=true;renderSessionButton();
 try{
  const rows=await dbJson('game_sessions',{method:'POST',body:JSON.stringify({campaign_id:centralCampaignId,title,session_date:date,status:'active',started_by:activeUser()?.id||null})});
  const session=rows?.[0];if(!session)throw new Error('Databasen returnerade inget speltillfälle.');
  if(people.length)await dbJson('game_session_participants',{method:'POST',body:JSON.stringify(people.map(c=>({campaign_id:centralCampaignId,session_id:session.id,character_id:c._dbId,character_name_snapshot:c.identity?.namn||c.name||'Namnlös',participant_kind:'player'})))});
  showBackupToast('✓ Speltillfället startat');await loadAndRenderSession()
 }catch(error){alert('Kunde inte starta sessionen: '+error.message);sessionUiBusy=false;renderSessionButton();await loadAndRenderSession()}
}
async function saveSessionRoster(session,existing){
 if(sessionUiBusy||!gameSessionCanManage())return;
 const chosen=new Set([...document.querySelectorAll('#gameSessionBody .game-session-roster input:checked')].map(x=>x.value));
 const people=sessionCharacters();const current=new Set(existing.map(p=>String(p.character_id)));
 const additions=people.filter(c=>chosen.has(String(c._dbId))&&!current.has(String(c._dbId)));
 const removals=existing.filter(p=>!chosen.has(String(p.character_id)));
 sessionUiBusy=true;renderSessionButton();
 try{
  if(removals.length)await dbJson('game_session_participants?session_id=eq.'+encodeURIComponent(session.id)+'&character_id=in.('+removals.map(p=>encodeURIComponent(p.character_id)).join(',')+')',{method:'DELETE',headers:{'Prefer':'return=minimal'}});
  if(additions.length)await dbJson('game_session_participants',{method:'POST',body:JSON.stringify(additions.map(c=>({campaign_id:session.campaign_id,session_id:session.id,character_id:c._dbId,character_name_snapshot:c.identity?.namn||c.name||'Namnlös',participant_kind:'player'})))});
  showBackupToast('✓ Deltagare sparade');await loadAndRenderSession()
 }catch(error){alert('Kunde inte spara deltagarna: '+error.message);sessionUiBusy=false;renderSessionButton();await loadAndRenderSession()}
}
async function setGameSessionStatus(session,status){
 if(sessionUiBusy||!gameSessionCanManage())return;
 sessionUiBusy=true;renderSessionButton();
 try{await dbJson('game_sessions?id=eq.'+encodeURIComponent(session.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status,updated_at:new Date().toISOString()})});await loadAndRenderSession()}
 catch(error){alert('Kunde inte ändra sessionen: '+error.message);sessionUiBusy=false;renderSessionButton()}
}
async function endGameSession(session){
 if(!await askConfirm('Avsluta sessionen?','Sessionens statistik och utmärkelser kan sammanställas efter avslut.','Avsluta sessionen'))return;
 if(sessionUiBusy||!gameSessionCanManage())return;
 sessionUiBusy=true;renderSessionButton();
 try{await dbJson('game_sessions?id=eq.'+encodeURIComponent(session.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({status:'closed',ended_at:new Date().toISOString(),ended_by:activeUser()?.id||null,updated_at:new Date().toISOString()})});await refreshActiveGameSession();showBackupToast('✓ Sessionen avslutad');await loadAndRenderSession()}
 catch(error){alert('Kunde inte avsluta sessionen: '+error.message);sessionUiBusy=false;renderSessionButton()}
}
window.openGameSessionPanel=openGameSessionPanel;
window.closeGameSessionPanel=closeGameSessionPanel;
ensureSessionUi();renderSessionButton();
})();