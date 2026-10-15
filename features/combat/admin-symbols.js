/* Alea Crusaders — read-only Symbolism master art in Besvärjelser admin.
 * Kept separate from rule_spells: this is the Magiboken Symbolism register.
 * Do not change ritual or spell mechanics.
 */
(function(){
 'use strict';
 const host=document.getElementById('adminMagicSymbolTable');
 const status=document.getElementById('adminMagicSymbolStatus');
 const section=host?.closest('[data-admin-section="spells"]');
 if(!host||!section)return;
 const SAFE_ICON=/^assets\/spells\/arcane-ivory\/[a-z0-9-]+\.webp$/;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 let pending=false,lastLoaded=0;
 const visible=()=>!section.classList.contains('hidden');
 async function render(){
  if(!visible()||pending||Date.now()-lastLoaded<60000)return;
  if(typeof dbJson!=='function')return;
  pending=true;
  if(status)status.textContent='Laddar magiska symboler…';
  try{
   const rows=await dbJson('rule_magic_symbols?select=id,symbol_key,name,school_value,icon_path&order=sort_order.asc,name.asc');
   if(!Array.isArray(rows))throw Error('Ogiltigt registersvar');
   host.innerHTML=rows.map(row=>{
    const key=String(row.symbol_key||''),path=String(row.icon_path||'');
    const valid=SAFE_ICON.test(path)&&path.endsWith('/'+key+'.webp');
    const thumb=valid?'<img loading="eager" decoding="async" src="./'+esc(path)+'" alt="Sigill för '+esc(row.name)+'" onerror="this.hidden=true;this.parentNode.classList.add(\'is-missing\')">':'';
    return '<div class="admin-symbol-row" data-symbol-key="'+esc(key)+'">'+
     '<div class="admin-symbol-art '+(valid?'has-icon':'is-missing')+'">'+thumb+'<span class="admin-symbol-placeholder" aria-hidden="true">✧</span></div>'+
     '<div class="admin-symbol-text"><strong>'+esc(row.name)+'</strong><small>Skolvärde '+esc(row.school_value)+'</small></div>'+
     '<span class="admin-symbol-state">'+(valid?'Ikon kopplad':'Ingen ikon')+'</span></div>';
   }).join('');
   if(status)status.textContent=rows.length+' symboler · '+rows.filter(x=>SAFE_ICON.test(String(x.icon_path||''))&&String(x.icon_path).endsWith('/'+x.symbol_key+'.webp')).length+' med ikon';
   lastLoaded=Date.now();
  }catch(error){
   if(status)status.textContent='Symbolism kunde inte läsas: '+(error?.message||error);
  }finally{pending=false}
 }
 const observer=new MutationObserver(()=>{if(visible())void render()});
 observer.observe(section,{attributes:true,attributeFilter:['class']});
 if(visible())void render();
 window.aleaMagicSymbolsAdmin={refresh:()=>{lastLoaded=0;return render()}};
})();