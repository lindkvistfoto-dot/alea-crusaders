/* Targans Gille — player-facing shop with real checkout. */
const SHOP_CART_STORAGE_KEY='alea_targans_gille_cart_v1';
const SHOP_CATEGORY_ORDER=['Alla','Vapen','Rustning','Sköld','Vapentillbehör','Äventyr','Behållare','Verktyg','Proviant','Kläder','Transport'];
let ruleShopItems=[],ruleShopItemsLoaded=false;
let shopCart=loadShopCart();
let shopCategory='Alla',shopQuery='',shopCharacterId='';

function loadShopCart(){
 try{
  const value=JSON.parse(localStorage.getItem(SHOP_CART_STORAGE_KEY)||'[]');
  if(!Array.isArray(value))return [];
  return value.map(row=>({key:String(row?.key||''),qty:Math.max(1,Math.min(99,Number(row?.qty)||1))})).filter(row=>row.key)
 }catch(_error){return []}
}
function saveShopCart(){localStorage.setItem(SHOP_CART_STORAGE_KEY,JSON.stringify(shopCart))}

async function loadRuleShopItems(force=false){
 if(ruleShopItemsLoaded&&!force)return ruleShopItems;
 try{
  ruleShopItems=await dbJson('rule_shop_items?active=eq.true&select=*&order=category.asc,sort_order.asc,name.asc');
  ruleShopItemsLoaded=true;return ruleShopItems
 }catch(e){
  console.error('Kunde inte läsa Targans sortiment',e);
  ruleShopItems=[];ruleShopItemsLoaded=false;return []
 }
}

function shopAvailableCharacters(){
 let u=activeUser();if(!u)return[];
 return (u.admin||centralCampaignRole==='gm')?(chars||[]):((chars||[]).filter(c=>c.ownerId===u.id))
}
function shopMoneyToKm(coins){coins=coins||{};return Math.max(0,Number(coins.GM)||0)*100+Math.max(0,Number(coins.SM)||0)*10+Math.max(0,Number(coins.KM)||0)}
function shopKmToCoins(value){let n=Math.max(0,Math.round(Number(value)||0));return{GM:Math.floor(n/100),SM:Math.floor((n%100)/10),KM:n%10}}
function shopMoneyTextFromKm(value){let c=shopKmToCoins(value),parts=[];if(c.GM)parts.push(c.GM+' GM');if(c.SM)parts.push(c.SM+' SM');if(c.KM||!parts.length)parts.push(c.KM+' KM');return parts.join(' ')}
function shopPriceText(row){let n=Number(row.price_amount)||0;return (Number.isInteger(n)?n:String(Math.round(n*100)/100).replace('.',','))+' '+row.price_currency}
function shopUnitPriceKm(row){let mul={GM:100,SM:10,KM:1}[row.price_currency]||1;return Math.round((Number(row.price_amount)||0)*mul)}

function shopCatalogRows(){
 let weapons=(ruleWeapons||[]).filter(r=>Number(r.price)>0).map(r=>({
  key:'weapon:'+r.id,kind:'weapon',rule:r,category:'Vapen',name:r.name||'Vapen',
  description:[r.handling?'Fattning '+r.handling:'',r.strength_group!=null?'STY-grupp '+r.strength_group:'',r.damage?'Skada '+r.damage:'',r.range_text?'Räckvidd '+r.range_text:''].filter(Boolean).join(' · '),
  bep:r.bep,price_amount:Number(r.price)||0,price_currency:'SM'
 }));
 let items=(ruleShopItems||[]).map(item=>({
  key:'item:'+item.id,kind:'item',item,category:item.category,name:item.name,description:item.description||'',
  bep:item.bep,price_amount:Number(item.price_amount)||0,price_currency:item.price_currency
 }));
 return weapons.concat(items)
}
function shopRowByKey(key){return shopCatalogRows().find(r=>r.key===key)||null}
function shopCategories(){
 let found=new Set(shopCatalogRows().map(r=>r.category));
 return SHOP_CATEGORY_ORDER.filter(c=>c==='Alla'||found.has(c))
}
function shopSelectedCharacter(){return shopAvailableCharacters().find(c=>c.id===shopCharacterId)||null}

