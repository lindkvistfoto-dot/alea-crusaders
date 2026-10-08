/* Aragorn v0.34.83 — campaign-scoped material links, no file copies. */
export const ARAGORN_ENTITY_TYPES=Object.freeze({
 location:{label:'Plats',table:'campaign_locations'},
 npc:{label:'SLP',table:'campaign_npcs'},
 monster:{label:'Monster',table:'campaign_monsters'},
 combat_scene:{label:'Stridsscen',table:'campaign_combat_scenes'}
});

export function createAragorn({getSelected,getCampaign,getGeneration,canManage,request,escape,notify,reload,doc=()=>document,confirmAction=message=>window.confirm(message)}){
 const state={links:[],targets:[],kind:'location',search:'',linkSeq:0,targetSeq:0,timer:null,busy:false,syncBusy:false};
 const el=id=>doc().getElementById(id);
 const active=(row,gen)=>Boolean(row&&canManage()&&row.id===getSelected()?.id&&row.campaign_id===getCampaign()&&gen===getGeneration());
 const encode=value=>encodeURIComponent(String(value));
 function status(message,error=false){
  const node=el('aragornLinkStatus');
  if(node){node.textContent=message;node.classList.toggle('is-error',error);}
 }
 function clear(){
  state.linkSeq++;state.targetSeq++;
  if(state.timer)clearTimeout(state.timer);
  state.timer=null;state.links=[];state.targets=[];state.search='';
 }
 function html(){
  return '<section class="aragorn-links" aria-label="Materialkopplingar">'+
    '<h4>Kopplade platser och personer</h4>'+
    '<p class="aragorn-help">En bild kan kopplas till flera objekt. Kopplingar ändrar inte originalbilden.</p>'+
    '<div id="aragornLinkedList" class="aragorn-linked-list" aria-live="polite">Hämtar kopplingar…</div>'+
    '<div class="aragorn-link-controls">'+
     '<label>Typ<select id="aragornTargetType" onchange="aragornSetTargetType(this.value)">'+
      Object.entries(ARAGORN_ENTITY_TYPES).map(([type,def])=>'<option value="'+type+'"'+(state.kind===type?' selected':'')+'>'+def.label+'</option>').join('')+
     '</select></label>'+
     '<label>Sök objekt<input id="aragornTargetSearch" type="search" maxlength="80" placeholder="Sök på namn…" oninput="aragornSearchTargets(this.value)"></label>'+
     '<label class="aragorn-target-label">Välj objekt<select id="aragornTargetSelect" aria-label="Välj objekt"><option value="">Hämtar objekt…</option></select></label>'+
     '<button type="button" class="btn primary" id="aragornLinkButton" onclick="aragornLink()">Koppla bild</button>'+
    '</div><p id="aragornLinkStatus" role="status" aria-live="polite"></p></section>';
 }
 function renderLinks(){
  const box=el('aragornLinkedList');if(!box)return;
  box.innerHTML=state.links.length?state.links.map(link=>
   '<div class="aragorn-linked-item"><span><b>'+escape(link.name)+'</b><small>'+
    escape(ARAGORN_ENTITY_TYPES[link.entity_type]?.label||link.entity_type)+'</small></span>'+
   '<button type="button" class="smallbtn" onclick="aragornUnlink(\''+escape(link.id)+'\')" aria-label="Koppla bort '+escape(link.name)+'">Koppla bort</button></div>'
  ).join(''):'<p class="aragorn-help">Inga kopplingar ännu.</p>';
 }
 async function loadLinks(row=getSelected(),gen=getGeneration()){
  if(!active(row,gen))return;
  const seq=++state.linkSeq;
  try{
   const response=await request('campaign_material_links?campaign_id=eq.'+encode(row.campaign_id)+
    '&material_id=eq.'+encode(row.id)+'&select=id,entity_type,entity_id&order=created_at.asc&limit=250');
   if(seq!==state.linkSeq||!active(row,gen))return;
   const links=(Array.isArray(response)?response:[]).filter(link=>Object.hasOwn(ARAGORN_ENTITY_TYPES,link.entity_type));
   const names=new Map();
   await Promise.all(Object.entries(ARAGORN_ENTITY_TYPES).map(async ([kind,def])=>{
    const ids=[...new Set(links.filter(link=>link.entity_type===kind).map(link=>link.entity_id))];
    if(!ids.length)return;
    const targets=await request(def.table+'?campaign_id=eq.'+encode(row.campaign_id)+
     '&id=in.('+ids.map(encode).join(',')+')&select=id,name&limit=250');
    for(const found of Array.isArray(targets)?targets:[])names.set(kind+':'+found.id,found.name);
   }));
   if(seq!==state.linkSeq||!active(row,gen))return;
   state.links=links.map(link=>({...link,name:names.get(link.entity_type+':'+link.entity_id)||'Borttaget objekt'}));
   renderLinks();
  }catch(error){
   if(seq===state.linkSeq&&active(row,gen)){
    const box=el('aragornLinkedList');if(box)box.textContent='Kunde inte läsa kopplingarna.';
    status(error.message,true);
   }
  }
 }
 function renderTargets(){
  const select=el('aragornTargetSelect');if(!select)return;
  select.innerHTML='<option value="">'+(state.targets.length?'Välj objekt…':'Inga objekt hittades')+'</option>'+
   state.targets.map(target=>'<option value="'+escape(target.id)+'">'+escape(target.name)+'</option>').join('');
 }
 async function loadTargets(row=getSelected(),gen=getGeneration()){
  if(!active(row,gen))return;
  const seq=++state.targetSeq,kind=state.kind,def=ARAGORN_ENTITY_TYPES[kind];
  const search=state.search.slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
  const extra=search?'&name=ilike.*'+encode(search)+'*':'';
  const select=el('aragornTargetSelect');if(select)select.innerHTML='<option value="">Hämtar objekt…</option>';
  try{
   const result=await request(def.table+'?campaign_id=eq.'+encode(row.campaign_id)+extra+
     '&select=id,name&order=name.asc&limit=100');
   if(seq!==state.targetSeq||kind!==state.kind||!active(row,gen))return;
   state.targets=(Array.isArray(result)?result:[]).filter(target=>target.id&&target.name);
   renderTargets();
  }catch(error){
   if(seq===state.targetSeq&&active(row,gen)){state.targets=[];renderTargets();status('Kunde inte hämta objekt: '+error.message,true);}
  }
 }
 function setType(kind){
  if(!Object.hasOwn(ARAGORN_ENTITY_TYPES,kind))return;
  state.kind=kind;state.search='';state.targets=[];
  const search=el('aragornTargetSearch');if(search)search.value='';
  if(state.timer)clearTimeout(state.timer);
  state.targetSeq++;loadTargets();
 }
 function searchTargets(value){
  state.search=String(value||'').slice(0,80);
  if(state.timer)clearTimeout(state.timer);
  state.targetSeq++;
  state.timer=setTimeout(()=>loadTargets(),220);
 }
 async function link(){
  const row=getSelected(),gen=getGeneration(),kind=state.kind;
  const entityId=el('aragornTargetSelect')?.value||'';
  if(!active(row,gen)||state.busy)return;
  if(!state.targets.some(target=>target.id===entityId)){
   status('Välj ett objekt i kampanjen.',true);return;
  }
  if(state.links.some(x=>x.entity_type===kind&&x.entity_id===entityId)){
   status('Bilden är redan kopplad till detta objekt.');return;
  }
  state.busy=true;const button=el('aragornLinkButton');if(button)button.disabled=true;
  try{
   await request('campaign_material_links?on_conflict=campaign_id,material_id,entity_type,entity_id',{
    method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({campaign_id:row.campaign_id,material_id:row.id,entity_type:kind,entity_id:entityId})
   });
   if(active(row,gen)){await loadLinks(row,gen);status('Kopplingen sparades. Originalbilden är oförändrad.');}
  }catch(error){if(active(row,gen))status('Kunde inte koppla bilden: '+error.message,true);}
  finally{state.busy=false;if(button)button.disabled=false;}
 }
 async function unlink(id){
  const row=getSelected(),gen=getGeneration();
  if(!active(row,gen)||state.busy)return;
  const linked=state.links.find(link=>link.id===id);
  if(!linked||!confirmAction('Koppla bort '+linked.name+'? Bilden finns kvar i biblioteket.'))return;
  state.busy=true;
  try{
   await request('campaign_material_links?id=eq.'+encode(linked.id)+'&campaign_id=eq.'+encode(row.campaign_id)+
    '&material_id=eq.'+encode(row.id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   if(active(row,gen)){await loadLinks(row,gen);status('Kopplingen borttagen. Bilden är kvar.');}
  }catch(error){if(active(row,gen))status('Kunde inte ta bort kopplingen: '+error.message,true);}
  finally{state.busy=false;}
 }
 async function sync(){
  const campaign=getCampaign();if(!canManage()||!campaign||state.syncBusy||state.busy)return;
  state.syncBusy=true;const button=el('aragornSyncButton');if(button)button.disabled=true;
  notify('Hämtar äldre kampanjbilder…');
  try{
   const result=await request('rpc/aragorn_sync_legacy_materials',{
    method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({p_campaign_id:campaign})
   });
   if(campaign!==getCampaign())return;
   await reload();
   notify('Synkroniserat: '+(Number(result?.added)||0)+' nya bilder, '+
    (Number(result?.links_added)||0)+' nya kopplingar. Inga filer kopierades.');
  }catch(error){if(campaign===getCampaign())notify('Synkronisering misslyckades: '+error.message,true);}
  finally{state.syncBusy=false;if(button)button.disabled=false;}
 }
 async function loadDetails(row,gen){return Promise.allSettled([loadLinks(row,gen),loadTargets(row,gen)]);}
 return {state,html,clear,loadDetails,loadLinks,loadTargets,setType,searchTargets,link,unlink,sync};
}
