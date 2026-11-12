/* Admin workbench for reusable, HERMES-backed Battlefield Library objects. */
(() => {
 'use strict';
 const root=globalThis, $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const edges=[0,1,2,3,4,5];
 let records=[],assets=new Map(),selectedKey='',rotation=0,loading=false;
 function canAdmin(){return !!root.activeUser?.()?.admin}
 function status(message,error=false){const node=$('bfwStatus');if(node){node.textContent=message;node.classList.toggle('is-error',error)}}
 function imageUrl(assetKey){const path=assets.get(assetKey);if(!path||typeof root.SUPABASE_URL!=='string')return '';return root.SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+path.split('/').map(encodeURIComponent).join('/')}
 function current(){return records.find(row=>row.object_key===selectedKey)||null}
 function loadForm(row){
  selectedKey=row?.object_key||'';rotation=0;
  render();
  $('bfwName').value=row?.name||'';$('bfwKey').value=row?.object_key||'';$('bfwCategory').value=row?.category||'Murar';
  $('bfwAssetKey').value=row?.asset_key||'arcane-battlefield-wall-prototype';$('bfwDescription').value=row?.description||'';
  $('bfwMovement').value=row?.movement_mode||'blocked';$('bfwSight').value=row?.sight_mode||'blocked';
  $('bfwDamage').checked=row?.max_damage!=null;$('bfwMaxDamage').value=row?.max_damage??10;
  edges.forEach(edge=>{const box=$('bfwEdge'+edge);if(box)box.checked=(row?.connector_edges||[0,3]).includes(edge)});
  render();
 }
 function previewMarkup(row){
  const key=$('bfwAssetKey')?.value.trim()||row?.asset_key||'',url=imageUrl(key),activeEdges=edges.filter(edge=>$('bfwEdge'+edge)?.checked);
  const cells=[0,1,2].map(index=>{
   const direction=rotation*Math.PI/3,cx=150+(index-1)*69.3*Math.cos(direction),cy=110+(index-1)*69.3*Math.sin(direction),r=40,pts=edges.map(n=>{const a=(n*60-30)*Math.PI/180;return (cx+Math.cos(a)*r)+','+(cy+Math.sin(a)*r)}).join(' '),clip='bfwhex'+index;
   const art=url?'<image href="'+esc(url)+'" x="'+(cx-r)+'" y="'+(cy-r)+'" width="'+(2*r)+'" height="'+(2*r)+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clip+')" transform="rotate('+rotation+' '+cx+' '+cy+')"/>':'<polygon points="'+pts+'" fill="#342d22"/>';
   const marks=activeEdges.map(edge=>{const a=((edge+rotation)*60-30)*Math.PI/180;return '<circle cx="'+(cx+Math.cos(a)*r*.86)+'" cy="'+(cy+Math.sin(a)*r*.86)+'" r="3.5" class="bfw-connector"/>'}).join('');
   return '<clipPath id="'+clip+'"><polygon points="'+pts+'"/></clipPath>'+art+'<polygon points="'+pts+'" class="bfw-hex-outline"/>'+marks;
  }).join('');
  return '<svg viewBox="0 0 300 220" role="img" aria-label="Tre sammanfogade mursegment, ett hex per segment"><defs>'+cells.match(/<clipPath[\s\S]*?<\/clipPath>/g)?.join('')+'</defs>'+cells.replace(/<clipPath[\s\S]*?<\/clipPath>/g,'')+'</svg>';
 }
 function render(){
  const mount=$('battlefieldObjectWorkshopMount');if(!mount)return;
  const name=$('bfwName')?.value||'',key=$('bfwKey')?.value||'',assetKey=$('bfwAssetKey')?.value||'',row=current(),url=imageUrl(assetKey);
  const list=records.map(item=>'<button class="bfw-library-row'+(item.object_key===selectedKey?' selected':'')+'" type="button" data-bfw-select="'+esc(item.object_key)+'"><span><b>'+esc(item.name)+'</b><small>'+esc(item.object_key)+' · '+esc(item.category)+(item.active?'':' · inaktiv')+'</small></span><span>'+((item.footprint||[]).length)+' hex</span></button>').join('');
  const edgeControls=edges.map(edge=>'<label><input id="bfwEdge'+edge+'" type="checkbox" '+(([0,3].includes(edge)&&!row)||row?.connector_edges?.includes(edge)?'checked':'')+'><span>Sida '+(edge+1)+'</span></label>').join('');
  mount.innerHTML='<div class="bfw-head"><div><div class="bfw-kicker">ARCANE · BATTLEFIELD</div><h2>Objektverkstad</h2><p>Skapa återanvändbara kartobjekt till Battlefield Library. Ett segment förankras i ett hex; anslutningssidorna anger hur segment kan byggas vidare.</p></div><span class="bfw-status-pill">Adminverktyg</span></div>'+
   '<div class="bfw-layout"><aside class="bfw-library"><div class="bfw-section-head"><h3>Battlefield Library</h3><button type="button" class="smallbtn" data-bfw-new>+ Nytt objekt</button></div>'+(list||'<p class="bfw-empty">Biblioteket är tomt.</p>')+'</aside>'+
   '<section class="bfw-editor"><div class="bfw-section-head"><h3>'+(row?'Redigera objekt':'Nytt bibliotekobjekt')+'</h3><span class="bfw-key-preview">'+esc(key||'nytt-objekt')+'</span></div>'+
   '<div class="bfw-object-preview"><div class="bfw-source-art">'+(url?'<img src="'+esc(url)+'" alt="Prototypbild: '+esc(name||'mur')+'">':'<div class="bfw-no-art"><b>Bild saknas i DEV</b><span>Publicera asset_key via HERMES CORE för att visa originalbilden här.</span></div>')+'</div><div class="bfw-assembly-preview"><div id="bfwAssemblyVisual">'+previewMarkup(row)+'</div><b>Förhandsvisning · tre sammanfogade segment</b><small>Varje segment täcker 1 hex. Gyllene markörer visar öppna anslutningssidor.</small></div></div>'+
   '<div class="bfw-fields"><label>Namn<input id="bfwName" value="'+esc(row?.name||'Mursegment · prototyp')+'" maxlength="80"></label><label>Objektnyckel<input id="bfwKey" value="'+esc(row?.object_key||'wall-segment-prototype')+'" maxlength="80" '+(row?'readonly':'')+'></label><label>Kategori<input id="bfwCategory" value="'+esc(row?.category||'Murar')+'" maxlength="40"></label><label>HERMES CORE asset_key<input id="bfwAssetKey" value="'+esc(row?.asset_key||'arcane-battlefield-wall-prototype')+'" maxlength="100"></label></div>'+
   '<label class="bfw-description">Beskrivning<textarea id="bfwDescription" rows="2" maxlength="500">'+esc(row?.description||'Ett hexankrat mursegment som kan kopplas sida vid sida med likadana segment.')+'</textarea></label>'+
   '<div class="bfw-property-grid"><fieldset><legend>Spelavtryck</legend><div class="bfw-footprint-lock"><span class="bfw-one-hex">⬡</span><span><b>1 hex</b><small>Hexen är ankaret för placering och spelregler.</small></span></div></fieldset><fieldset><legend>Anslutningar · 6 sidor</legend><div class="bfw-edge-grid">'+edgeControls+'</div><div class="bfw-rotation"><button type="button" class="smallbtn" data-bfw-rotate="-1">↶ Rotera</button><span>'+rotation*60+'°</span><button type="button" class="smallbtn" data-bfw-rotate="1">Rotera ↷</button></div></fieldset><fieldset><legend>Stridsegenskaper</legend><label>Förflyttning<select id="bfwMovement"><option value="blocked" '+((row?.movement_mode||'blocked')==='blocked'?'selected':'')+'>Blockerad</option><option value="difficult" '+(row?.movement_mode==='difficult'?'selected':'')+'>Svår</option><option value="free" '+(row?.movement_mode==='free'?'selected':'')+'>Fri</option></select></label><label>Sikt<select id="bfwSight"><option value="blocked" '+((row?.sight_mode||'blocked')==='blocked'?'selected':'')+'>Blockerad</option><option value="obscuring" '+(row?.sight_mode==='obscuring'?'selected':'')+'>Skymd</option><option value="clear" '+(row?.sight_mode==='clear'?'selected':'')+'>Fri</option></select></label><label class="bfw-damage"><input id="bfwDamage" type="checkbox" '+(row?.max_damage!=null?'checked':'')+'> Kan ta skada <input id="bfwMaxDamage" type="number" min="1" value="'+esc(row?.max_damage??10)+'" aria-label="Maximal skada"></label></fieldset></div>'+
   '<div class="bfw-actions"><button type="button" class="btn" data-bfw-toggle '+(row?'':'disabled')+'>'+(row?.active?'Avaktivera i biblioteket':'Aktivera i biblioteket')+'</button><button type="button" class="btn primary" data-bfw-save>'+ (row?'Spara ändringar':'Skapa objekt i Battlefield Library')+'</button><button type="button" class="smallbtn" data-bfw-reset>Återställ</button></div><p id="bfwStatus" class="bfw-status" role="status">'+(url?'Klar att redigera.':'Bildnyckeln inväntar DEV-publicering via HERMES CORE.')+'</p></section></div>';
  mount.querySelectorAll('[data-bfw-select]').forEach(button=>button.addEventListener('click',()=>loadForm(records.find(item=>item.object_key===button.dataset.bfwSelect))));
  mount.querySelector('[data-bfw-new]')?.addEventListener('click',()=>loadForm(null));
  mount.querySelector('[data-bfw-save]')?.addEventListener('click',save);
  mount.querySelector('[data-bfw-toggle]')?.addEventListener('click',toggleActive);
  mount.querySelector('[data-bfw-reset]')?.addEventListener('click',()=>loadForm(current()));
  mount.querySelectorAll('[data-bfw-rotate]').forEach(button=>button.addEventListener('click',()=>{rotation=(rotation+Number(button.dataset.bfwRotate)+6)%6;render()}));
  mount.querySelectorAll('#bfwAssetKey,#bfwEdge0,#bfwEdge1,#bfwEdge2,#bfwEdge3,#bfwEdge4,#bfwEdge5').forEach(input=>input.addEventListener('input',()=>{const visual=$('bfwAssemblyVisual');if(visual)visual.innerHTML=previewMarkup(current())}));
 }
 async function load(){
  if(!canAdmin())throw new Error('Endast administratörer kan öppna objektverkstaden.');
  records=await root.dbJson('arcane_battlefield_library?select=*&order=category.asc,name.asc')||[];
  const keys=[...new Set(records.map(row=>row.asset_key).filter(Boolean))];
  if(keys.length){const rows=await root.dbJson('arcane_system_assets?asset_key=in.('+keys.map(encodeURIComponent).join(',')+')&select=asset_key,asset_path');assets=new Map((rows||[]).filter(row=>/^hermes\/system-asset\/arcane-battlefield-[a-z0-9-]+\/[a-f0-9]{64}\.webp$/.test(row.asset_path||'')).map(row=>[row.asset_key,row.asset_path]))}
  if(!selectedKey||!records.some(row=>row.object_key===selectedKey))selectedKey=records[0]?.object_key||'';
  loadForm(current());
 }
 async function save(){
  if(loading)return;const name=$('bfwName').value.trim(),key=$('bfwKey').value.trim(),assetKey=$('bfwAssetKey').value.trim();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key))return status('Objektnyckeln ska vara en slug med små bokstäver, siffror och bindestreck.',true);
  if(!/^arcane-battlefield-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetKey))return status('Assetnyckeln följer inte HERMES CORE:s systemformat.',true);
  if(!name)return status('Ange ett namn för objektet.',true);
  const row={object_key:key,name,category:$('bfwCategory').value.trim()||'Objekt',asset_key:assetKey,description:$('bfwDescription').value.trim(),footprint:[{q:0,r:0}],connector_edges:edges.filter(edge=>$('bfwEdge'+edge).checked),movement_mode:$('bfwMovement').value,sight_mode:$('bfwSight').value,movement_cost:$('bfwMovement').value==='difficult'?2:1,max_damage:$('bfwDamage').checked?Math.max(1,Number($('bfwMaxDamage').value)||10):null,active:true,updated_at:new Date().toISOString()};
  loading=true;status('Sparar objekt…');
  try{const result=await root.dbJson('arcane_battlefield_library?on_conflict=object_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});if(!Array.isArray(result)||!result.some(saved=>saved.object_key===key))throw new Error('Objektet kunde inte läsas tillbaka efter sparning.');records=records.filter(item=>item.object_key!==key).concat(result[0]);selectedKey=key;status('Objektet sparades i Battlefield Library.');render();await root.aleaBattlefieldLibraryReload?.()}
  catch(error){status('Kunde inte spara: '+(error?.message||error),true)}finally{loading=false}
 }
 async function toggleActive(){const row=current();if(!row||loading)return;loading=true;try{const saved=await root.dbJson('arcane_battlefield_library?object_key=eq.'+encodeURIComponent(row.object_key)+'&select=*',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({active:!row.active,updated_at:new Date().toISOString()})});if(!saved?.length)throw new Error('Objektet kunde inte uppdateras.');records=records.map(item=>item.object_key===row.object_key?saved[0]:item);render();status(saved[0].active?'Objektet är aktivt i biblioteket.':'Objektet är avaktiverat; placerade instanser finns kvar.');await root.aleaBattlefieldLibraryReload?.() }catch(error){status(error?.message||'Kunde inte ändra objektstatus.',true)}finally{loading=false}}
 async function mount(){const mountPoint=$('battlefieldObjectWorkshopMount');if(!mountPoint)return;if(!canAdmin()){mountPoint.innerHTML='<p>Endast administratörer har åtkomst.</p>';return}mountPoint.innerHTML='<p class="bfw-status">Läser Battlefield Library…</p>';try{await load()}catch(error){mountPoint.innerHTML='<p class="bfw-status is-error">Verkstaden kunde inte laddas: '+esc(error?.message||error)+'</p>'}}
 root.aleaBattlefieldObjectWorkshop=Object.freeze({mount});
})();
