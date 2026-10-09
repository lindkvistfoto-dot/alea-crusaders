import {createJournalRealtime} from './realtime.js?v=0.35.33';
/* Alea Crusaders v0.35.33 – journal + live feed */
const jGet=id=>document.getElementById(id);
const jEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jKind={skill:['🎲','Färdighet'],spell:['✨','Besvärjelse'],dice:['🎲','Tärning'],combat:['⚔','Strid'],day:['📅','Ny dag'],note:['📜','Journal']};
const jOutcome={success:'Lyckat',fail:'Misslyckat',special:'Särskilt',perfect:'Perfekt',fumble:'Fummel'};
const jCampaign=()=>String(centralCampaignId||'');
const jAuth=()=>!!(supabaseSession?.access_token&&activeUser()&&jCampaign());
const jGM=()=>!!(activeUser()?.admin||centralCampaignRole==='gm');
const jState={id:'',rows:[],limit:150,busy:false,queued:false,last:0,visible:false,previous:'home',error:''};
const jTime=v=>{try{return new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch(_){return ''}};
function jRow(r){
 const type=jKind[r.event_type]||['•','Händelse'],out=jOutcome[r.outcome]||r.outcome;
 return '<article class="journal-row"><span class="journal-row-icon">'+type[0]+'</span><div class="journal-row-main"><div class="journal-row-top"><strong>'+jEsc(r.title)+'</strong>'+(out?'<span class="journal-outcome">'+jEsc(out)+'</span>':'')+(!r.player_visible?'<span class="journal-private">Endast SL</span>':'')+'</div><p>'+jEsc(r.message)+'</p><small>'+jEsc(type[1])+(r.actor_name?' · '+jEsc(r.actor_name):'')+'</small></div><time>'+jEsc(jTime(r.created_at))+'</time></article>';
}
let journalSync;
function jRender(){
 jGet('journalFeed')?.classList.toggle('hidden',!jAuth());
 if(!jAuth())return;
 jGet('journalLatest').innerHTML=jState.rows.length?jState.rows.slice(0,8).map(jRow).join(''):'<div class="journal-empty">Inga händelser ännu.</div>';
 const term=jGet('journalSearch').value.toLocaleLowerCase('sv').trim(),kind=jGet('journalType').value;
 const filtered=jState.rows.filter(r=>(!kind||r.event_type===kind)&&(!term||[r.title,r.message,r.actor_name,r.outcome].join(' ').toLocaleLowerCase('sv').includes(term)));
 jGet('journalAll').innerHTML=filtered.length?filtered.map(jRow).join(''):'<div class="journal-empty">'+jEsc(jState.error||'Inga händelser matchar sökningen.')+'</div>';
 jGet('journalMore').classList.toggle('hidden',jState.rows.length<jState.limit);
 jGet('journalNotes').classList.toggle('hidden',!jGM());
 const online=journalSync?.connected();
 jGet('journalFeedStatus').textContent=online?'● Realtid':'↻ Reservsynk';
 jGet('journalConnection').textContent=online?'● Realtid ansluten':'↻ Synkroniserar';
}
async function jRefresh(){
 if(!jAuth())return;
 const id=jCampaign();
 if(id!==jState.id){jState.id=id;jState.rows=[];jState.limit=150;jState.error='';jRender()}
 if(jState.busy){jState.queued=true;return}
 jState.busy=true;
 try{
  const rows=await dbJson('campaign_journal_entries?campaign_id=eq.'+encodeURIComponent(id)+'&select=id,event_type,title,message,actor_name,outcome,player_visible,created_at&order=created_at.desc,id.desc&limit='+jState.limit);
  if(id===jCampaign()&&Array.isArray(rows)){jState.rows=rows;jState.error='';jState.last=Date.now()}
 }catch(e){jState.error='Kunde inte läsa journalen: '+(e?.message||e);console.warn(jState.error)}
 finally{jState.busy=false;if(jCampaign()===id)jRender();if(jState.queued){jState.queued=false;void jRefresh()}}
}
async function jRecord(ev){
 if(!jAuth()||!ev||!['skill','spell','dice','note'].includes(ev.event_type))return;
 const data={campaign_id:jCampaign(),event_type:ev.event_type,title:String(ev.title||'Händelse').slice(0,180),
  message:String(ev.message||'').slice(0,2000),actor_name:String(ev.actor_name||'').slice(0,160),
  outcome:String(ev.outcome||'').slice(0,50),player_visible:ev.player_visible!==false,
  details:ev.details&&typeof ev.details==='object'?ev.details:{}};
 await dbJson('campaign_journal_entries',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(data)});
 void jRefresh();
}
function jOpen(){
 if(!jAuth())return;
 if(!jState.visible)jState.previous=[...document.querySelectorAll('main > section')].find(el=>!el.classList.contains('hidden'))?.id||'home';
 jState.visible=true;
 document.querySelectorAll('main > section').forEach(el=>el.classList.add('hidden'));
 jGet('journalPage').classList.remove('hidden');void jRefresh();
}
function jClose(restore=true){
 if(!jState.visible)return;
 jState.visible=false;jGet('journalPage').classList.add('hidden');
 if(restore)(jGet(jState.previous)||jGet('home')).classList.remove('hidden');
}
async function jNote(){
 const input=jGet('journalNoteText'),status=jGet('journalNoteStatus'),btn=jGet('journalNoteSave'),message=input.value.trim();
 if(!jGM()||!message)return;
 btn.disabled=true;status.textContent='';
 try{await jRecord({event_type:'note',title:'Spelledarens anteckning',message,actor_name:activeUser()?.name||'SL',player_visible:!jGet('journalNotePrivate').checked});
 input.value='';status.textContent='Sparat i journalen.'}
 catch(e){status.textContent='Kunde inte spara: '+(e?.message||e)}
 finally{btn.disabled=false}
}
function jMount(){
 const main=document.querySelector('main'),nav=jGet('diceNavBtn');
 if(!main||!nav)return;
 nav.insertAdjacentHTML('beforebegin','<button id="journalNavBtn" class="btn" type="button" title="Kampanjjournal">📜 Journal</button>');
 main.insertAdjacentHTML('beforeend',
 '<section id="journalPage" class="journal-page hidden"><div class="journal-page-head"><div><h2>📜 Kampanjjournal</h2><p>Alla sparade händelser från kampanjen.</p></div><button id="journalBack" class="btn" type="button">← Tillbaka</button></div>'+
 '<div class="journal-toolbar"><input id="journalSearch" type="search" placeholder="Sök i journalen…" aria-label="Sök i journalen"><select id="journalType" aria-label="Filtrera"><option value="">Alla händelser</option><option value="skill">Färdighet</option><option value="spell">Besvärjelse</option><option value="dice">Tärningsslag</option><option value="combat">Strid</option><option value="day">Dagskifte</option><option value="note">Anteckning</option></select><span id="journalConnection">Ansluter…</span></div>'+
 '<div id="journalNotes" class="journal-notes hidden"><h3>Spelledarens anteckning</h3><textarea id="journalNoteText" rows="3" maxlength="2000" placeholder="Vad hände i berättelsen?"></textarea><div class="journal-note-actions"><label><input id="journalNotePrivate" type="checkbox"> Endast SL</label><button class="btn primary" id="journalNoteSave" type="button">Spara i journalen</button></div><p id="journalNoteStatus" aria-live="polite"></p></div><div id="journalAll" class="journal-rows"></div><button id="journalMore" class="btn hidden" type="button">Visa äldre händelser</button></section>'+
 '<aside id="journalFeed" class="journal-feed hidden"><div class="journal-feed-head"><div><h3>Senaste händelser</h3><span id="journalFeedStatus">Synkar…</span></div><button id="journalFeedOpen" class="btn" type="button">Visa journalen →</button></div><div id="journalLatest" class="journal-feed-rows" aria-live="polite"></div></aside>');
 journalSync=createJournalRealtime({getCampaign:jCampaign,getToken:()=>supabaseSession?.access_token||'',isAuthenticated:jAuth,
   supabaseUrl:SUPABASE_URL,publishableKey:SUPABASE_KEY,onRefresh:jRefresh,onStatus:jRender});
 jGet('journalNavBtn').addEventListener('click',jOpen);
 jGet('journalFeedOpen').addEventListener('click',jOpen);
 jGet('journalBack').addEventListener('click',()=>jClose(true));
 jGet('journalSearch').addEventListener('input',jRender);
 jGet('journalType').addEventListener('change',jRender);
 jGet('journalNoteSave').addEventListener('click',jNote);
 jGet('journalMore').addEventListener('click',()=>{jState.limit+=150;void jRefresh()});
 document.querySelector('header').addEventListener('click',e=>{if(jState.visible&&e.target.closest('button')&&!e.target.closest('#journalNavBtn'))jClose(false)},true);
 journalSync.start();
 setInterval(()=>{if(!jAuth()){jState.id='';jState.rows=[];return}
  if(jCampaign()!==jState.id||Date.now()-jState.last>(journalSync.connected()?60000:15000))void jRefresh()
 },5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&jAuth()){journalSync.tick();void jRefresh()}});
}
window.aleaJournalRecord=ev=>jRecord(ev).catch(e=>console.warn('Journalpost misslyckades',e));
window.aleaJournalRefresh=jRefresh;
window.aleaJournalOpen=jOpen;
window.aleaJournalClose=jClose;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',jMount,{once:true});
else jMount();
