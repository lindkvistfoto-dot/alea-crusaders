/* Arcane Paper Doll Workshop — admin-only visual mounting bench.
   Profiles contain reusable calibration only: never a character/image reference. */
(function(root){
 'use strict';
 const VERSION=1, STORE='alea.arcane-paper-doll-workshop.v1';
 const BASES=Object.freeze([{id:'single',label:'1 hex · Bronze Ivory (original)',key:'arcane-paper-doll-hexagon-base',available:true},{id:'pointed-high',label:'1 hex · Spetsig · High Angle',key:'arcane-bronze-ivory-pointed-hex-high-angle',available:true},{id:'pointed-low',label:'1 hex · Spetsig · Low Angle',key:'arcane-bronze-ivory-pointed-hex-low-angle',available:true},{id:'double',label:'2 hex · Kommande',available:false},{id:'triple',label:'3 hex · Kommande',available:false},{id:'five',label:'5 hex · Kommande',available:false},{id:'seven',label:'7 hex · Kommande',available:false}]);
 let baseOnly=false,baseScale=35,showAnchor=false,standScale=65,standX=0,standY=0,baseId='single',localBases={},cutoutUrl='',cutoutScale=65,cutoutX=0,cutoutY=0;
 const DEFAULT=Object.freeze({scale:100,x:0,y:0,perspective:0,tilt:0,mask:0,shadow:18});
 let records=[],resources={assets:[],systemArt:{}},selected='',profiles={},values={...DEFAULT},zoom=70;
 const $=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kinds={character:'Rollperson', 'character-npc':'Rollperson · SLP', 'campaign-npc':'Kampanj-SLP','global-npc':'Permanent SLP',enemy:'Fiende',monster:'Monster'};
 function isAdmin(){try{return !!root.activeUser?.()?.admin}catch(_){return false}}
 function storageKey(){return STORE+':'+String(root.aleaPaperDollWorkshopUser||'shared')}
 function safeRead(){try{const data=JSON.parse(localStorage.getItem(storageKey())||'{}');return data&&data.schema===VERSION&&data.profiles&&typeof data.profiles==='object'?data.profiles:{}}catch(_){return {}}}
 function profileValid(profile){return profile&&profile.schema===VERSION&&profile.assetKey==='arcane-paper-doll-mounting-profile'&&profile.parameters&&Object.keys(DEFAULT).every(k=>Number.isFinite(profile.parameters[k])&&profile.parameters[k]>=min(k)&&profile.parameters[k]<=max(k))}
 function min(key){return ({scale:50,x:-80,y:-80,perspective:-35,tilt:-25,mask:0,shadow:0})[key]}
 function max(key){return ({scale:180,x:80,y:80,perspective:35,tilt:25,mask:24,shadow:50})[key]}
 function normalizeProfiles(input){const out={};for(const [name,p] of Object.entries(input||{})){const clean=String(name).trim().slice(0,60);if(clean&&profileValid(p))out[clean]={schema:VERSION,assetKey:p.assetKey,parameters:Object.fromEntries(Object.keys(DEFAULT).map(k=>[k,Number(p.parameters[k])]))}}return out}
 function saveStore(){try{localStorage.setItem(storageKey(),JSON.stringify({schema:VERSION,profiles}))}catch(_){setStatus('Kunde inte spara i den här webbläsaren. Exportera profilen som JSON.','error')}}
 function activeRecord(){return records.find(item=>item.id===selected)||null}
 function asset(key){return resources.assets?.find(item=>item.id===resources.systemArt?.[key]&&item.status==='active'&&item.verified)||null}
 function currentBase(){return BASES.find(b=>b.id===baseId)||BASES[0]}
 function currentBaseUrl(){return localBases[baseId]||asset(currentBase().key)?.src||''}
 function statusText(){const base=asset(currentBase().key);return resources.error?'HERMES: '+resources.error:base?'Hexagonreferens hittad. Laddar WebP…':'Ingen aktiv hexagonreferens. Visar platshållare.'}
 function makeOptions(){return records.map(item=>'<option value="'+escape(item.id)+'" '+(item.id===selected?'selected':'')+'>'+escape((kinds[item.kind]||'Porträtt')+' · '+item.name)+'</option>').join('')}
 function render(){
  const mount=$('arcanePaperDollWorkshopMount');if(!mount)return;
  mount.innerHTML='<p id="apdwResourceStatus" class="apdw-status" role="status" aria-live="polite" hidden>'+escape(statusText())+'</p>'+ 
   '<div class="apdw-base-picker"><label for="apdwBaseSelect">Basplatta</label><select id="apdwBaseSelect">'+BASES.map(b=>'<option value="'+b.id+'" '+(b.id===baseId?'selected':'')+' '+(b.available?'':'disabled')+'>'+b.label+'</option>').join('')+'</select><label><input type="checkbox" id="apdwBaseOnly" '+(baseOnly?'checked':'')+'> Visa endast basplatta</label></div>'+ 
   '<div class="apdw-base-scale"><label for="apdwBaseScale">Basens skala</label><input id="apdwBaseScale" type="range" min="20" max="100" value="'+baseScale+'"><output id="apdwBaseScaleOut">'+baseScale+'%</output><label><input id="apdwShowAnchor" type="checkbox" '+(showAnchor?'checked':'')+'> Visa fästpunkt</label></div>'+ 
   '<div class="apdw-layout"><div class="apdw-workbench"><div class="apdw-preview-top"><div><b>Monteringsbänk</b><small>Basplatta → cutout</small></div><div class="apdw-zoom"><button type="button" data-zoom="-">−</button><span id="apdwZoomLabel">'+zoom+'%</span><button type="button" data-zoom="+">+</button><button type="button" data-zoom="reset">Återställ zoom</button></div></div>'+ 
   '<div class="apdw-stage-clip"><div class="apdw-stage" id="apdwStage" style="--stand-scale:'+standScale/100+';--stand-x:'+standX+'%;--stand-y:'+standY+'%;--base-scale:'+baseScale/100+';--zoom:'+zoom/100+';--p-scale:'+values.scale/100+';--p-x:'+values.x+'%;--p-y:'+values.y+'%;--p-perspective:'+values.perspective+'deg;--stand-tilt:'+values.tilt+'deg;--mask:'+values.mask+'%;--contact-shadow:'+values.shadow+'px">'+ 
   '<p id="apdwBaseUnavailable" class="apdw-base-unavailable" hidden>Basen är ännu inte publicerad via HERMES. Ladda den som lokal PNG/WebP för att förhandsvisa.</p><img class="apdw-base" alt="Arcane basplatta" hidden>'+ 
   '<span class="apdw-anchor" id="apdwAnchor" '+(showAnchor?'':'hidden')+' aria-label="Monteringspunkt"></span>'+ 
   '<img id="apdwCutout" class="apdw-cutout" alt="Cutout-förhandsvisning" hidden>'+ 
   '</div></div></div>'+ 
   '<div class="apdw-controls"><div class="apdw-cutout-controls"><b>Montera figur på vald bas</b><p class="apdw-help">Basen ligger kvar underst. Figuren placeras i ett separat transparent lager ovanpå.</p><label for="apdwCutoutFile">Ladda upp FIGUR / CUTOUT (PNG/WebP)</label><input id="apdwCutoutFile" type="file" accept="image/png,image/webp"><label>Storlek <input id="apdwCutoutScale" type="range" min="20" max="150" value="'+cutoutScale+'"><output id="apdwCutoutScaleOut">'+cutoutScale+'%</output></label><label>Sidled <input id="apdwCutoutX" type="range" min="-80" max="80" value="'+cutoutX+'"><output id="apdwCutoutXOut">'+cutoutX+'%</output></label><label>Höjd <input id="apdwCutoutY" type="range" min="-80" max="80" value="'+cutoutY+'"><output id="apdwCutoutYOut">'+cutoutY+'%</output></label><button type="button" data-action="clear-cutout" class="btn">Ta bort cutout</button><small>Endast lokal förhandsvisning. Ingen publicering.</small></div>'+ 
   '<div class="apdw-control-grid"></div>'+ 
   '<div class="apdw-actions"><button type="button" data-action="reset" class="btn">Återställ reglage</button></div>'+ 
   '<div class="apdw-profile-box"><label for="apdwProfileSelect">Monteringsprofiler</label><div class="apdw-profile-row"><select id="apdwProfileSelect"><option value="">Välj sparad profil…</option>'+Object.keys(profiles).sort((a,b)=>a.localeCompare(b,'sv')).map(name=>'<option value="'+escape(name)+'">'+escape(name)+'</option>').join('')+'</select><input id="apdwProfileName" maxlength="60" placeholder="Profilnamn" aria-label="Namn på monteringsprofil"><button type="button" data-action="save" class="btn primary">Spara profil</button><button type="button" data-action="load" class="btn">Återläs</button></div><div class="apdw-profile-row"><button type="button" data-action="export" class="btn">Exportera JSON</button><button type="button" data-action="import" class="btn">Importera JSON</button><button type="button" data-action="delete" class="btn">Ta bort profil</button><input id="apdwImportFile" type="file" accept="application/json,.json" hidden></div><p class="apdw-help">Profilen sparar bara geometri och bildnyckel. Den kan användas med valfritt porträtt.</p></div><p id="apdwActionStatus" class="apdw-status" role="status" aria-live="polite"></p></div></div>';
  arrangeWorkspace();bind();applyAssets();applyBaseMode();
 }
 function arrangeWorkspace(){
  const layout=document.querySelector('#arcanePaperDollWorkshopMount .apdw-layout');
  const controls=layout?.querySelector('.apdw-controls');
  const profiles=controls?.querySelector('.apdw-profile-box');
  if(!layout||!controls||!profiles)return;
  const left=document.createElement('aside');left.className='apdw-left-panel';left.setAttribute('aria-label','Spara monteringspositioner');
  const heading=document.createElement('h3');heading.textContent='Positioner & profiler';left.append(heading,profiles);
  const status=controls.querySelector('#apdwActionStatus');if(status)left.append(status);
  layout.prepend(left);
  const picker=document.querySelector('#arcanePaperDollWorkshopMount .apdw-base-picker');

  const scale=document.querySelector('#arcanePaperDollWorkshopMount .apdw-base-scale');
  
  const title=document.createElement('h3');title.textContent='Bilder & inställningar';controls.prepend(title);
  for(const element of [picker,scale].filter(Boolean))controls.insertBefore(element,controls.querySelector('.apdw-cutout-controls'));
 }
 function control(key,label,unit){return '<label class="apdw-range" for="apdw-'+key+'"><span>'+label+' <output id="apdw-'+key+'Out">'+values[key]+unit+'</output></span><input id="apdw-'+key+'" type="range" min="'+min(key)+'" max="'+max(key)+'" step="1" value="'+values[key]+'" data-value="'+key+'"></label>'}
 function bind(){
  $('apdwBaseScale')?.addEventListener('input',e=>{baseScale=Number(e.target.value);$('apdwBaseScaleOut').textContent=baseScale+'%';$('apdwStage')?.style.setProperty('--base-scale',baseScale/100)});
  $('apdwShowAnchor')?.addEventListener('change',e=>{showAnchor=e.target.checked;const anchor=$('apdwAnchor');if(anchor)anchor.hidden=!showAnchor});
  $('apdwBaseSelect')?.addEventListener('change',e=>{baseId=e.target.value;applyAssets()});
  $('apdwCutoutFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/webp'].includes(file.type)){setStatus('Välj PNG eller WebP.','error');return}if(cutoutUrl)URL.revokeObjectURL(cutoutUrl);cutoutUrl=URL.createObjectURL(file);applyCutout()});
  for(const [id,key] of [['apdwCutoutScale','cutoutScale'],['apdwCutoutX','cutoutX'],['apdwCutoutY','cutoutY']])$(id)?.addEventListener('input',e=>{const n=Number(e.target.value);if(key==='cutoutScale')cutoutScale=n;else if(key==='cutoutX')cutoutX=n;else cutoutY=n;$(id+'Out').textContent=n+'%';applyCutout()});
  $('apdwBaseOnly')?.addEventListener('change',event=>{baseOnly=event.target.checked;applyBaseMode()});


  document.querySelectorAll('#arcanePaperDollWorkshopMount [data-value]').forEach(input=>input.addEventListener('input',()=>{values[input.dataset.value]=Number(input.value);$('apdw-'+input.dataset.value+'Out').value=input.value+({scale:'%',x:'%',y:'%',perspective:'°',tilt:'°',mask:'%',shadow:'px'}[input.dataset.value]);applyValues()}));
  $('apdwProfileSelect')?.addEventListener('change',e=>{if($('apdwProfileName'))$('apdwProfileName').value=e.target.value});
  $('apdwImportFile')?.addEventListener('change',e=>importFile(e.target.files?.[0]));
  $('arcanePaperDollWorkshopMount')?.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action)handleAction(action);const z=event.target.closest('[data-zoom]')?.dataset.zoom;if(z)handleZoom(z)});
 }
 function applyValues(){const stage=$('apdwStage');if(!stage)return;for(const [key,css] of Object.entries({scale:'--p-scale',x:'--p-x',y:'--p-y',perspective:'--p-perspective',tilt:'--stand-tilt',mask:'--mask',shadow:'--contact-shadow'}))stage.style.setProperty(css,key==='scale'?String(values[key]/100):values[key]+(key==='perspective'||key==='tilt'?'deg':key==='shadow'?'px':'%'));const token=$('apdwMapToken');if(token)token.style.transform='translate(-50%,-50%) scale('+values.scale/100+')';}
 function applyBaseMode(){const stage=$('apdwStage');if(stage)stage.classList.toggle('apdw-base-only-mode',baseOnly);applyCutout()}
 function applyAssets(){
  const bi=document.querySelector('#arcanePaperDollWorkshopMount .apdw-base');
  const bp=$('apdwBaseUnavailable');
  const url=currentBaseUrl();
  if(!bi)return;
  bi.onload=()=>{bi.hidden=false;if(bp)bp.hidden=true;const e=$('apdwResourceStatus');if(e)e.textContent='Bas laddad: '+currentBase().label+' · '+bi.naturalWidth+' × '+bi.naturalHeight};
  bi.onerror=()=>{bi.hidden=true;if(bp)bp.hidden=false;const e=$('apdwResourceStatus');if(e)e.textContent='Basen kunde inte laddas. Välj en lokal PNG eller invänta HERMES-publicering.'};
  if(url){bi.hidden=true;bi.src=url}else{bi.removeAttribute('src');bi.hidden=true;if(bp)bp.hidden=false;const e=$('apdwResourceStatus');if(e)e.textContent='Basen väntar på HERMES-publicering. Du kan förhandsvisa via filväljaren.'}
  applyCutout();
 }
 function applyCutout(){
  const img=$('apdwCutout');if(!img)return;
  if(!cutoutUrl){img.hidden=true;img.removeAttribute('src');return}
  if(img.src!==cutoutUrl)img.src=cutoutUrl;img.hidden=baseOnly;
  img.style.width=cutoutScale+'%';img.style.left='calc(50% + '+cutoutX+'%)';img.style.bottom='calc(10% + '+cutoutY+'%)';
 }

 function setStatus(message,type=''){const el=$('apdwActionStatus');if(el){el.textContent=message;el.dataset.state=type}}
 function snapshot(name){return {schema:VERSION,assetKey:'arcane-paper-doll-mounting-profile',name,parameters:{...values}}}
 function applyProfile(profile){if(!profileValid(profile))throw new Error('Profilen har fel format eller värden.');values={...profile.parameters};document.querySelectorAll('#arcanePaperDollWorkshopMount [data-value]').forEach(input=>{input.value=values[input.dataset.value];$('apdw-'+input.dataset.value+'Out').value=input.value+({scale:'%',x:'%',y:'%',perspective:'°',tilt:'°',mask:'%',shadow:'px'}[input.dataset.value])});applyValues()}
 function handleZoom(direction){zoom=direction==='reset'?70:Math.max(70,Math.min(140,zoom+(direction==='+'?10:-10)));const s=$('apdwStage'),label=$('apdwZoomLabel');if(s)s.style.setProperty('--zoom',zoom/100);if(label)label.textContent=zoom+'%'}
 function handleAction(action){try{if(action==='clear-cutout'){if(cutoutUrl)URL.revokeObjectURL(cutoutUrl);cutoutUrl='';applyCutout();setStatus('Cutout borttagen från förhandsvisningen.');return}if(action==='reset'){values={...DEFAULT};applyProfile(snapshot('Återställ'));handleZoom('reset');setStatus('Reglagen och zoomen återställda.');return}if(action==='save'){const name=$('apdwProfileName')?.value.trim();if(!name)throw new Error('Ange ett namn på monteringsprofilen.');profiles[name]=snapshot(name);saveStore();render();if($('apdwProfileSelect'))$('apdwProfileSelect').value=name;if($('apdwProfileName'))$('apdwProfileName').value=name;setStatus('Profilen “'+name+'” sparades och kan användas med valfritt porträtt.');return}if(action==='load'){const name=$('apdwProfileSelect')?.value;if(!name||!profiles[name])throw new Error('Välj en sparad profil först.');applyProfile(profiles[name]);$('apdwProfileName').value=name;setStatus('Profilen “'+name+'” återlästes.');return}if(action==='delete'){const name=$('apdwProfileSelect')?.value;if(!name||!profiles[name])throw new Error('Välj en sparad profil först.');delete profiles[name];saveStore();render();setStatus('Profilen togs bort.');return}if(action==='export'){const name=$('apdwProfileSelect')?.value||$('apdwProfileName')?.value.trim()||'monteringsprofil';const profile=profiles[name]||snapshot(name);download(name+'.json',JSON.stringify(profile,null,2));setStatus('JSON-profil exporterad.');return}if(action==='import'){$('apdwImportFile')?.click()}}catch(error){setStatus(error.message,'error')}}
 function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name.replace(/[^\p{L}\p{N}._-]+/gu,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 async function importFile(file){if(!file)return;try{const data=JSON.parse(await file.text()),items=Array.isArray(data)?data:[data];if(!items.length||items.some(x=>!profileValid(x)))throw new Error('JSON innehåller en ogiltig monteringsprofil.');for(const profile of items){const name=String(profile.name||'Importerad profil').trim().slice(0,60)||'Importerad profil';profiles[name]={...profile,name};}profiles=normalizeProfiles(profiles);saveStore();render();setStatus(items.length===1?'Monteringsprofil importerad.':items.length+' monteringsprofiler importerade.')}catch(error){setStatus(error.message||'JSON-filen kunde inte läsas.','error')}finally{const input=$('apdwImportFile');if(input)input.value=''}}
 async function mount(){if(!isAdmin())return;profiles=normalizeProfiles(safeRead());const provider=root.aleaPaperDollWorkshopData;if(typeof provider!=='function'){setStatus('Appens porträttregister är inte tillgängligt.');return}const mountPoint=$('arcanePaperDollWorkshopMount');if(!mountPoint)return;mountPoint.innerHTML='<p class="apdw-status">Läser porträttregister och HERMES-resurser…</p>';try{const data=await provider();records=Array.isArray(data.records)?data.records.filter(x=>x&&x.id):[];resources=data.systemAssets||{assets:[],systemArt:{}};root.aleaPaperDollWorkshopUser=data.userId||'shared';profiles=normalizeProfiles(safeRead());if(!records.some(x=>x.id===selected))selected='';render();if(data.warnings?.length)setStatus(data.warnings.join(' '),'error')}catch(error){records=[];resources={assets:[],systemArt:{}};render();setStatus('Porträttlistan kunde inte läsas: '+(error.message||error),'error')}}
 root.aleaPaperDollWorkshop=Object.freeze({mount,profileValid,normalizeProfiles,applyValues});
})(globalThis);