async function openShop(){
 try{
  await Promise.all([loadRuleShopItems(),loadRuleWeapons()]);
  if(centralCampaignRole==null&&centralCampaignId)await loadCampaignMapRole();
 }catch(e){console.error('Targans Gille kunde inte laddas',e)}
 let allowed=shopAvailableCharacters();if(!allowed.some(c=>c.id===shopCharacterId))shopCharacterId=allowed[0]?.id||'';
 ['home','view','admin','combatPage','mapPage','dicePage'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 document.getElementById('shopPage')?.classList.remove('hidden');
 document.getElementById('back')?.classList.add('hidden');
 document.getElementById('editBtn')?.classList.add('hidden');
 document.getElementById('cancelEditBtn')?.classList.add('hidden');
 document.body.classList.add('shop-open');
 renderShop();window.scrollTo({top:0,behavior:'smooth'})
}
function closeShop(){document.body.classList.remove('shop-open');goHome()}
function shopSelectCharacter(id){shopCharacterId=id;shopCart=[];saveShopCart();renderShop()}
function shopSetCategory(category){shopCategory=category||'Alla';renderShopCatalogOnly()}
function shopSetQuery(value){shopQuery=String(value||'');renderShopCatalogOnly()}
function shopFilteredRows(){
 let q=shopQuery.trim().toLocaleLowerCase('sv-SE');
 return shopCatalogRows().filter(r=>(shopCategory==='Alla'||r.category===shopCategory)&&(!q||(r.name+' '+r.description+' '+r.category).toLocaleLowerCase('sv-SE').includes(q)))
}
function shopCardMeta(row){
 let parts=[];if(row.kind==='weapon'){let r=row.rule;if(r.bep!=null)parts.push('BEP '+formatBep(Number(r.bep)));if(r.bv!=null)parts.push('BV '+r.bv)}
 else if(row.bep!=null)parts.push('BEP '+formatBep(Number(row.bep)));
 return parts.join(' · ')
}
function renderShop(){
 let charsAllowed=shopAvailableCharacters(),select=document.getElementById('shopCharacterSelect');
 if(select)select.innerHTML=charsAllowed.length?charsAllowed.map(c=>'<option value="'+escAttr(c.id)+'" '+(c.id===shopCharacterId?'selected':'')+'>'+escAttr(c.identity?.namn||'Namnlös')+'</option>').join(''):'<option value="">Ingen tillgänglig rollperson</option>';
 let search=document.getElementById('shopSearch');if(search)search.value=shopQuery;
 renderShopCatalogOnly();renderShopCart()
}
function renderShopCatalogOnly(){
 let cats=document.getElementById('shopCategories');if(cats)cats.innerHTML=shopCategories().map(c=>'<button class="shop-category '+(shopCategory===c?'active':'')+'" type="button" onclick="shopSetCategory(\''+escAttr(c)+'\')">'+escAttr(c)+'</button>').join('');
 let rows=shopFilteredRows(),grid=document.getElementById('shopGrid'),status=document.getElementById('shopStatus');
 if(status)status.textContent=rows.length+' varor'+(shopCategory!=='Alla'?' i '+shopCategory:'')+(shopQuery?' · sökning: '+shopQuery:'');
 if(!grid)return;
 grid.innerHTML=rows.length?rows.map(row=>'<article class="shop-card"><div class="shop-card-top"><span class="shop-card-category">'+escAttr(row.category)+'</span><strong class="shop-card-price">'+escAttr(shopPriceText(row))+'</strong></div><h3>'+escAttr(row.name)+'</h3><p>'+escAttr(row.description||'')+'</p><div class="shop-card-bottom"><span>'+escAttr(shopCardMeta(row)||'—')+'</span><button class="btn primary" type="button" onclick="addShopCart(\''+row.key+'\')">+ Varukorg</button></div></article>').join(''):'<div class="shop-empty">Targan hittar inget som matchar. Det är nästan imponerande.</div>'
}
function addShopCart(key){let row=shopRowByKey(key);if(!row)return;let line=shopCart.find(x=>x.key===key);if(line)line.qty=Math.min(99,line.qty+1);else shopCart.push({key,qty:1});saveShopCart();renderShopCart()}
function stepShopCart(key,delta){let line=shopCart.find(x=>x.key===key);if(!line)return;line.qty=Math.max(0,Math.min(99,(Number(line.qty)||0)+delta));if(!line.qty)shopCart=shopCart.filter(x=>x!==line);saveShopCart();renderShopCart()}
function clearShopCart(){shopCart=[];saveShopCart();renderShopCart()}
function shopCartTotalKm(){return shopCart.reduce((sum,line)=>{let row=shopRowByKey(line.key);return sum+(row?shopUnitPriceKm(row)*Math.max(1,Number(line.qty)||1):0)},0)}
function renderShopCart(){
 let c=shopSelectedCharacter(),wallet=document.getElementById('shopWallet'),list=document.getElementById('shopCart'),total=document.getElementById('shopCartTotal'),checkout=document.getElementById('shopCheckout'),count=document.getElementById('shopCartCount');
 let balance=shopMoneyToKm(c?.coins?.carried),sum=shopCartTotalKm(),units=shopCart.reduce((a,x)=>a+(Number(x.qty)||0),0);
 if(count)count.textContent=units?String(units):'';
 if(wallet)wallet.innerHTML=c?'<span>Buret av <b>'+escAttr(c.identity?.namn||'rollpersonen')+'</b></span><strong>'+escAttr(shopMoneyTextFromKm(balance))+'</strong>':'<span>Ingen rollperson tillgänglig.</span>';
 if(list)list.innerHTML=shopCart.length?shopCart.map(line=>{let row=shopRowByKey(line.key);if(!row)return'';let qty=Math.max(1,Number(line.qty)||1);return '<div class="shop-cart-line"><div><b>'+escAttr(row.name)+'</b><small>'+escAttr(shopPriceText(row))+' / st</small></div><div class="shop-cart-step"><button type="button" onclick="stepShopCart(\''+line.key+'\',-1)">−</button><span>'+qty+'</span><button type="button" onclick="stepShopCart(\''+line.key+'\',1)">+</button></div><strong>'+escAttr(shopMoneyTextFromKm(shopUnitPriceKm(row)*qty))+'</strong></div>'}).join(''):'<div class="shop-cart-empty">Varukorgen är tom.</div>';
 if(total)total.innerHTML='<span>Totalt</span><strong>'+escAttr(shopMoneyTextFromKm(sum))+'</strong>';
 if(checkout){checkout.disabled=!c||!shopCart.length||sum>balance;checkout.textContent=sum>balance?'För lite pengar':'Köp hos Targan'}
}

function shopAddPurchasedItem(c,row,qty){
 ensureEquipmentState(c);c.projectiles=c.projectiles||[];qty=Math.max(1,Number(qty)||1);
 if(row.kind==='weapon'){
  for(let i=0;i<qty;i++){let w={equipId:newEquipItemId('weapon'),materialKey:'standard',material:'Standard',fv:0,erf:0};copyRuleWeaponToInstance(w,row.rule);c.weapons.push(w)}
  return
 }
 let item=row.item,meta=item.metadata||{},kind=item.purchase_kind;
 if(kind==='projectile'){
  let name=meta.projectile_name||item.name,units=Math.max(1,Number(item.quantity_per_purchase)||1)*qty,p=c.projectiles.find(x=>(x.name||'').localeCompare(name,'sv',{sensitivity:'base'})===0);
  if(p)p.count=Math.max(0,Number(p.count)||0)+units;else c.projectiles.push({name,count:units});return
 }
 if(kind==='armor'){
  for(let i=0;i<qty;i++)c.armor.push({equipId:newEquipItemId('armor'),shopItemId:item.id,name:item.name,material:'Standard',materialKey:'standard',abs:Number(meta.abs)||0,bep:item.bep==null?'':Number(item.bep),baseAbs:Number(meta.abs)||0,baseBep:item.bep==null?0:Number(item.bep),magicBlocking:false});
  return
 }
 if(kind==='shield'){
  for(let i=0;i<qty;i++)c.shields.push({equipId:newEquipItemId('shield'),shopItemId:item.id,name:item.name,fv:0,erf:0,bep:item.bep==null?'':Number(item.bep),abs:Number(meta.abs)||0,strengthGroup:Number(meta.strength_group)||null});
  return
 }
 let existing=c.equipment.find(x=>x.shopItemId===item.id);
 if(existing)existing.count=Math.max(1,Number(existing.count)||1)+qty;
 else c.equipment.push({equipId:newEquipItemId('equipment'),shopItemId:item.id,shopCategory:item.category,name:item.name,bep:item.bep==null?0:Number(item.bep),count:qty})
}
async function checkoutShopCart(){
 let c=shopSelectedCharacter();if(!c||!shopCart.length)return;
 let total=shopCartTotalKm(),balance=shopMoneyToKm(c.coins?.carried);if(total>balance){alert('Rollpersonen har inte tillräckligt med burna pengar.');return}
 let summary=shopCart.reduce((n,x)=>n+(Number(x.qty)||0),0)+' varor för '+shopMoneyTextFromKm(total);
 if(!await askConfirm('Handla hos Targan',summary+'?','Köp'))return;
 let index=chars.findIndex(x=>x.id===c.id),snapshot=JSON.parse(JSON.stringify(c));
 try{
  shopCart.forEach(line=>{let row=shopRowByKey(line.key);if(row)shopAddPurchasedItem(c,row,line.qty)});
  c.coins=c.coins||{carried:{GM:0,SM:0,KM:0},stored:{GM:0,SM:0,KM:0}};c.coins.carried=shopKmToCoins(balance-total);
  localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));await syncCharacterToCentral(c);
  shopCart=[];saveShopCart();if(current?.id===c.id)current=c;renderShop();showBackupToast('✓ Köpet genomfört hos Targan')
 }catch(e){
  if(index>=0)chars[index]=snapshot;if(current?.id===snapshot.id)current=chars[index];localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));alert('Köpet kunde inte genomföras: '+e.message)
 }
}
