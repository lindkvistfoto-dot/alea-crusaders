/* HERMES · reusable, admin-configurable combat animations.
 * Visual layer only: no authority over rolls, combat actions, damage or audio.
 */
(function(){
 'use strict';
 const BUCKET='alea-combat-animations',MAX_BYTES=12*1024*1024;
 const PATH=/^events\/[a-z][a-z0-9]*(?:\.[a-z0-9]+)+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;
 const KEY=/^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/;
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
 const validPath=value=>PATH.test(String(value||''));
 const rows=new Map(),playing=new Set();
 let loaded=false,loading=null,mounted=false,lastPlayed=new Map();
 function normalize(row){
  return {
   event_key:String(row?.event_key||''),
   label:String(row?.label||''),category:String(row?.category||'combat'),
   enabled:row?.enabled!==false,
   asset_path:validPath(row?.asset_path)?row.asset_path:null,
   speed:clamp(row?.speed,.25,4,1),
   scale:clamp(row?.scale,.25,3,1),
   opacity:clamp(row?.opacity,.1,1,1),
   offset_x:Math.round(clamp(row?.offset_x,-400,400,0)),
   offset_y:Math.round(clamp(row?.offset_y,-400,400,0)),
   blend_mode:['screen','lighten','normal'].includes(row?.blend_mode)?row.blend_mode:'screen'
  };
 }
 function mediaUrl(path){
  if(!validPath(path))return '';
  return SUPABASE_URL+'/storage/v1/object/public/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/');
 }
 async function refresh(force=false){
  if(loading)return loading;
  if(loaded&&!force)return [...rows.values()];
  loading=(async()=>{
   try{
    const data=await dbJson('combat_animation_cues?select=*&order=category.asc,label.asc');
    if(!Array.isArray(data))throw Error('Animationsregistret svarade inte.');
    rows.clear();
    for(const item of data)if(KEY.test(String(item.event_key)))rows.set(item.event_key,normalize(item));
    loaded=true;
   }catch(err){console.warn('HERMES: animationsregistret kunde inte hämtas',err);if(!loaded)rows.clear();}
   return [...rows.values()];
  })();
  try{return await loading}finally{loading=null}
 }
 function targetPosition(target){
  const svg=document.querySelector('#combatPage .combat-board .combat-map-svg');
  try{
   if(svg&&target&&typeof combatRuntimeGeometry==='function'&&typeof combatFootprintCells==='function'){
    const g=combatRuntimeGeometry(),cells=combatFootprintCells(target);
    if(g&&cells.length&&svg.getScreenCTM()){
     let x=0,y=0;
     for(const cell of cells){x+=g.xPitch*(Number(cell.q)+Number(cell.r)/2)+g.offsetX;y+=g.rowPitch*Number(cell.r)+g.offsetY}
     const point=svg.createSVGPoint();point.x=x/cells.length;point.y=y/cells.length;
     const screen=point.matrixTransform(svg.getScreenCTM());
     if(Number.isFinite(screen.x)&&Number.isFinite(screen.y))return{x:screen.x,y:screen.y};
    }
   }
  }catch(_error){}
  const el=document.querySelector('#combatPage .combat-board')||document.querySelector('#combatPage');
  const rect=el?.getBoundingClientRect?.();
  return rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:{x:innerWidth/2,y:innerHeight/2}
 }
 function play(eventKey,opts={}){
  if(!KEY.test(String(eventKey||'')))return false;
  if(document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return false;
  if(!opts.preview&&document.querySelector('#combatPage')?.classList.contains('hidden'))return false;
  const row=opts.config?normalize({...rows.get(eventKey),...opts.config,event_key:eventKey}):rows.get(eventKey);
  if(!row?.enabled||!row.asset_path)return false;
  const url=mediaUrl(row.asset_path);
  if(!url)return false;
  const now=Date.now();
  if(!opts.preview&&now-(lastPlayed.get(eventKey)||0)<250)return false;
  lastPlayed.set(eventKey,now);
  if(playing.size>=3){const first=playing.values().next().value;first?.cleanup?.();}
  const pos=opts.preview?{
   x:innerWidth/2,y:innerHeight/2
  }:targetPosition(opts.target);
  const width=Math.min(innerWidth*.88,Math.min(innerWidth*.6,480)*row.scale);
  const video=document.createElement('video');
  video.className='hermes-combat-vfx';
  video.setAttribute('aria-hidden','true');
  video.playsInline=true;video.muted=true;video.autoplay=true;video.preload='auto';video.loop=false;
  video.src=url;video.playbackRate=row.speed;video.defaultPlaybackRate=row.speed;
  Object.assign(video.style,{
   position:'fixed',pointerEvents:'none',zIndex:'1100',objectFit:'contain',
   width:width+'px',height:width+'px',maxWidth:'95vw',
   left:Math.round(pos.x+row.offset_x)+'px',top:Math.round(pos.y+row.offset_y)+'px',
   transform:'translate(-50%,-50%)',opacity:String(row.opacity),
   mixBlendMode:row.blend_mode,background:'transparent'
  });
  let cleaned=false,timeout=null;
  const job={cleanup(){
   if(cleaned)return;cleaned=true;
   if(timeout)clearTimeout(timeout);
   video.pause();video.removeAttribute('src');video.load();video.remove();
   playing.delete(job);
  }};
  video.addEventListener('ended',job.cleanup,{once:true});
  video.addEventListener('error',job.cleanup,{once:true});
  playing.add(job);document.body.appendChild(video);
  timeout=setTimeout(job.cleanup,14000);
  video.play().catch(error=>{console.warn('HERMES: videouppspelning stoppades',error);job.cleanup()});
  return true;
 }
 function field(card,name){return card.querySelector('[data-vfx-field="'+name+'"]')}
 function draft(key){
  const card=[...document.querySelectorAll('#adminAnimations [data-animation-key]')]
   .find(el=>el.dataset.animationKey===key);
  if(!card)return null;
  return normalize({...rows.get(key),
   speed:field(card,'speed')?.value,scale:field(card,'scale')?.value,
   opacity:field(card,'opacity')?.value,offset_x:field(card,'offset_x')?.value,
   offset_y:field(card,'offset_y')?.value,blend_mode:field(card,'blend_mode')?.value,
   enabled:!!field(card,'enabled')?.checked
  });
 }
 function status(message){
  const el=document.getElementById('hermesAnimationStatus');
  if(el)el.textContent=message||'';
 }
 function render(){
  const container=document.getElementById('adminAnimationRows');if(!container)return;
  if(!loaded){container.textContent='Animationsregistret kunde inte hämtas.';return}
  const category={melee:'Närstrid',ranged:'Avstånd',defense:'Försvar',magic:'Magi',combat:'Strid',system:'System'};
  container.innerHTML=[...rows.values()].map(row=>{
   const ok=!!row.asset_path,url=mediaUrl(row.asset_path);
   return '<article class="hermes-animation-card" data-animation-key="'+esc(row.event_key)+'">'+
    '<div class="hermes-animation-head"><div><strong>'+esc(row.label)+'</strong><small>'+esc(category[row.category]||row.category)+' · '+esc(row.event_key)+'</small></div>'+
    '<span class="hermes-animation-state">'+(ok?'Video ansluten':'Ingen video')+'</span></div>'+
    '<div class="hermes-animation-controls">'+
     '<label>Hastighet <input data-vfx-field="speed" type="number" min="0.25" max="4" step="0.25" value="'+row.speed+'"></label>'+
     '<label>Storlek <input data-vfx-field="scale" type="number" min="0.25" max="3" step="0.1" value="'+row.scale+'"></label>'+
     '<label>Opacitet <input data-vfx-field="opacity" type="number" min="0.1" max="1" step="0.1" value="'+row.opacity+'"></label>'+
     '<label>Horisontell förskjutning <input data-vfx-field="offset_x" type="number" min="-400" max="400" step="10" value="'+row.offset_x+'"></label>'+
     '<label>Vertikal förskjutning <input data-vfx-field="offset_y" type="number" min="-400" max="400" step="10" value="'+row.offset_y+'"></label>'+
     '<label>Bakgrund <select data-vfx-field="blend_mode">'+
      [['screen','Screen – svart försvinner'],['lighten','Lighten'],['normal','Normal – äkta alfa']].map(([v,l])=>'<option value="'+v+'"'+(row.blend_mode===v?' selected':'')+'>'+l+'</option>').join('')+
     '</select></label></div>'+
    '<div class="hermes-animation-actions">'+
     '<label class="hermes-animation-toggle"><input type="checkbox" data-vfx-field="enabled"'+(row.enabled?' checked':'')+'> Aktiv</label>'+
     '<label class="smallbtn hermes-animation-upload">↑ Välj video<input type="file" data-hermes-upload accept="video/mp4,video/webm,.mp4,.webm" hidden></label>'+
     '<button type="button" class="smallbtn" data-hermes-action="save">Spara</button>'+
     '<button type="button" class="smallbtn" data-hermes-action="preview"'+(ok?'':' disabled')+'>▶ Testa</button>'+
     '<button type="button" class="smallbtn" data-hermes-action="remove"'+(ok?'':' disabled')+'>Koppla bort</button>'+
    '</div>'+ (url?'<small class="muted hermes-animation-file">'+esc(row.asset_path)+'</small>':'')+
   '</article>'
  }).join('');
 }
 async function save(key,values){
  if(!activeUser()?.admin)throw Error('Endast administratörer kan ändra animationer.');
  if(!rows.has(key))throw Error('Okänd animationshändelse.');
  const payload={speed:values.speed,scale:values.scale,opacity:values.opacity,
   offset_x:values.offset_x,offset_y:values.offset_y,blend_mode:values.blend_mode,
   enabled:values.enabled,updated_at:new Date().toISOString()};
  await dbJson('combat_animation_cues?event_key=eq.'+encodeURIComponent(key),{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
  rows.set(key,normalize({...rows.get(key),...payload}));
  return rows.get(key);
 }
 async function upload(key,file){
  if(!activeUser()?.admin)throw Error('Endast administratörer kan ladda upp animationer.');
  if(!rows.has(key)||!file)throw Error('Välj en animationshändelse och en fil.');
  const extension=file.name.split('.').pop()?.toLowerCase();
  const mime=extension==='mp4'?'video/mp4':extension==='webm'?'video/webm':null;
  if(!mime||file.type&&file.type!==mime)throw Error('Välj MP4 eller WebM.');
  if(file.size<1||file.size>MAX_BYTES)throw Error('Filen måste vara 1 byte–12 MB.');
  const path='events/'+key+'/'+crypto.randomUUID()+'.'+extension;
  if(!validPath(path))throw Error('Felaktig filväg.');
  const resp=await authFetch('/storage/v1/object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
   method:'POST',headers:{Authorization:'Bearer '+supabaseSession.access_token,'Content-Type':mime,
    'x-upsert':'false','cache-control':'3600'},body:file
  });
  if(!resp.ok){const message=await resp.text();throw Error('Videoöverföring misslyckades: '+message.slice(0,220))}
  // Readback from the public delivery endpoint must succeed before updating DB.
  const head=await fetch(mediaUrl(path),{method:'GET',headers:{Range:'bytes=0-31'}});
  if(!head.ok)throw Error('Videon nås ännu inte från lagringen. Databaspekaren ändrades inte.');
  const bytes=new Uint8Array(await head.arrayBuffer());
  const ascii=String.fromCharCode(...bytes.slice(0,16));
  if(extension==='mp4'&&ascii.slice(4,8)!=='ftyp')throw Error('Filen verkar inte vara en MP4.');
  if(extension==='webm'&&!(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163))
   throw Error('Filen verkar inte vara en WebM.');
  await dbJson('combat_animation_cues?event_key=eq.'+encodeURIComponent(key),{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({
    asset_path:path,updated_at:new Date().toISOString()
   })});
  rows.set(key,normalize({...rows.get(key),asset_path:path}));
  return path;
 }
 async function remove(key){
  if(!activeUser()?.admin)throw Error('Endast administratörer kan ändra animationer.');
  await dbJson('combat_animation_cues?event_key=eq.'+encodeURIComponent(key),{
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({
    asset_path:null,updated_at:new Date().toISOString()
   })});
  rows.set(key,normalize({...rows.get(key),asset_path:null}));
  // Immutable uploaded file intentionally remains for audit and rollback.
 }
 async function renderAdmin(){
  if(!activeUser()?.admin)return;
  await refresh(true);render();
 }
 function mountAdmin(){
  const container=document.getElementById('adminAnimationRows');
  if(!container||mounted)return;
  mounted=true;
  container.addEventListener('click',async event=>{
   const button=event.target.closest('[data-hermes-action]');
   if(!button)return;
   const card=button.closest('[data-animation-key]'),key=card?.dataset.animationKey;
   if(!key||!rows.has(key))return;
   const action=button.dataset.hermesAction;
   const values=draft(key);if(!values)return;
   if(action==='preview'){if(!values.enabled)status('Aktivera animationen för att provspela.');else if(!play(key,{preview:true,config:values}))status('Ingen spelbar video.');return}
   button.disabled=true;
   try{
    if(action==='remove')await remove(key);
    else if(action==='save')await save(key,values);
    status(action==='remove'?'Videokopplingen borttagen (originalfilen bevaras).':'Inställningar sparade: '+key);
    render();
   }catch(error){console.error('HERMES admin',error);status(error.message||String(error))}
   finally{button.disabled=false}
  });
  container.addEventListener('change',async event=>{
   const input=event.target.closest('[data-hermes-upload]');
   if(!input||!input.files?.[0])return;
   const key=input.closest('[data-animation-key]')?.dataset.animationKey;
   status('Överför video för '+key+'…');input.disabled=true;
   try{await upload(key,input.files[0]);status('Video uppladdad och verifierad för '+key);render()}
   catch(error){console.error('HERMES video upload',error);status(error.message||String(error))}
   finally{input.disabled=false}
  });
 }
 window.aleaAnimations={refresh,renderAdmin,mountAdmin,play,validPath,normalize,mediaUrl};
})();
