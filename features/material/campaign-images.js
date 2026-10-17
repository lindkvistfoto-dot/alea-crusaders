/* Campaign image library - shared campaign asset administration. */
(function(){
'use strict';
const types={place:['Platser','campaign_locations','name'],person:['Personer','campaign_npcs','name'],enemy:['Fiender','campaign_monsters','name'],event:['Händelser','campaign_events','name'],item:['Föremål','campaign_materials','title']};
const state={type:'place',target:'',images:[],links:[],targets:[],urls:[],search:''};
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=()=>String(centralCampaignId||'');
const host=()=>document.getElementById('campaignImageLibrary');
function notice(s){const el=document.getElementById('cilNotice');if(el)el.textContent=s}
function resetUrls(){state.urls.forEach(u=>URL.revokeObjectURL(u));state.urls=[]}
async function request(table,params=''){return dbJson(table+'?campaign_id=eq.'+encodeURIComponent(id())+'&'+params)}
async function refresh(){
 if(!host()||!id())return;
 notice('Läser bildbiblioteket …');
 try{
  const [images,links,targets,old]=await Promise.all([
   request('campaign_images','select=*&order=created_at.desc'),
   request('campaign_image_links','select=*&order=sort_order.asc'),
   request(types[state.type][1],'select=id,'+types[state.type][2]+'&order='+types[state.type][2]+'.asc'),
   state.type==='place'?request('campaign_location_assets','select=id,location_id,title,storage_path,sort_order,player_visible&asset_type=eq.image'):Promise.resolve([])
  ]);
  state.images=images||[];state.links=links||[];state.targets=targets||[];state.old=old||[];
  if(state.target&&!state.targets.some(t=>t.id===state.target))state.target='';
  render();
 }catch(err){notice('Kunde inte läsa biblioteket: '+err.message)}
}
function imageOf(link){return state.images.find(i=>i.id===link.image_id)}
function markupLink(link){
 const img=imageOf(link);if(!img)return '';
 const primary=link.is_primary?'★ Huvudbild':'Stödbild';
 return '<article class="cil-card" data-link="'+e(link.id)+'"><div class="cil-preview" data-preview="'+e(img.id)+'">Laddar bild …</div><strong>'+e(img.title)+'</strong><small>'+e(primary)+'</small><label>Bildtext<input class="cil-caption" value="'+e(link.caption)+'"></label><div class="cil-actions"><button data-command="primary">★ Huvudbild</button><button data-command="up">↑</button><button data-command="down">↓</button><button data-command="visible">'+(link.player_visible?'👁 Spelarsynlig':'🔒 SL-bild')+'</button><button data-command="unlink">Ta bort koppling</button></div></article>';
}
function render(){
 const targets=state.targets.filter(t=>String(t[types[state.type][2]]||'').toLowerCase().includes(state.search.toLowerCase()));
 const selected=state.links.filter(l=>l.object_type===state.type&&l.object_id===state.target).sort((a,b)=>a.sort_order-b.sort_order);
 const linked=new Set(selected.map(l=>l.image_id));
 const available=state.images.filter(i=>!linked.has(i.id));
 const old=state.old.filter(i=>i.location_id===state.target);
 host().innerHTML='<div class="cil-heading"><div><h3>Kampanjens bildbibliotek</h3><p>Gemensamma bilder för platser, personer, fiender, händelser och föremål.</p></div><button id="cilReload">Uppdatera</button></div><div class="cil-layout"><aside><label>Kategori<select id="cilType">'+Object.entries(types).map(([key,v])=>'<option value="'+key+'" '+(key===state.type?'selected':'')+'>'+v[0]+'</option>').join('')+'</select></label><label>Sök objekt<input id="cilSearch" placeholder="Sök namn" value="'+e(state.search)+'"></label><div class="cil-targets">'+targets.map(t=>'<button class="'+(state.target===t.id?'selected':'')+'" data-target="'+e(t.id)+'">'+e(t[types[state.type][2]]||'Namnlös')+'</button>').join('')+'</div></aside><main><p id="cilNotice" role="status"></p>'+(state.target?'<div class="cil-toolbar"><b>'+e(state.targets.find(t=>t.id===state.target)?.[types[state.type][2]]||'Objekt')+'</b><label class="cil-upload">+ Ladda upp bilder<input id="cilFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple></label></div><div class="cil-grid">'+selected.map(markupLink).join('')+'</div><h4>Koppla befintlig bild</h4><div class="cil-add"><select id="cilExisting"><option value="">Välj en bild …</option>'+available.map(i=>'<option value="'+e(i.id)+'">'+e(i.title)+'</option>').join('')+'</select><button id="cilLink">Koppla</button></div>'+(old.length?'<h4>Äldre platsbilder ('+old.length+')</h4><p>De här visas fortfarande av gamla platsvyn. Kopiera dem till det nya biblioteket utan att ta bort originalen.</p><button id="cilMigrate">Importera äldre platsbilder</button>':''):'<p>Välj ett objekt till vänster för att hantera dess bilder.</p>')+'</main></div>';
 wire();loadPreviews(selected);
}
async function loadPreviews(links){
 resetUrls();
 await Promise.all(links.map(async link=>{
  const img=imageOf(link);if(!img)return;
  const el=host()?.querySelector('[data-preview="'+img.id+'"]');if(!el)return;
  try{
   const r=await locationAssetStorageFetch('object/'+img.storage_bucket+'/'+encodeStoragePath(img.storage_path),{method:'GET'});
   if(!r.ok)throw Error('Bild saknas');
   const url=URL.createObjectURL(await r.blob());state.urls.push(url);
   if(el.isConnected){const node=document.createElement('img');node.src=url;node.alt=img.title;el.replaceChildren(node)}
  }catch(err){if(el.isConnected)el.textContent='Förhandsvisning saknas'}
 }));
}
async function mutate(table,query,body,method='PATCH'){
 await dbJson(table+query,{method,body:JSON.stringify(body)});
 await refresh();
}
async function action(linkId,command,card){
 const link=state.links.find(l=>l.id===linkId);if(!link)return;
 try{
  if(command==='unlink'){
   if(!confirm('Ta bort bildens koppling till objektet? Bildfilen behålls.'))return;
   await dbJson('campaign_image_links?id=eq.'+encodeURIComponent(linkId),{method:'DELETE'});return refresh();
  }
  if(command==='visible')return mutate('campaign_image_links','?id=eq.'+linkId,{player_visible:!link.player_visible});
  if(command==='primary'){
   const others=state.links.filter(l=>l.object_type===state.type&&l.object_id===state.target&&l.is_primary&&l.id!==linkId);
   for(const other of others)await dbJson('campaign_image_links?id=eq.'+other.id,{method:'PATCH',body:JSON.stringify({is_primary:false})});
   return mutate('campaign_image_links','?id=eq.'+linkId,{is_primary:true});
  }
  if(command==='up'||command==='down'){
   const list=state.links.filter(l=>l.object_type===state.type&&l.object_id===state.target).sort((a,b)=>a.sort_order-b.sort_order);
   const i=list.findIndex(l=>l.id===linkId),j=i+(command==='up'?-1:1);if(j<0||j>=list.length)return;
   await dbJson('campaign_image_links?id=eq.'+list[i].id,{method:'PATCH',body:JSON.stringify({sort_order:j})});
   await dbJson('campaign_image_links?id=eq.'+list[j].id,{method:'PATCH',body:JSON.stringify({sort_order:i})});return refresh();
  }
 }catch(err){notice(err.message)}
}
async function attach(imageId){
 if(!imageId||!state.target)return;
 const links=state.links.filter(l=>l.object_type===state.type&&l.object_id===state.target);
 await dbJson('campaign_image_links',{method:'POST',body:JSON.stringify({campaign_id:id(),image_id:imageId,object_type:state.type,object_id:state.target,sort_order:links.length,is_primary:!links.length,player_visible:false})});
 await refresh();
}
async function upload(files){
 if(!files.length||!state.target)return;
 const target=state.target;
 for(const file of files){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){notice('Endast PNG, JPEG och WebP upp till 20 MB stöds.');continue}
  const path=id()+'/library/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const bucket='campaign-location-assets';
  try{
   const res=await locationAssetStorageFetch('object/'+bucket+'/'+encodeStoragePath(path),{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
   if(!res.ok)throw Error('Bilduppladdning misslyckades ('+res.status+')');
   const rows=await dbJson('campaign_images',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({campaign_id:id(),title:file.name.replace(/\.[^.]+$/,''),storage_bucket:bucket,storage_path:path,mime_type:file.type,source:'upload'})});
   if(!rows?.[0]?.id)throw Error('Bilden laddades upp men registrerades inte – kontrollera biblioteket');
   await attach(rows[0].id);
  }catch(err){notice('Fel för '+file.name+': '+err.message)}
 }
 await refresh();
}
async function migrateOld(){
 const old=state.old.filter(i=>i.location_id===state.target);
 for(const a of old){
  try{
   let image=state.images.find(i=>i.storage_bucket==='campaign-location-assets'&&i.storage_path===a.storage_path);
   if(!image){const rows=await dbJson('campaign_images',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({campaign_id:id(),title:a.title||'Platsbild',storage_bucket:'campaign-location-assets',storage_path:a.storage_path,source:'legacy'})});image=rows?.[0]}
   if(image&&!state.links.some(l=>l.image_id===image.id&&l.object_type==='place'&&l.object_id===a.location_id)){
    await dbJson('campaign_image_links',{method:'POST',body:JSON.stringify({campaign_id:id(),image_id:image.id,object_type:'place',object_id:a.location_id,sort_order:a.sort_order||0,player_visible:!!a.player_visible,is_primary:(a.sort_order||0)===0&&!state.links.some(l=>l.is_primary&&l.object_id===a.location_id)})});
   }
  }catch(err){notice('Import av äldre bilder avbröts: '+err.message);break}
 }
 await refresh();
}
function wire(){
 host().querySelector('#cilType').onchange=ev=>{state.type=ev.target.value;state.target='';state.search='';refresh()};
 host().querySelector('#cilSearch').oninput=ev=>{state.search=ev.target.value;const q=state.search.toLowerCase();host().querySelectorAll('[data-target]').forEach(b=>{b.hidden=!b.textContent.toLowerCase().includes(q)})};
 host().querySelector('#cilReload').onclick=refresh;
 host().querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{state.target=b.dataset.target;render()});
 host().querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>action(b.closest('[data-link]').dataset.link,b.dataset.command,b.closest('[data-link]')));
 host().querySelectorAll('.cil-caption').forEach(el=>el.onchange=async()=>{try{await mutate('campaign_image_links','?id=eq.'+el.closest('[data-link]').dataset.link,{caption:el.value})}catch(err){notice(err.message)}});
 const files=host().querySelector('#cilFiles');if(files)files.onchange=ev=>upload([...ev.target.files]);
 const link=host().querySelector('#cilLink');if(link)link.onclick=async()=>{try{await attach(host().querySelector('#cilExisting').value)}catch(err){notice(err.message)}};
 const migrate=host().querySelector('#cilMigrate');if(migrate)migrate.onclick=migrateOld;
}
window.openCampaignImageLibrary=async function(type,target){
 if(typeof activeUser!=='function'||!activeUser()?.admin)return;
 await openAdminSection('overview');
 document.getElementById('adminOverview')?.classList.add('hidden');
 document.querySelectorAll('#admin .admin-detail').forEach(el=>el.classList.add('hidden'));
 document.getElementById('adminOverviewBtn')?.classList.remove('hidden');
 const h=document.getElementById('adminPageTitle');if(h)h.textContent='Kampanjens bildbibliotek';
 const sub=document.getElementById('adminPageSubtitle');if(sub)sub.textContent='Alla kampanjbilder på ett ställe';
 host().classList.remove('hidden');
 state.type=types[type]?type:'place';state.target=target||'';state.search='';
 await refresh();
};
const oldOpen=window.openAdminSection;
window.openAdminSection=async function(key,...rest){
 if(key==='images')return window.openCampaignImageLibrary();
 host()?.classList.add('hidden');
 return oldOpen.apply(this,[key,...rest]);
};
})();