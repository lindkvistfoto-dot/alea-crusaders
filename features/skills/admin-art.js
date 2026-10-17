/* ALEA CRUSADERS · independent skill icon and illustration uploads.
 * FÄRDIGHET IKON: square PNG/WebP with genuine transparent corners.
 * FÄRDIGHET ILLUSTRATION: square PNG/JPEG/WebP, stored without resampling.
 * Stored paths live on rule_skills, not on individual characters.
 * HERMES import/export is deliberately a separate follow-on integration.
 */
(function(){
 'use strict';
 const BUCKET='alea-skill-art';
 const HERMES_BUCKET='alea-hermes-public';
 const HERMES_ICON=/^hermes\/skill\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[a-f0-9]{64}\.webp$/;
 const MAX_BYTES=16*1024*1024;
 const TYPES={
  icon:{title:'FÄRDIGHET IKON',column:'icon_path',accept:'image/png,image/webp',help:'Rund guldram med verkligt transparent bakgrund utanför. PNG rekommenderas.'},
  illustration:{title:'FÄRDIGHET ILLUSTRATION',column:'illustration_path',accept:'image/png,image/jpeg,image/webp',help:'Kvadratisk, fotorealistisk fantasyscen utan ram. Originalkvalitet bevaras.'}
 };
 const SLUG=/^[a-z0-9][a-z0-9_-]{0,99}$/;
 const PATH=/^skill\/([a-z0-9][a-z0-9_-]{0,99})\/(icon|illustration)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|webp|jpg)$/;
 const MIME_EXT={'image/png':'png','image/webp':'webp','image/jpeg':'jpg'};
 const pending=new Set();
 const previews=new Map();
 let editorId='',generation=0;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const getRow=id=>typeof ruleSkills==='undefined'?null:(ruleSkills||[]).find(r=>String(r.id)===String(id));
 const isAdmin=()=>{try{return !!activeUser()?.admin}catch(_){return false}};
 function validPath(path,id,kind){
  const match=PATH.exec(String(path||''));
  if(match&&match[1]===String(id)&&match[2]===kind&&(kind!=='icon'||match[3]!=='jpg'))return true;
  const hermes=kind==='icon'?HERMES_ICON.exec(String(path||'')):null;
  return !!hermes&&hermes[1]===String(id).replaceAll('_','-');
 }
 function html(row){
  if(!row||!SLUG.test(String(row.id||'')))return '<section class="skill-art-editor wide"><h3>Färdighetsbilder</h3><p>Spara färdigheten först. Öppna den sedan igen för att ladda upp ikon och illustration.</p></section>';
  const id=String(row.id);
  return '<section class="skill-art-editor wide" aria-label="Bilder för färdighet">'+
   '<h3>Färdighetsbilder · två separata motiv</h3>'+
   '<p class="skill-art-intro">Båda bilderna knyts till <strong>'+escape(row.name||id)+'</strong>. Ikon och illustration laddas upp var för sig och sparas direkt. Ändringar av färdighetens text sparas med den vanliga Spara-knappen.</p>'+
   '<div class="skill-art-grid">'+Object.entries(TYPES).map(([kind,type])=>{
    const path=validPath(row[type.column],id,kind)?row[type.column]:'';
    return '<section class="skill-art-slot" data-kind="'+kind+'"><h4>'+type.title+'</h4>'+
     '<div class="skill-art-preview '+(kind==='icon'?'skill-art-preview-icon':'skill-art-preview-illustration')+'" role="img" aria-label="Förhandsvisning '+type.title+'">'+
      '<span class="skill-art-placeholder">'+(path?'Laddar bild…':'Ingen bild uppladdad')+'</span></div>'+
     '<p class="skill-art-help">'+type.help+'</p>'+
     '<div class="skill-art-controls"><label class="smallbtn skill-art-upload"> '+(path?'Byt bild':'Ladda upp bild')+
      '<input type="file" accept="'+type.accept+'" aria-label="Ladda upp '+type.title+'" onchange="aleaSkillArt.upload(event,\''+escape(id)+'\',\''+kind+'\')"></label>'+
     '<button type="button" class="smallbtn" '+(path?'':'disabled')+' onclick="aleaSkillArt.remove(\''+escape(id)+'\',\''+kind+'\')">Ta bort</button></div>'+
     '<p class="skill-art-status" role="status" aria-live="polite">'+(path?'Sparad bild finns.':'Välj en kvadratisk bild, högst 16 MB.')+'</p></section>';
   }).join('')+'</div></section>';
 }

 // Compact icon previews in the master-skill table. Never display illustrations here.
 // The bucket is private, so previews must be fetched with the signed-in user's storage client.
 const listUrls=new Map();
 let listToken=0,listObserver=null;
 function listIconHtml(row){
  const id=String(row?.id||''),name=String(row?.name||'Färdighet');
  const path=validPath(row?.icon_path,id,'icon')?String(row.icon_path):'';
  return '<span class="skill-art-row-thumb" data-skill-id="'+escape(id)+'" data-icon-path="'+escape(path)+'"'+
   ' role="img" aria-label="'+escape(path?'Ikon för '+name:'Ingen ikon uppladdad för '+name)+'"'+
   ' title="'+escape(path?'Ikon för '+name:'Ingen ikon uppladdad')+'">'+
   '<span class="skill-art-row-fallback" aria-hidden="true">✦</span></span>';
 }
 function releaseList(){
  listToken++;
  if(listObserver){listObserver.disconnect();listObserver=null}
  for(const url of listUrls.values())URL.revokeObjectURL(url);
  listUrls.clear();
 }
 function hydrateList(){
  releaseList();
  const root=document.getElementById('adminSkillTable');
  if(!root)return;
  const token=listToken,loading=new Set();
  const nodes=Array.from(root.querySelectorAll('.skill-art-row-thumb[data-icon-path]')).filter(el=>
   validPath(el.dataset.iconPath,el.dataset.skillId,'icon'));
  async function loadThumb(el){
   if(loading.has(el))return;
   loading.add(el);
   const path=el.dataset.iconPath,id=el.dataset.skillId;
   let url='';
   try{
    const response=await mapStorageFetch('object/'+(HERMES_ICON.test(path)?HERMES_BUCKET:BUCKET)+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'GET'});
    if(!response.ok)throw Error('Kunde inte hämta ikon ('+response.status+').');
    const blob=await response.blob();
    if(!blob.size||!['image/png','image/webp'].includes(blob.type))throw Error('Ogiltigt ikonformat.');
    url=URL.createObjectURL(blob);
    if(token!==listToken||document.getElementById('adminSkillTable')!==root||!root.contains(el)||
       el.dataset.skillId!==id||el.dataset.iconPath!==path){
     URL.revokeObjectURL(url);return;
    }
    const previous=listUrls.get(el);if(previous)URL.revokeObjectURL(previous);
    listUrls.set(el,url);
    const img=document.createElement('img');
    img.alt='';img.decoding='async';img.src=url;
    el.replaceChildren(img);
    el.classList.add('skill-art-row-loaded');
   }catch(error){
    if(url)URL.revokeObjectURL(url);
    if(token===listToken&&root.contains(el)){
     el.classList.add('skill-art-row-error');
     el.title='Ikonen kunde inte laddas';
    }
   }finally{loading.delete(el)}
  }
  if(typeof IntersectionObserver==='function'){
   listObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     listObserver?.unobserve(entry.target);
     void loadThumb(entry.target);
    }
   },{rootMargin:'180px 100px'});
   nodes.forEach(el=>listObserver.observe(el));
  }else{
   nodes.forEach(el=>{void loadThumb(el)});
  }
 }
 function slot(kind){
  return document.querySelector('#adminEditor .skill-art-slot[data-kind="'+kind+'"]');
 }
 function status(kind,message){
  const el=slot(kind)?.querySelector('.skill-art-status');if(el)el.textContent=message||'';
 }
 function busy(kind,on){
  const el=slot(kind);
  if(!el)return;
  for(const input of el.querySelectorAll('input,button'))input.disabled=on;
  if(!on){
   const remove=el.querySelector('button');
   if(remove)remove.disabled=!validPath(getRow(editorId)?.[TYPES[kind].column],editorId,kind);
  }
 }
 function release(){
  for(const url of previews.values())URL.revokeObjectURL(url);
  previews.clear();
 }
 function closeEditor(){generation++;editorId='';release()}
 function hydrate(id){
  closeEditor();if(!SLUG.test(String(id||'')))return;
  editorId=id;const token=generation,row=getRow(id);
  for(const kind of Object.keys(TYPES)){
   const path=row?.[TYPES[kind].column];
   if(validPath(path,id,kind))void loadImage(id,kind,path,token);
  }
 }
 async function loadImage(id,kind,path,token){
  if(!validPath(path,id,kind))return;
  let url='';
  try{
   const response=await mapStorageFetch('object/'+(HERMES_ICON.test(path)?HERMES_BUCKET:BUCKET)+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'GET'});
   if(!response.ok)throw new Error('Bildhämtning misslyckades ('+response.status+').');
   const blob=await response.blob();
   if(!blob.size||!blob.type.startsWith('image/'))throw new Error('Ogiltiga bilddata.');
   url=URL.createObjectURL(blob);
   if(token!==generation||editorId!==id){URL.revokeObjectURL(url);return}
   const pane=slot(kind),host=pane?.querySelector('.skill-art-preview');
   if(!host){URL.revokeObjectURL(url);return}
   const previous=previews.get(kind);if(previous)URL.revokeObjectURL(previous);
   previews.set(kind,url);
   const img=document.createElement('img');
   img.alt=TYPES[kind].title+' för '+(getRow(id)?.name||id);img.decoding='async';
   img.src=url;host.replaceChildren(img);
  }catch(error){
   if(url)URL.revokeObjectURL(url);
   if(token===generation&&editorId===id)status(kind,'Kunde inte visa bilden: '+error.message);
  }
 }
 async function inspect(file,kind){
  if(!file||!Object.prototype.hasOwnProperty.call(TYPES,kind))throw Error('Ogiltig bildtyp.');
  if(!TYPES[kind].accept.split(',').includes(file.type)||file.size<1||file.size>MAX_BYTES)
   throw Error(kind==='icon'?'Välj PNG eller WebP, högst 16 MB.':'Välj PNG, JPG eller WebP, högst 16 MB.');
  let temp=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Bilden går inte att läsa.'));img.src=temp});
   const w=img.naturalWidth,h=img.naturalHeight;
   if(!w||!h||w!==h||w*h>50000000)throw Error('Bilden måste vara kvadratisk (1:1) och högst 50 megapixel.');
   if(kind==='icon'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=48;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('Kan inte kontrollera transparensen.');
    ctx.drawImage(img,0,0,48,48);
    const corners=[[0,0],[47,0],[0,47],[47,47]];
    if(corners.some(([x,y])=>ctx.getImageData(x,y,1,1).data[3]>24))
     throw Error('Ikonen måste ha äkta transparens utanför den runda ramen (inte vit, svart eller schackrutig bakgrund).');
   }
   return {width:w,height:h};
  }finally{URL.revokeObjectURL(temp)}
 }
 async function upload(event,id,kind){
  const input=event?.target,file=input?.files?.[0];if(input)input.value='';
  if(!file||!SLUG.test(String(id))||!TYPES[kind]||!isAdmin()||!getRow(id))return;
  const key=id+':'+kind;if(pending.has(key))return;
  pending.add(key);busy(kind,true);status(kind,'Kontrollerar och laddar upp bilden…');
  const token=generation;
  try{
   const info=await inspect(file,kind);
   if(!crypto?.randomUUID)throw Error('Webbläsaren saknar säker filidentifiering.');
   const path='skill/'+id+'/'+kind+'/'+crypto.randomUUID()+'.'+MIME_EXT[file.type];
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file
   });
   if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw Error(data?.message||data?.error||'Bilduppladdningen misslyckades ('+response.status+').');
   }
   const column=TYPES[kind].column;
   await dbJson('rule_skills?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({[column]:path})
   }).then(rows=>{if(!Array.isArray(rows)||rows.length!==1)throw Error('Färdighetskopplingen kunde inte verifieras.')});
   const row=getRow(id);if(row)row[column]=path;
   try{await loadRuleSkills(true);renderAdminSkills()}catch(refreshError){console.warn('Färdighetslistan kunde inte uppdateras',refreshError)}
   if(token===generation&&editorId===id){
    const pane=slot(kind);if(pane){const button=pane.querySelector('.skill-art-upload');if(button)button.firstChild.textContent=' Byt bild';const remove=pane.querySelector('button');if(remove)remove.disabled=false}
    await loadImage(id,kind,path,token);
    status(kind,'✓ Sparad '+info.width+' × '+info.height+' px. '+TYPES[kind].title+' är kopplad till färdigheten.');
   }
  }catch(error){if(token===generation&&editorId===id)status(kind,'Uppladdningen misslyckades: '+(error.message||error))}
  finally{pending.delete(key);if(token===generation&&editorId===id)busy(kind,false)}
 }
 async function remove(id,kind){
  if(!SLUG.test(String(id))||!TYPES[kind]||!isAdmin()||!getRow(id))return;
  const key=id+':'+kind;if(pending.has(key)||!confirm('Ta bort kopplingen till '+TYPES[kind].title+'? Den tidigare filen behålls för säkerhet.'))return;
  pending.add(key);busy(kind,true);status(kind,'Tar bort bildkopplingen…');
  try{
   const column=TYPES[kind].column;
   const rows=await dbJson('rule_skills?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({[column]:null})});
   if(!Array.isArray(rows)||rows.length!==1)throw Error('Färdighetskopplingen kunde inte verifieras.');
   const row=getRow(id);if(row)row[column]=null;
   try{await loadRuleSkills(true);renderAdminSkills()}catch(e){console.warn(e)}
   const host=slot(kind)?.querySelector('.skill-art-preview');
   if(host){const old=previews.get(kind);if(old)URL.revokeObjectURL(old);previews.delete(kind);host.innerHTML='<span class="skill-art-placeholder">Ingen bild uppladdad</span>'}
   const pane=slot(kind);if(pane){const button=pane.querySelector('.skill-art-upload');if(button)button.firstChild.textContent=' Ladda upp bild'}
   status(kind,'✓ Bildkopplingen borttagen. Originalfilen finns kvar.');
  }catch(error){status(kind,'Kunde inte ta bort bildkopplingen: '+(error.message||error))}
  finally{pending.delete(key);busy(kind,false);const pane=slot(kind);if(pane){const remove=pane.querySelector('button');if(remove)remove.disabled=!validPath(getRow(id)?.[TYPES[kind].column],id,kind)}}
 }
 window.aleaSkillArt={editorHtml:html,hydrate,closeEditor,upload,remove,validPath,listIconHtml,hydrateList,releaseList};
})();
