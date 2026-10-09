/* Alea Crusaders v0.35.23 – GM soundboard + player audio synchronization. */
import {createAudioRealtime} from './realtime.js?v=0.35.23';
const AUDIO_URL='https://wbmosmkirsitkonejzpg.supabase.co';
const AUDIO_KEY='sb_publishable_Tai3eAutU7lDDc9GAy1_rA_elVB5x7o';
const AMBIENCES=[
 ['ambience.rain','🌧 Regn'],['ambience.wind','🍃 Vind'],
 ['ambience.cave','🪨 Grotta'],['ambience.tavern','🍺 Värdshus']
];
const EFFECTS=[
 ['ambience.thunder','⚡ Åska'],['ambience.door','🚪 Dörr'],
 ['ambience.ghost','👻 Andar'],['ambience.battle','⚔ Strid'],
 ['magic.fire','🔥 Eldmagi'],['magic.heal','✨ Helning']
];
const store={campaign:'',revision:-1,ambience:null,received:0,seen:new Set(),since:'',
 ready:false,busy:false,lastPoll:0,connected:false,lastStatus:'Startar…'};
const user=()=>{
 try{return typeof supabaseSession!=='undefined'?supabaseSession?.user?.id:''}catch(_){return ''}
};
const token=()=>{
 try{return typeof supabaseSession!=='undefined'?supabaseSession?.access_token:''}catch(_){return ''}
};
const campaign=()=>{
 try{return typeof centralCampaignId!=='undefined'?String(centralCampaignId||''):''}catch(_){return ''}
};
const isGM=()=>{
 try{return Boolean(activeUser()?.admin||centralCampaignRole==='gm')}catch(_){return false}
};
const authenticated=()=>Boolean(user()&&token()&&campaign());
const audio=()=>window.aleaAudio;
const notice=(message,isError=false)=>{
 const el=document.getElementById('aleaSoundboardStatus');
 if(el){el.textContent=message;el.classList.toggle('error',isError)}
};
function snapshot(){
 const el=document.getElementById('aleaSoundboard');
 if(!el)return;
 el.hidden=!authenticated()||!isGM();
 if(el.hidden){
  document.getElementById('aleaSoundboardPanel').hidden=true;
  return
 }
 el.querySelector('[data-board-toggle]').setAttribute('aria-expanded',
  String(!document.getElementById('aleaSoundboardPanel').hidden));
 for(const button of el.querySelectorAll('[data-ambience]')){
  const selected=button.dataset.ambience===String(store.ambience||'');
  button.classList.toggle('active',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.disabled=store.busy
 }
 for(const b of el.querySelectorAll('[data-cue]'))b.disabled=store.busy;
 const label=AMBIENCES.find(x=>x[0]===store.ambience)?.[1]||'Ingen';
 const active=el.querySelector('[data-active-ambience]');
 if(active)active.textContent=label;
 const sync=el.querySelector('[data-board-sync]');
 if(sync)sync.textContent=store.connected?'Realtid ansluten':'Reservsynk aktiv'
}
function markSeen(id){
 if(!id||store.seen.has(id))return false;
 store.seen.add(id);
 if(store.seen.size>250)store.seen.delete(store.seen.values().next().value);
 return true
}
function acceptEvent(row){
 if(!row||row.campaign_id!==store.campaign||typeof row.id!=='string'||
    typeof row.cue_key!=='string'||!markSeen(row.id))return false;
 if(row.created_at){
  const timestamp=Date.parse(row.created_at);
  // Never replay old one-shot effects after a laptop wakes or Realtime reconnects.
  if(!Number.isFinite(timestamp)||timestamp<Date.parse(store.since)-2000||
     Math.abs(Date.now()-timestamp)>15000)return false
 }
 audio()?.play(row.cue_key);
 store.received++;
 return true
}
function acceptState(row){
 if(!row||row.campaign_id!==store.campaign)return false;
 const revision=Number(row.revision);
 if(!Number.isSafeInteger(revision)||revision<store.revision)return false;
 if(store.revision===revision&&store.ambience===row.ambience_cue_key)return false;
 store.revision=revision;
 store.ambience=row.ambience_cue_key||null;
 audio()?.setAmbience(store.ambience);
 snapshot();
 return true
}
async function getState(){
 if(!authenticated())return;
 const id=store.campaign;
 const rows=await dbJson('campaign_audio_state?campaign_id=eq.'+encodeURIComponent(id)+
  '&select=campaign_id,ambience_cue_key,revision,updated_at&limit=1');
 if(id!==store.campaign)return;
 if(Array.isArray(rows)&&rows.length)acceptState(rows[0]);
 else if(store.revision===-1){store.ambience=null;audio()?.setAmbience(null);snapshot()}
}
async function recentEvents(){
 if(!authenticated()||!store.campaign)return;
 const id=store.campaign;
 const url='campaign_audio_events?campaign_id=eq.'+encodeURIComponent(id)+
  '&created_at=gte.'+encodeURIComponent(store.since)+'&select=id,campaign_id,cue_key,created_at'+
  '&order=created_at.asc&limit=75';
 const rows=await dbJson(url);
 if(id!==store.campaign||!Array.isArray(rows))return;
 rows.forEach(acceptEvent);
 if(rows.length){const latest=Date.parse(rows[rows.length-1].created_at);if(Number.isFinite(latest))store.since=new Date(Math.max(Date.parse(store.since),latest-1000)).toISOString()}
}
const sync=createAudioRealtime({
 getCampaign:campaign,getToken:token,isAuthenticated:authenticated,
 supabaseUrl:AUDIO_URL,publishableKey:AUDIO_KEY,
 onEvent:acceptEvent,onState:acceptState,
 onConnected:()=>{store.connected=true;snapshot();getState().catch(()=>{});recentEvents().catch(()=>{})},
 onStatus:(label,connected)=>{store.connected=connected;store.lastStatus=label;snapshot()}
});
async function writeAmbience(key){
 if(!isGM()||!authenticated())return;
 if(key!==null&&!AMBIENCES.some(x=>x[0]===key))return;
 store.busy=true;snapshot();
 try{
  const id=store.campaign;
  const current=await dbJson('campaign_audio_state?campaign_id=eq.'+encodeURIComponent(id)+
   '&select=campaign_id,revision&limit=1');
  if(id!==store.campaign)throw Error('Kampanjen ändrades under tiden.');
  const old=Array.isArray(current)&&current[0];
  const body={ambience_cue_key:key,updated_at:new Date().toISOString(),revision:(Number(old?.revision)||0)+1};
  if(old)await dbJson('campaign_audio_state?campaign_id=eq.'+encodeURIComponent(id),{
   method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)
  });
  else await dbJson('campaign_audio_state',{
   method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({campaign_id:id,...body})
  });
  await getState();
  notice(key?'Miljöljud synkroniserat med spelarna.':'Miljöljudet stoppat för spelarna.')
 }catch(error){notice('Kunde inte ändra ljudmiljö: '+error.message,true)}
 finally{store.busy=false;snapshot()}
}
async function broadcastCue(cueKey){
 if(!authenticated()||!isGM()||!audio()?.cues().some(c=>c.cue_key===cueKey))return false;
 const id=crypto.randomUUID(),scope=store.campaign;
 if(!scope)return false;
 markSeen(id);
 try{
  await dbJson('campaign_audio_events',{method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({id,campaign_id:scope,cue_key:cueKey,created_by:user()})});
  return true
 }catch(error){console.warn('Kunde inte dela automatiskt stridsljud',error);return false}
}
async function sendCue(cueKey){
 if(!isGM()||!authenticated()||!EFFECTS.some(x=>x[0]===cueKey))return;
 store.busy=true;snapshot();
 const id=crypto.randomUUID(),scope=store.campaign;
 markSeen(id);
 try{
  await dbJson('campaign_audio_events',{method:'POST',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({id,campaign_id:scope,cue_key:cueKey,created_by:user()})});
  if(scope===store.campaign){audio()?.play(cueKey);notice('Ljudeffekt skickad till spelarna.')}
 }catch(error){notice('Kunde inte dela ljudeffekten: '+error.message,true)}
 finally{store.busy=false;snapshot()}
}
function mount(){
 if(document.getElementById('aleaSoundboard'))return;
 const root=document.createElement('div');
 root.id='aleaSoundboard';
 root.className='alea-soundboard';
 root.hidden=true;
 root.innerHTML='<button class="alea-soundboard-launch" type="button" data-board-toggle aria-controls="aleaSoundboardPanel" aria-expanded="false">♫ SL-ljud</button>'+
  '<div class="alea-soundboard-panel" id="aleaSoundboardPanel" hidden>'+
  '<div class="alea-soundboard-heading"><b>SL – Ljudbord</b><span data-board-sync>Reservsynk aktiv</span></div>'+
  '<h3>Miljöljud · ett åt gången</h3><div class="alea-soundboard-grid">'+
  AMBIENCES.map(([key,label])=>'<button type="button" data-ambience="'+key+'" aria-pressed="false">'+label+'</button>').join('')+
  '</div><div class="alea-soundboard-active">Spelas: <strong data-active-ambience>Ingen</strong>'+
  '<button type="button" data-ambience="">■ Stoppa</button></div>'+
  '<h3>Ljudeffekter · spelas en gång</h3><div class="alea-soundboard-grid">'+
  EFFECTS.map(([key,label])=>'<button type="button" data-cue="'+key+'">'+label+'</button>').join('')+
  '</div><p id="aleaSoundboardStatus" role="status">Redo · välj ljud.</p>'+
  '<p class="alea-soundboard-help">Ljud spelas hos varje deltagare. Ljudfiler kan laddas upp under Admin → Ljudregister.</p></div>';
 document.body.appendChild(root);
 root.querySelector('[data-board-toggle]').addEventListener('click',event=>{
  const panel=root.querySelector('#aleaSoundboardPanel');
  panel.hidden=!panel.hidden;
  event.currentTarget.setAttribute('aria-expanded',String(!panel.hidden))
 });
 root.addEventListener('click',event=>{
  const env=event.target.closest('[data-ambience]');
  if(env){writeAmbience(env.dataset.ambience||null);return}
  const cue=event.target.closest('[data-cue]');
  if(cue)sendCue(cue.dataset.cue)
 });
 snapshot()
}
let switching=false;
async function checkSession(){
 if(switching)return;
 const scope=authenticated()?campaign():'';
 if(scope!==store.campaign){
  switching=true;
  store.campaign=scope;store.revision=-1;store.ambience=null;store.seen.clear();
  store.since=new Date(Date.now()-2000).toISOString();store.lastPoll=0;store.connected=false;
  audio()?.setAmbience(null);snapshot();
  try{if(scope){await audio()?.load();await getState()}}
  catch(error){console.warn('Kunde inte läsa ljuddata',error)}
  finally{switching=false}
 }
 sync.tick();
 if(!scope)return;
 const now=Date.now(),interval=sync.connected()?25000:4000;
 if(now-store.lastPoll>=interval){
  store.lastPoll=now;
  const tasks=[getState()];
  if(!sync.connected())tasks.push(recentEvents());
  await Promise.allSettled(tasks)
 }
 snapshot()
}
function init(){
 mount();sync.start();checkSession().catch(()=>{});
 window.setInterval(()=>checkSession().catch(()=>{}),3000)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.aleaSoundboard={writeAmbience,sendCue,broadcastCue,acceptEvent,acceptState,status:()=>sync.status(),snapshot:()=>({...store,seen:undefined})};
