/* v0.35.76 — shared equipment master for Admin, shop and carried hand items. */
(function(){
 'use strict';
 let rows=[],loaded=false,pending=null,saving=false;
 const byId=new Map(),byKey=new Map();
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const elem=id=>document.getElementById(id);
 const uuid=/^[0-9a-f-]{36}$/i;
 function index(){
  byId.clear();byKey.clear();
  for(const row of rows){byId.set(String(row.id),row);byKey.set(String(row.item_key),row)}
 }
 async function load(force=false){
  if(loaded&&!force)return rows;
  if(pending)return pending;
  pending=(async()=>{
   const result=await dbJson('rule_shop_items?select=*&order=category.asc,sort_order.asc,name.asc');
   rows=Array.isArray(result)?result:[];
   loaded=true;index();
   return rows
  })();
  try{return await pending}catch(error){console.warn('Kunde inte läsa utrustningsregister',error);throw error}
  finally{pending=null}
 }
 function get(item){
  if(!item)return null;
  const id=String(item.shopSourceId||item.sourceItemId||item.shopItemId||'');
  if(id&&byId.has(id))return byId.get(id);
  const key=String(item.shopItemKey||item.itemKey||item.item_key||'');
  if(key&&byKey.has(key))return byKey.get(key);
  // Old, manually entered inventory items can match by EXACT name only.
  const name=String(item.name||'').trim().toLocaleLowerCase('sv-SE');
  return rows.find(row=>row.purchase_kind==='equipment'&&row.name?.toLocaleLowerCase('sv-SE')===name)||null
 }
 function canCarry(item){
  const master=get(item);
  return !!master?.can_carry&&master.purchase_kind==='equipment';
 }
 function torchCount(character,item){
  const master=get(item);
  if(master?.item_key!=='torch')return null;
  return (Array.isArray(character?.equipment)?character.equipment:[])
   .filter(x=>get(x)?.item_key==='torch')
   .reduce((sum,x)=>sum+Math.max(0,Math.floor(Number(x.count??x.quantity??1)||0)),0)
 }
 function imagePath(item){return get(item)?.image_path||null}
 function render(){
  const el=elem('adminEquipmentTable'),status=elem('adminEquipmentStatus'),search=elem('adminEquipmentSearch');
  if(!el)return;
  const text=String(search?.value||'').toLocaleLowerCase('sv-SE').trim();
  const subset=rows.filter(r=>!text||[r.name,r.category,r.item_key,r.description].some(s=>String(s||'').toLocaleLowerCase('sv-SE').includes(text)));
  if(status)status.textContent=rows.length+' varor i gemensamma registret · '+rows.filter(r=>r.can_carry&&r.purchase_kind==='equipment').length+' kan bäras.';
  el.innerHTML='<div class="equipment-admin-header"><b>Bild / Namn</b><b>Kategori</b><b>BEP</b><b>Pris</b><b>Kan bäras</b><b>Magisk</b><b>Åtgärder</b></div>'+
   subset.map(r=>{
    const thumb=window.aleaEquipmentArt?.thumbnail(r.image_path,'<span class="equipment-admin-noart">◇</span>',r.name)||'<span class="equipment-admin-noart">◇</span>';
    return '<div class="equipment-admin-row'+(r.active?'':' inactive')+'">'+
     '<div class="equipment-admin-name">'+thumb+'<div><strong>'+safe(r.name)+'</strong><small>'+safe(r.item_key)+(r.active?'':' · Inaktiv')+'</small></div></div>'+
     '<span>'+safe(r.category)+'</span><span>'+safe(r.bep??'—')+'</span>'+
     '<span>'+safe(r.price_amount)+' '+safe(r.price_currency)+'</span>'+
     '<span class="equipment-admin-carry">'+(r.can_carry?'Ja':'—')+'</span>'+ 
     '<span class="admin-magical-cell">'+(r.is_magical?'✦ Ja':'—')+'</span>'+
     '<div class="equipment-admin-actions"><button type="button" class="smallbtn" onclick="editRuleEquipment(\''+safe(r.id)+'\')">Redigera</button>'+
     '<button type="button" class="deletebtn" title="Ta bort" onclick="deleteRuleEquipment(\''+safe(r.id)+'\')">×</button></div></div>'
   }).join('')+
   (!subset.length?'<p class="muted">Inga föremål matchar sökningen.</p>':'');
 }
 async function refresh(force=false){
  try{await load(force);render()}catch(e){if(elem('adminEquipmentStatus'))elem('adminEquipmentStatus').textContent='Kunde inte läsa utrustning: '+e.message}
 }
 function editor(id=''){
  if(!activeUser()?.admin)return;
  const r=id?byId.get(id):null;
  if(id&&!r)return;
  const categories=[...new Set(['Äventyr','Verktyg','Behållare','Kläder','Proviant','Vapentillbehör','Transport',...rows.map(x=>x.category)])];
  const kinds=['equipment','projectile','armor','shield','transport'];
  const kindsLabel={equipment:'Utrustning',projectile:'Projektiler',armor:'Rustning',shield:'Sköld',transport:'Transport'};
  const field=(label,input)=>'<label>'+label+input+'</label>';
  const option=(value,label,selected)=>'<option value="'+safe(value)+'"'+(value===selected?' selected':'')+'>'+safe(label)+'</option>';
  elem('adminEditorTitle').textContent=r?'Redigera utrustning':'Lägg till utrustning';
  elem('adminEditorBody').innerHTML='<div class="rule-editor-grid equipment-master-editor">'+
   field('Namn','<input id="reiName" value="'+safe(r?.name||'')+'" required>')+
   field('Kod / nyckel','<input id="reiKey" value="'+safe(r?.item_key||'')+'" placeholder="ex. torch" '+(r?'readonly':'')+'>')+
   field('Kategori','<select id="reiCategory">'+categories.map(c=>option(c,c,r?.category||'Äventyr')).join('')+'</select>')+
   field('Typ','<select id="reiKind">'+kinds.map(k=>option(k,kindsLabel[k],r?.purchase_kind||'equipment')).join('')+'</select>')+
   field('BEP','<input id="reiBep" type="number" min="0" step="0.01" value="'+safe(r?.bep??'')+'">')+
   field('Pris','<input id="reiPrice" type="number" min="0" step="1" value="'+safe(r?.price_amount??0)+'">')+
   field('Valuta','<select id="reiCurrency">'+['SM','GM','KM'].map(k=>option(k,k,r?.price_currency||'SM')).join('')+'</select>')+
   field('Antal per köp','<input id="reiQuantity" type="number" min="1" step="1" value="'+safe(r?.quantity_per_purchase??1)+'">')+
   field('Sorteringsordning','<input id="reiOrder" type="number" step="1" value="'+safe(r?.sort_order??0)+'">')+
   '<label class="wide">Beskrivning<textarea id="reiDesc" rows="3">'+safe(r?.description||'')+'</textarea></label>'+
   '<label class="admincheck wide"><input id="reiCarry" type="checkbox" '+(r?.can_carry?'checked':'')+'> Kan bäras i handen (Aktuell utrustning)</label>'+ 
   '<label class="admincheck wide"><input id="reiMagical" type="checkbox" '+(r?.is_magical?'checked':'')+'> Magiskt föremål (gäller själva registerposten)</label>'+
   '<label class="admincheck wide"><input id="reiActive" type="checkbox" '+(r?.active===false?'':'checked')+'> Säljs/visas i butik</label>'+
   (window.aleaEquipmentArt?.start('equipment',r)||'')+
   '<div class="rule-editor-actions"><button class="btn" type="button" onclick="closeAdminEditor()">Avbryt</button>'+
   '<button class="btn primary" type="button" onclick="saveRuleEquipment(\''+safe(id)+'\')">Spara</button></div></div>';
  elem('reiKind')?.addEventListener('change',()=>{
   const c=elem('reiCarry');if(c){if(elem('reiKind').value!=='equipment')c.checked=false;c.disabled=elem('reiKind').value!=='equipment'}
  });
  elem('reiKind')?.dispatchEvent(new Event('change'));
  elem('adminEditor').classList.remove('hidden')
 }
 async function saveItem(id=''){
  if(!activeUser()?.admin||saving)return;
  const old=id?byId.get(id):null;
  const name=elem('reiName')?.value.trim(),key=elem('reiKey')?.value.trim();
  const kind=elem('reiKind')?.value;
  const price=Number(elem('reiPrice')?.value),qty=Number(elem('reiQuantity')?.value);
  const bepInput=elem('reiBep')?.value;
  const bep=bepInput===''?null:Number(bepInput);
  const order=Number(elem('reiOrder')?.value);
  if(!name||!key||!/^[a-z][a-z0-9_]{1,79}$/.test(key))return alert('Ange namn och en unik nyckel (små bokstäver, siffror, understreck).');
  if(!Number.isInteger(price)||price<0||!Number.isInteger(qty)||qty<1||
     (bep!==null&&(!Number.isFinite(bep)||bep<0))||!Number.isInteger(order))
   return alert('Kontrollera pris, antal, BEP och sorteringsordning.');
  if(rows.some(r=>r.item_key===key&&r.id!==id))return alert('Den nyckeln används redan.');
  const rowId=old?.id||crypto.randomUUID();
  const payload={
   item_key:key,name,category:elem('reiCategory')?.value||'Äventyr',
   purchase_kind:kind||'equipment',
   description:elem('reiDesc')?.value.trim()||'',
   bep,price_amount:price,price_currency:elem('reiCurrency')?.value||'SM',
   quantity_per_purchase:qty,sort_order:order,
   can_carry:kind==='equipment'&&!!elem('reiCarry')?.checked,
   is_magical:!!elem('reiMagical')?.checked,
   active:!!elem('reiActive')?.checked,
   updated_at:new Date().toISOString()
  };
  const ctx={token:supabaseSession?.access_token,key:SUPABASE_KEY,getToken:freshSupabaseAccessToken};
  let art=null;saving=true;
  const btn=elem('adminEditorBody')?.querySelector('.rule-editor-actions .primary');if(btn)btn.disabled=true;
  try{
   art=await window.aleaEquipmentArt.prepare('equipment',rowId,ctx);
   payload.image_path=art.path;
   if(!old)payload.id=rowId;
   await dbJson(old?'rule_shop_items?id=eq.'+encodeURIComponent(rowId):'rule_shop_items',{
    method:old?'PATCH':'POST',
    body:JSON.stringify(payload),
    headers:{Prefer:'return=minimal'}
   });
   if(art.old&&art.old!==art.path)
    window.aleaEquipmentArt.removeStored(art.old,ctx).catch(e=>console.warn('Gamla utrustningsbilden kunde inte rensas',e));
   closeAdminEditor();await load(true);render();renderAdminOverviewCounts();
   if(typeof loadShopCatalog==='function')loadShopCatalog(true).catch(e=>console.warn('Butiken kunde inte uppdateras',e));
   if(typeof current!=='undefined'&&current&&typeof renderCurrentEquipment==='function')renderCurrentEquipment();
  }catch(e){
   if(art?.uploaded)await window.aleaEquipmentArt.removeStored(art.uploaded,ctx).catch(()=>{});
   alert('Kunde inte spara utrustning: '+e.message)
  }finally{saving=false;if(btn)btn.disabled=false}
 }
 async function removeItem(id){
  if(!activeUser()?.admin)return;
  const r=byId.get(id);if(!r)return;
  if(!await askConfirm('Ta bort utrustning','Ta bort '+r.name+' från masterregistret? Befintliga föremål i rollpersoners väskor behålls, men kan inte längre väljas som bärbara.','Ta bort',true))return;
  try{
   await dbJson('rule_shop_items?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
   await load(true);render();renderAdminOverviewCounts();
   if(typeof loadShopCatalog==='function')loadShopCatalog(true).catch(()=>{});
  }catch(e){alert('Kunde inte ta bort utrustning: '+e.message)}
 }
 window.aleaEquipmentCatalog={load,get,canCarry,torchCount,imagePath,count:()=>rows.length,all:()=>[...rows],refresh,render};
 window.editRuleEquipment=editor;
 window.saveRuleEquipment=saveItem;
 window.deleteRuleEquipment=removeItem;
})();
