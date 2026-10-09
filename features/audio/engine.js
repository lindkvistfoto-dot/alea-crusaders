/* Alea Crusaders v0.35.27 — audio bus, settings and admin registry.
   Web Audio sounds are temporary previews; uploaded sound effects take precedence. */
(function(){
'use strict';
const STORE='alea_audio_prefs_v1';
const BUCKET='alea-sound-effects';
const defaults=[
 ['dice.roll','Tärningar rullar','dice',.42],
 ['dice.land','Tärningar landar','dice',.42],
 ['melee.swing','Vapnet svingas','melee',.68],
 ['melee.hit','Vapenträff','melee',.8],
 ['melee.parry','Parering','melee',.84],
 ['melee.miss','Missad attack','melee',.55],
 ['melee.fumble','Fummel','melee',.58],
 ['magic.cast','Besvärjelse','magic',.65],
 ['magic.success','Magi lyckas','magic',.7],
 ['magic.fail','Magi misslyckas','magic',.58],
 ['magic.fire','Eldmagi','magic',.82],
 ['magic.heal','Helning','magic',.67],
 ['magic.antimagic','Antimagi','magic',.72],
 ['ambience.rain','Regn','ambience',.46],
 ['ambience.wind','Vind','ambience',.4],
 ['ambience.cave','Grotta','ambience',.40],
 ['ambience.tavern','Värdshus','ambience',.43],
 ['ambience.thunder','Åska','ambience',.85],
 ['ambience.door','Dörr','ambience',.62],
 ['ambience.ghost','Andar','ambience',.62],
 ['ambience.battle','Stridsmuller','ambience',.68],
 ['ambience.forest','Skog och nattfåglar','ambience',.42],
 ['ambience.water','Rinnande vatten','ambience',.48],
 ['ambience.ruins','Övergivna ruiner','ambience',.46],
 ['ambience.crypt','Krypta och viskningar','ambience',.52],
 ['ambience.fire','Brasa','ambience',.40],
 ['ambience.night','Nattens vind','ambience',.42]
];
const categoryLabels={dice:'Tärningar',melee:'Närstrid',ranged:'Avståndsvapen',magic:'Magi',ambience:'Miljö',creature:'Varelser',event:'Händelser'};
const legacyCueKeys=new Set(defaults.map(x=>x[0]));
const priorityNames={1:'P1 – Måste ha',2:'P2 – Viktigt',3:'P3 – Senare'};
const sourceNames={needed:'Behöver ljudfil',shortlisted:'Kandidat hittad',verified:'Licens granskad'};
function safeSourceUrl(value){
 try{const url=new URL(String(value||''));return url.protocol==='https:'&&url.username===''&&url.password===''&&url.href.length<=1200?url.href:''}
 catch(_){return ''}
}
const cues=new Map(defaults.map(([cue_key,title,category,volume])=>[cue_key,{cue_key,title,category,volume,asset_path:null,enabled:true}]));
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
function initialPrefs(){
 const base={enabled:true,master:.75,dice:.75,melee:.9,ranged:.85,magic:.8,ambience:.55,creature:.8,event:.8};
 try{const stored=JSON.parse(localStorage.getItem(STORE)||'{}');
  for(const k of Object.keys(base))if(k in stored)base[k]=k==='enabled'?stored[k]!==false:clamp(stored[k]);
 }catch(_error){}
 return base
}
let prefs=initialPrefs(),context=null,output=null,loading=null,loaded=false;
const currentlyPlaying=new Set();
let activeAmbience=null,ambientVoice=null;
const fadingVoices=new Set();
const FADE_SECONDS=1.7;
function ambientGain(cueKey=activeAmbience){
 const cue=cues.get(cueKey);
 return cue?volumeFor(cue)*.7:0
}
function retireVoice(voice){
 if(!voice||voice.retired)return;
 voice.retired=true;
 if(voice.timer)clearTimeout(voice.timer);
 if(ambientVoice===voice)ambientVoice=null;
 fadingVoices.delete(voice);
 try{voice.audio?.pause();if(voice.audio)voice.audio.currentTime=0}catch(_error){}
 try{voice.source?.stop?.()}catch(_error){}
 try{voice.source?.disconnect?.()}catch(_error){}
 try{voice.filter?.disconnect?.()}catch(_error){}
 try{voice.gain.disconnect()}catch(_error){}
}
function fadeVoice(voice,target,duration=FADE_SECONDS){
 if(!voice||voice.retired)return;
 const now=context?.currentTime||0,gain=voice.gain.gain;
 gain.cancelScheduledValues(now);
 gain.setValueAtTime(gain.value,now);
 gain.linearRampToValueAtTime(Math.max(0,target),now+Math.max(0.05,duration));
 if(target===0){
  fadingVoices.add(voice);
  if(voice.timer)clearTimeout(voice.timer);
  voice.timer=setTimeout(()=>retireVoice(voice),(duration+.12)*1000)
 }
}
function createAmbientVoice(cueKey){
 if(!context||!output)return null;
 const cue=cues.get(cueKey);if(!cue?.enabled)return null;
 const gain=context.createGain();gain.gain.value=0;gain.connect(output);
 const url=safeAssetUrl(cue.asset_path);
 if(url){
  const player=new Audio(url);player.loop=true;player.volume=1;
  const source=context.createMediaElementSource(player);
  source.connect(gain);
  const voice={key:cueKey,audio:player,source,gain,retired:false,timer:null};
  player.play().catch(error=>console.warn('Miljöljudet väntar på användarklick',error));
  return voice
 }
 const seconds=4,frames=Math.floor(seconds*context.sampleRate),buffer=context.createBuffer(1,frames,context.sampleRate);
 const data=buffer.getChannelData(0);
 for(let i=0;i<frames;i++){
  const t=i/context.sampleRate,n=Math.random()*2-1;
  if(cueKey==='ambience.cave'||cueKey==='ambience.crypt')
   data[i]=n*.09+Math.sin(t*Math.PI*2*(cueKey==='ambience.crypt'?55:62))*.12;
  else if(cueKey==='ambience.tavern')data[i]=n*.26+Math.sin(t*Math.PI*2*170)*.06;
  else if(cueKey==='ambience.water')data[i]=n*.70+Math.sin(t*Math.PI*2*420)*.08;
  else if(cueKey==='ambience.fire')data[i]=n*(Math.random()>.985?1:.16);
  else if(cueKey==='ambience.forest')data[i]=n*.20+Math.sin(t*Math.PI*2*(400+Math.sin(t*5)*150))*.055;
  else if(cueKey==='ambience.ruins')data[i]=n*.20+Math.sin(t*Math.PI*2*100)*.035;
  else data[i]=n*.65
 }
 const source=context.createBufferSource(),filter=context.createBiquadFilter();
 source.buffer=buffer;source.loop=true;filter.type='lowpass';
 filter.frequency.value=({
  'ambience.rain':2400,'ambience.wind':680,'ambience.night':420,
  'ambience.cave':290,'ambience.crypt':300,'ambience.tavern':950,
  'ambience.water':1500,'ambience.fire':900,'ambience.forest':1900,'ambience.ruins':480
 })[cueKey]||1000;
 source.connect(filter);filter.connect(gain);source.start();
 return{key:cueKey,source,filter,gain,retired:false,timer:null}
}
function stopAmbience({preserve=false,immediate=false}={}){
 const voice=ambientVoice;ambientVoice=null;
 if(voice){
  if(immediate)retireVoice(voice);
  else fadeVoice(voice,0)
 }
 if(immediate)for(const old of [...fadingVoices])retireVoice(old);
 if(!preserve)activeAmbience=null
}
function setAmbience(cueKey){
 const cue=cueKey?cues.get(cueKey):null;
 if(cueKey&&(!cue||cue.category!=='ambience'))return false;
 if(cueKey===activeAmbience&&ambientVoice){
  fadeVoice(ambientVoice,ambientGain());
  return true
 }
 stopAmbience();
 activeAmbience=cueKey||null;
 if(!cueKey||!prefs.enabled||!cue.enabled)return true;
 // A synchronized ambience must never create a Web Audio engine at login/home.
 // The next explicit game gesture (or an intentional soundboard action) unlocks it.
 if(!context)return true;
 const voice=createAmbientVoice(cueKey);
 if(!voice)return false;
 ambientVoice=voice;
 fadeVoice(voice,ambientGain());
 return true
}
function previewAmbience(cueKey){
 if(!cues.has(cueKey)||cues.get(cueKey).category!=='ambience')return false;
 unlock();
 if(!prefs.enabled)return false;
 const voice=createAmbientVoice(cueKey);if(!voice)return false;
 fadeVoice(voice,Math.min(.55,ambientGain(cueKey)),.35);
 setTimeout(()=>fadeVoice(voice,0,.7),4000);
 return true
}

function userToken(){
 try{return typeof supabaseSession!=='undefined'?supabaseSession?.access_token:null}
 catch(_error){return null}
}
function unlock(){
 if(!prefs.enabled)return;
 const Constructor=window.AudioContext||window.webkitAudioContext;
 if(!Constructor)return;
 try{
  if(!context){
   context=new Constructor();
   output=context.createGain();output.gain.value=1;output.connect(context.destination)
  }
  if(context.state==='suspended')context.resume().catch(()=>{});
 }catch(error){console.warn('Alea audio unavailable',error)}
}
function setPrefs(changes){
 prefs={...prefs,...changes};
 for(const k of ['master','dice','melee','ranged','magic','ambience','creature','event'])prefs[k]=clamp(prefs[k]);
 prefs.enabled=prefs.enabled!==false;
 try{localStorage.setItem(STORE,JSON.stringify(prefs))}catch(_error){}
 if(!prefs.enabled)stopAll();
 else if(activeAmbience)setAmbience(activeAmbience);
 updateDock();
 return {...prefs}
}
function stopAll(){
 stopAmbience({preserve:true,immediate:true});
 for(const item of currentlyPlaying){try{item.pause();item.currentTime=0}catch(_error){}}
 currentlyPlaying.clear()
}
function volumeFor(cue){
 return prefs.enabled&&cue.enabled?clamp(cue.volume)*prefs.master*clamp(prefs[cue.category]??1):0
}
function safeAssetUrl(path){
 if(typeof path!=='string'||!/^[-a-zA-Z0-9_./]+\.(mp3|ogg|wav|webm|m4a)$/i.test(path)||path.includes('..'))return '';
 return 'https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/public/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/')
}
function oscillator(at,freq,end,duration,level,kind='triangle'){
 const node=context.createOscillator(),amp=context.createGain();
 node.type=kind;
 node.frequency.setValueAtTime(Math.max(40,freq),at);
 node.frequency.exponentialRampToValueAtTime(Math.max(40,end),at+duration);
 amp.gain.setValueAtTime(.0001,at);
 amp.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+.012);
 amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
 node.connect(amp);amp.connect(output);
 node.onended=()=>{node.disconnect();amp.disconnect()};
 node.start(at);node.stop(at+duration+.015)
}
function rustle(at,duration,level,hz){
 const sampleCount=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,sampleCount,context.sampleRate);
 const channel=buffer.getChannelData(0);
 for(let i=0;i<sampleCount;i++)channel[i]=(Math.random()*2-1)*(.55+.45*Math.sin(Math.PI*i/sampleCount));
 const source=context.createBufferSource(),filter=context.createBiquadFilter(),amp=context.createGain();
 source.buffer=buffer;filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=.75;
 amp.gain.setValueAtTime(.0001,at);
 amp.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+.014);
 amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
 source.connect(filter);filter.connect(amp);amp.connect(output);
 source.onended=()=>{source.disconnect();filter.disconnect();amp.disconnect()};
 source.start(at);source.stop(at+duration)
}
function synthetic(cueKey,gain){
 if(!context||context.state!=='running')return false;
 const now=context.currentTime+.008,s=Math.min(.32,gain*.23);
 switch(cueKey){
  case 'dice.roll':
   for(let i=0;i<4;i++){rustle(now+i*.066,.065,s*.46,1100+i*300);oscillator(now+i*.07,470+i*80,180,.055,s*.3,'sine')}break;
  case 'dice.land':
   oscillator(now,450,145,.13,s,'triangle');oscillator(now+.07,260,120,.12,s*.55,'sine');break;
  case 'melee.swing':case 'melee.miss':
   rustle(now,.24,s*(cueKey==='melee.miss'?.7:1.1),1350);oscillator(now,620,100,.26,s*.45);break;
  case 'melee.hit':
   rustle(now,.14,s*.9,1900);oscillator(now,320,95,.36,s,'sawtooth');oscillator(now,720,245,.42,s*.45,'sine');break;
  case 'melee.parry':
   oscillator(now,970,365,.44,s,'triangle');oscillator(now+.025,1520,620,.32,s*.65,'sine');rustle(now,.085,s*.5,3800);break;
  case 'melee.fumble':
   oscillator(now,230,65,.42,s,'sawtooth');rustle(now+.06,.16,s*.45,520);break;
  case 'magic.cast':
   oscillator(now,170,930,.53,s*.8,'sine');oscillator(now+.09,450,1250,.5,s*.55);break;
  case 'magic.success':
   oscillator(now,480,840,.46,s*.75,'sine');oscillator(now+.12,720,1100,.36,s*.65);break;
  case 'magic.fail':
   oscillator(now,560,120,.55,s*.8);break;
  case 'magic.fire':
   rustle(now,.53,s*.88,1600);oscillator(now,140,1300,.62,s,'sawtooth');break;
  case 'magic.heal':
   oscillator(now,320,640,.7,s*.8,'sine');oscillator(now+.15,480,960,.65,s*.62);break;
  case 'magic.antimagic':
   oscillator(now,1180,135,.55,s,'triangle');oscillator(now+.05,750,270,.45,s*.45);break;
  case 'ambience.thunder':
   rustle(now,.7,s*1.5,170);oscillator(now,120,48,.8,s,'sawtooth');break;
  case 'ambience.door':
   oscillator(now,320,75,.54,s,'sawtooth');rustle(now+.14,.16,s*.5,800);break;
  case 'ambience.ghost':
   oscillator(now,210,650,.75,s*.72,'sine');oscillator(now+.12,300,780,.65,s*.55);break;
  case 'ambience.battle':
   rustle(now,.42,s*.88,470);oscillator(now,85,160,.48,s,'triangle');break;
  default:return false
 }
 return true
}
function spellResult(name,outcome){
 const normalized=String(name||'').toUpperCase();
 let cue='magic.success';
 if(!['success','special','perfect'].includes(outcome))cue='magic.fail';
 else if(/ANTIMAGI/.test(normalized))cue='magic.antimagic';
 else if(/^(ELD|ELDKLOT)/.test(normalized))cue='magic.fire';
 else if(/HELA|LÄK|LÄKEDOM/.test(normalized))cue='magic.heal';
 const played=play(cue);
 window.aleaSoundboard?.broadcastCue?.(cue);
 return played
}
function play(cueKey,{volume=1}={}){
 const cue=cues.get(cueKey);
 if(cue?.category==='ambience'&&cueKey.startsWith('ambience.')&&
    !['ambience.thunder','ambience.door','ambience.ghost','ambience.battle'].includes(cueKey))return previewAmbience(cueKey);
 if(!cue)return false;
 const gain=volumeFor(cue)*clamp(volume);
 if(gain<=0)return false;
 unlock();
 const url=safeAssetUrl(cue.asset_path);
 if(url){
  const sound=new Audio(url);
  sound.volume=clamp(gain);
  currentlyPlaying.add(sound);
  sound.onended=()=>currentlyPlaying.delete(sound);
  sound.onerror=()=>currentlyPlaying.delete(sound);
  sound.play().catch(()=>currentlyPlaying.delete(sound));
  return true
 }
 return synthetic(cueKey,gain)
}
async function load(force=false){
 if(!userToken()||typeof dbJson!=='function')return Array.from(cues.values());
 if(loaded&&!force)return Array.from(cues.values());
 if(loading&&!force)return loading;
 loading=(async()=>{
  const rows=await dbJson('rule_sound_cues?select=cue_key,title,category,asset_path,volume,enabled,priority,sound_kind,usage_hint,search_terms,target_variants,integration_status,source_status,source_url,creator_credit,license_type,license_notes&order=priority.asc,category.asc,cue_key.asc');
  if(Array.isArray(rows)){cues.clear();rows.forEach(row=>cues.set(row.cue_key,row));loaded=true}
  return Array.from(cues.values())
 })().finally(()=>{loading=null});
 return loading
}
function updateDock(){
 const root=document.getElementById('aleaAudioDock');
 if(!root)return;
 const mute=root.querySelector('[data-audio-mute]');
 if(mute){mute.textContent=prefs.enabled?'🔊':'🔇';mute.setAttribute('aria-label',prefs.enabled?'Stäng av ljud':'Sätt på ljud');mute.setAttribute('aria-pressed',String(!prefs.enabled))}
 for(const slider of root.querySelectorAll('[data-audio-volume]')){
  const name=slider.dataset.audioVolume;
  slider.value=Math.round((prefs[name]??0)*100);
  const display=root.querySelector('[data-audio-value="'+name+'"]');
  if(display)display.textContent=slider.value+' %'
 }
}
function mountDock(){
 if(document.getElementById('aleaAudioDock'))return;
 const root=document.createElement('div');
 root.id='aleaAudioDock';
 root.className='alea-audio-dock';
 root.innerHTML='<button type="button" class="alea-audio-mute" data-audio-mute aria-label="Stäng av ljud">🔊</button>'+
  '<button type="button" class="alea-audio-settings" data-audio-settings aria-expanded="false" aria-controls="aleaAudioPanel">Ljud ⚙</button>'+
  '<div id="aleaAudioPanel" class="alea-audio-panel" hidden><b>Ljudinställningar</b><p>Tärningar, strid och magi spelas på din egen enhet.</p>'+
  ['master','dice','melee','ranged','magic','ambience','creature','event'].map(k=>'<label><span>'+({master:'Huvudvolym',...categoryLabels}[k]||categoryLabels[k])+'</span><input type="range" min="0" max="100" step="5" data-audio-volume="'+k+'"><output data-audio-value="'+k+'"></output></label>').join('')+
  '<small>Ljud aktiveras efter första klicket i spelet.</small></div>';
 document.body.appendChild(root);
 root.querySelector('[data-audio-mute]').addEventListener('click',()=>{
  setPrefs({enabled:!prefs.enabled});
  if(prefs.enabled){unlock();if(activeAmbience&&!ambientVoice)setAmbience(activeAmbience)}
 });
 root.querySelector('[data-audio-settings]').addEventListener('click',event=>{
  const panel=root.querySelector('#aleaAudioPanel'),show=panel.hidden;
  panel.hidden=!show;
  event.currentTarget.setAttribute('aria-expanded',String(show));
 });
 root.querySelectorAll('[data-audio-volume]').forEach(node=>node.addEventListener('input',()=>setPrefs({[node.dataset.audioVolume]:Number(node.value)/100})));
 updateDock()
}
async function saveCue(cueKey,patch){
 if(!/^[a-z][a-z0-9_.-]{1,79}$/.test(cueKey))throw new Error('Ogiltig ljudhändelse.');
 if(!userToken())throw new Error('Logga in för att redigera ljud.');
 const current=cues.get(cueKey);
 if(!current)throw new Error('Ljudhändelsen saknas.');
 const allowed={};
 for(const key of ['title','category','volume','enabled','asset_path','priority','sound_kind','usage_hint','search_terms','target_variants','source_status','source_url','creator_credit','license_type','license_notes'])if(Object.prototype.hasOwnProperty.call(patch,key))allowed[key]=patch[key];
 if(allowed.source_url&&!safeSourceUrl(allowed.source_url))throw new Error('Källan måste ha en giltig HTTPS-adress.');
 if(allowed.source_status==='verified'&&!(safeSourceUrl(allowed.source_url??current.source_url)&&String(allowed.license_type??current.license_type||'').trim()))
  throw new Error('Ange källadress och licens före godkänd licensgranskning.');
 await dbJson('rule_sound_cues?cue_key=eq.'+encodeURIComponent(cueKey),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(allowed)});
 await load(true)
}
async function uploadCue(cueKey,file){
 if(!file)throw new Error('Välj en ljudfil.');
 const extensions={'audio/mpeg':'mp3','audio/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/webm':'webm','audio/mp4':'m4a'};
 const ext=extensions[file.type];
 if(!ext)throw new Error('Endast MP3, OGG, WAV, WebM och M4A stöds.');
 if(file.size>8*1024*1024)throw new Error('Maxstorlek för ljud är 8 MB.');
 const token=userToken();if(!token)throw new Error('Du måste vara inloggad.');
 const path='effects/'+cueKey.replace(/[^a-z0-9-]/g,'-')+'-'+(globalThis.crypto?.randomUUID?.()||String(Date.now()))+'.'+ext;
 const upload=await fetch('https://wbmosmkirsitkonejzpg.supabase.co/storage/v1/object/'+BUCKET+'/'+path,{
  method:'POST',headers:{apikey:'sb_publishable_Tai3eAutU7lDDc9GAy1_rA_elVB5x7o',Authorization:'Bearer '+token,'Content-Type':file.type,'cache-control':'3600'},body:file
 });
 if(!upload.ok){const error=await upload.text();throw new Error('Uppladdningen misslyckades: '+error.slice(0,250))}
 await saveCue(cueKey,{asset_path:path})
}
function formStatus(message,bad=false){
 const el=document.getElementById('adminSoundStatus');
 if(el){el.textContent=message;el.classList.toggle('error',bad)}
}
function adminRows(){
 return [...cues.values()].sort((a,b)=>(Number(a.priority)||2)-(Number(b.priority)||2)||a.category.localeCompare(b.category)||a.cue_key.localeCompare(b.cue_key));
}
function renderRows(){
 const target=document.getElementById('adminSoundTable');if(!target)return;
 const search=String(document.getElementById('adminSoundSearch')?.value||'').trim().toLocaleLowerCase('sv');
 const category=document.getElementById('adminSoundCategory')?.value||'all';
 const fileFilter=document.getElementById('adminSoundFileFilter')?.value||'all';
 const priority=document.getElementById('adminSoundPriorityFilter')?.value||'all';
 const integration=document.getElementById('adminSoundIntegrationFilter')?.value||'all';
 const source=document.getElementById('adminSoundSourceFilter')?.value||'all';
 const all=adminRows(),uploaded=all.filter(row=>!!row.asset_path).length,shortlisted=all.filter(row=>!!row.source_url).length;
 const summary=document.getElementById('adminSoundInventoryStats');
 if(summary)summary.textContent=all.length+' ljud · '+all.filter(row=>row.integration_status==='connected').length+
  ' inkopplade · '+all.filter(row=>row.integration_status==='planned').length+
  ' planerade · '+shortlisted+' källförslag · '+uploaded+' med inspelning · '+(all.length-uploaded)+' saknar inspelning.';
 const rows=all.filter(row=>(!search||(row.title+' '+row.cue_key+' '+(row.usage_hint||'')+
  ' '+(row.search_terms||'')).toLocaleLowerCase('sv').includes(search))&&
  (category==='all'||row.category===category)&&
  (fileFilter==='all'||(fileFilter==='uploaded'?!!row.asset_path:!row.asset_path))&&
  (priority==='all'||String(row.priority||2)===priority)&&
  (integration==='all'||row.integration_status===integration)&&
  (source==='all'||row.source_status===source));
 const selection=(field,values,current)=>'<select data-field="'+field+'">'+Object.entries(values).map(([key,label])=>
  '<option value="'+escapeHtml(key)+'"'+(String(key)===String(current)?' selected':'')+'>'+escapeHtml(label)+'</option>').join('')+'</select>';
 target.innerHTML=rows.length?rows.map(row=>{
  const url=safeAssetUrl(row.asset_path),canPreview=!!url||legacyCueKeys.has(row.cue_key);
  const priority=Number(row.priority)||2,kind=row.sound_kind||'oneshot';
  const sourceLink=safeSourceUrl(row.source_url);
  return '<div class="alea-sound-row" data-sound-key="'+escapeHtml(row.cue_key)+'">'+
   '<div class="alea-sound-identity"><b>'+escapeHtml(row.title)+'</b><code>'+escapeHtml(row.cue_key)+'</code><small>'+
    (url?'✓ Kvalitetsfil uppladdad':canPreview?'Syntetiskt testljud':'Saknar ljudfil')+'</small>'+
    '<div class="alea-sound-tags"><span>'+escapeHtml(priorityNames[priority])+'</span><span>'+
    (row.integration_status==='planned'?'Ej inkopplad':'Inkopplad i spelet')+'</span><span>'+
    (kind==='loop'?'Loop':'Ljudeffekt')+'</span></div>'+ (sourceLink?'<a class="alea-sound-source-link" href="'+escapeHtml(sourceLink)+'" target="_blank" rel="noopener noreferrer">↗ Lyssna på källan</a>':'')+'</div>'+
   '<label>Namn<input type="text" maxlength="120" data-field="title" value="'+escapeHtml(row.title)+'"></label>'+
   '<label>Kategori'+selection('category',categoryLabels,row.category)+'</label>'+
   '<label>Volym<input type="range" min="0" max="100" step="1" value="'+Math.round(clamp(row.volume)*100)+'" data-field="volume"></label>'+
   '<label class="alea-sound-check"><input type="checkbox" data-field="enabled"'+(row.enabled?' checked':'')+'> Aktiv</label>'+
   '<div class="alea-sound-actions"><button type="button" data-audio-action="preview"'+(canPreview?'':' disabled title="Ladda upp en ljudfil först"')+'>▶ Testa</button>'+
    '<button type="button" data-audio-action="save">Spara</button>'+
    '<label class="alea-sound-upload">↑ Ljudfil<input type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4,.mp3,.ogg,.wav,.webm,.m4a" data-audio-upload hidden></label>'+
    (url?'<button type="button" data-audio-action="clear">Ta bort ljudfil</button>':'')+'</div>'+
   '<details class="alea-sound-brief"><summary>Gandalf &amp; Aragorn – Ljudbrief och källgranskning</summary>'+
    '<div class="alea-sound-brief-grid">'+
     '<label>Prioritet'+selection('priority',priorityNames,priority)+'</label>'+
     '<label>Speltyp'+selection('sound_kind',{oneshot:'Enstaka effekt',loop:'Sömlös loop'},kind)+'</label>'+
     '<label>Önskade varianter<input type="number" min="1" max="8" data-field="target_variants" value="'+(Number(row.target_variants)||1)+'"></label>'+
     '<label>Ljudkälla'+selection('source_status',sourceNames,row.source_status||'needed')+'</label>'+
     '<label class="alea-sound-brief-wide">När spelas ljudet?<textarea data-field="usage_hint" rows="2" maxlength="500">'+escapeHtml(row.usage_hint||'')+'</textarea></label>'+
     '<label class="alea-sound-brief-wide">Sökord på engelska<textarea data-field="search_terms" rows="2" maxlength="500">'+escapeHtml(row.search_terms||'')+'</textarea></label>'+
     '<label class="alea-sound-brief-wide">Ljudkälla (HTTPS)<input type="url" data-field="source_url" placeholder="https://freesound.org/people/..." maxlength="1200" value="'+escapeHtml(row.source_url||'')+'"></label>'+
     '<label>Upphovsperson<input type="text" data-field="creator_credit" maxlength="200" value="'+escapeHtml(row.creator_credit||'')+'"></label>'+
     '<label>Licens<input type="text" data-field="license_type" maxlength="150" value="'+escapeHtml(row.license_type||'')+'"></label>'+
     '<label class="alea-sound-brief-wide">Licens- och bearbetningsanteckningar<textarea data-field="license_notes" rows="3" maxlength="2000">'+escapeHtml(row.license_notes||'')+'</textarea></label>'+
     '<p class="alea-sound-brief-wide alea-sound-brief-note">Kandidat ≠ uppladdad fil. Kontrollera licens och innehåll på källsidan innan filen bearbetas eller delas. Freesound kan kräva inloggning för nedladdning.</p>'+
     '<p class="alea-sound-brief-wide alea-sound-brief-note">'+(row.integration_status==='planned'?
       'Ljudet är inventerat men behöver kopplas till spelmekanik i en senare etapp.':
       'Ljudet har redan en uppspelningsväg i Alea Crusaders.')+'</p>'+
    '</div></details></div>'
 }).join(''):'<p class="note">Inga ljud matchar sökningen.</p>'
}
async function renderAdmin(){
 if(!document.getElementById('adminSoundTable'))return;
 formStatus('Läser ljudregistret…');
 try{await load(true);renderRows();formStatus(cues.size+' ljudhändelser · uppladdade kvalitetsljud används före syntetiska ljud.')}
 catch(error){formStatus('Kunde inte läsa ljudregistret: '+error.message,true);renderRows()}
}
let mountedAdmin=false;
function mountAdmin(){
 const target=document.getElementById('adminSoundTable');if(!target||mountedAdmin)return;
 mountedAdmin=true;
 ['adminSoundSearch','adminSoundCategory','adminSoundFileFilter','adminSoundPriorityFilter','adminSoundIntegrationFilter','adminSoundSourceFilter'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',renderRows)
 });
 target.addEventListener('click',async event=>{
  const button=event.target.closest('[data-audio-action]');if(!button)return;
  const row=button.closest('[data-sound-key]');if(!row)return;
  const key=row.dataset.soundKey;
  const action=button.dataset.audioAction;
  if(action==='preview'){unlock();play(key);return}
  button.disabled=true;
  try{
   if(action==='save'){
    const title=row.querySelector('[data-field=title]').value.trim();
    if(!title)throw new Error('Namn krävs.');
    await saveCue(key,{title,category:row.querySelector('[data-field=category]').value,
     volume:Number(row.querySelector('[data-field=volume]').value)/100,
     enabled:row.querySelector('[data-field=enabled]').checked,
     priority:Number(row.querySelector('[data-field=priority]').value),
     sound_kind:row.querySelector('[data-field=sound_kind]').value,
     target_variants:Number(row.querySelector('[data-field=target_variants]').value),
     source_status:row.querySelector('[data-field=source_status]').value,
     usage_hint:row.querySelector('[data-field=usage_hint]').value.slice(0,500),
     search_terms:row.querySelector('[data-field=search_terms]').value.slice(0,500),
     source_url:row.querySelector('[data-field=source_url]').value.trim(),
     creator_credit:row.querySelector('[data-field=creator_credit]').value.trim().slice(0,200),
     license_type:row.querySelector('[data-field=license_type]').value.trim().slice(0,150),
     license_notes:row.querySelector('[data-field=license_notes]').value.trim().slice(0,2000)})
   }else if(action==='clear')await saveCue(key,{asset_path:null});
   renderRows();formStatus('Sparat: '+key)
  }catch(error){formStatus(error.message,true)}
  finally{button.disabled=false}
 });
 target.addEventListener('change',async event=>{
  const field=event.target.closest('[data-audio-upload]');if(!field)return;
  const key=field.closest('[data-sound-key]')?.dataset.soundKey;
  if(!key||!field.files?.[0])return;
  field.disabled=true;formStatus('Laddar upp ljudfil…');
  try{await uploadCue(key,field.files[0]);renderRows();formStatus('Ljudfil uppladdad: '+key)}
  catch(error){formStatus(error.message,true);field.disabled=false}
 });
}
function gameSoundAllowed(){
 return !!document.getElementById('loginScreen')?.classList.contains('hidden')&&
        !!document.getElementById('home')?.classList.contains('hidden')
}
function onGameGesture(){
 // Do not initialize AudioContext or fetch the sound registry on ordinary page clicks.
 // AudioContext is created by an actual sound action, or to resume a pending
 // synchronized ambience after the player actively enters a game screen.
 if(!prefs.enabled||!activeAmbience||!gameSoundAllowed())return;
 if(!context||context.state==='suspended')unlock();
 if(context&&!ambientVoice)setAmbience(activeAmbience)
}
function initialize(){
 try{mountDock()}catch(error){console.warn('Kunde inte visa ljudkontrollen',error)}
 try{mountAdmin()}catch(error){console.warn('Kunde inte starta ljudadmin',error)}
 document.addEventListener('pointerdown',onGameGesture,{passive:true});
 document.addEventListener('keydown',onGameGesture,{passive:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
window.aleaAudio={play,spellResult,setAmbience,stopAmbience,unlock,load,renderAdmin,mountAdmin,setPrefs,getPrefs:()=>({...prefs}),stopAll,cues:()=>[...cues.values()],activeAmbience:()=>activeAmbience};
})();
