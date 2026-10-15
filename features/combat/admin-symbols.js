/* Symbolism admin — HERMES 1 and HERMES 2 paths, real image-load status.
 * A syntactically valid path is never treated as proof that a file exists.
 */
(function(){
 'use strict';
 const host=document.getElementById('adminMagicSymbolTable');
 const status=document.getElementById('adminMagicSymbolStatus');
 const section=host?.closest('[data-admin-section="spells"]');
 if(!host||!section)return;
 const LEGACY=/^assets\/spells\/arcane-ivory\/[a-z0-9-]+\.webp$/;
 const HERMES=/^hermes\/symbol\/[a-z0-9-]+\/[a-f0-9]{64}\.webp$/;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let pending=false,lastLoaded=0;
 const visible=()=>!section.classList.contains('hidden');
 function valid(path,key){
  return (LEGACY.test(path)&&path==='assets/spells/arcane-ivory/'+key+'.webp')||
   (HERMES.test(path)&&path.split('/')[2]===key);
 }
 function src(path){return LEGACY.test(path)?'./'+path:SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+path}
 async function render(){
  if(!visible()||pending||Date.now()-lastLoaded<60000)return;
  if(typeof dbJson!=='function')return;
  pending=true;
  if(status)status.textContent='Laddar magiska symboler…';
  try{
   const rows=await dbJson('rule_magic_symbols?select=id,symbol_key,name,school_value,icon_path&order=sort_order.asc,name.asc');
   if(!Array.isArray(rows))throw Error('Ogiltigt registersvar');
   host.replaceChildren();
   let loaded=0,failed=0;
   const report=()=>{if(status)status.textContent=rows.length+' symboler · '+loaded+' laddade bilder'+(failed?' · '+failed+' kunde inte laddas':'')};
   for(const row of rows){
    const key=String(row.symbol_key||''),path=String(row.icon_path||''),hasPath=valid(path,key);
    const line=document.createElement('div');line.className='admin-symbol-row';line.dataset.symbolKey=key;
    const art=document.createElement('div');art.className='admin-symbol-art is-missing';
    const placeholder=document.createElement('span');placeholder.className='admin-symbol-placeholder';placeholder.setAttribute('aria-hidden','true');placeholder.textContent='✧';
    const text=document.createElement('div');text.className='admin-symbol-text';
    const title=document.createElement('strong');title.textContent=row.name||key;
    const school=document.createElement('small');school.textContent='Skolvärde '+(row.school_value??'—');
    text.append(title,school);
    const state=document.createElement('span');state.className='admin-symbol-state';state.textContent=hasPath?'Laddar…':'Ingen ikon';
    art.appendChild(placeholder);line.append(art,text,state);host.appendChild(line);
    if(hasPath){
     const img=document.createElement('img');img.loading='eager';img.decoding='async';img.alt='Sigill för '+row.name;
     const success=()=>{if(!img.isConnected||state.dataset.finished)return;state.dataset.finished='1';art.classList.remove('is-missing');art.classList.add('has-icon');state.textContent='Visas';loaded++;report()};
     const failure=()=>{if(!img.isConnected||state.dataset.finished)return;state.dataset.finished='1';art.classList.add('is-missing');state.textContent='Bild saknas';failed++;report()};
     img.addEventListener('load',success,{once:true});img.addEventListener('error',failure,{once:true});
     art.insertBefore(img,placeholder);img.src=src(path);
     if(img.complete){if(img.naturalWidth)success();else failure()}
    }
   }
   report();
   lastLoaded=Date.now();
  }catch(error){if(status)status.textContent='Symbolism kunde inte läsas: '+(error?.message||error)}
  finally{pending=false}
 }
 const observer=new MutationObserver(()=>{if(visible())void render()});
 observer.observe(section,{attributes:true,attributeFilter:['class']});
 if(visible())void render();
 window.aleaMagicSymbolsAdmin={refresh:()=>{lastLoaded=0;return render()}};
})();
