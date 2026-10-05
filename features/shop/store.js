/* Targans Gille — player-facing shop browser and cart.
 * Step 1 deliberately stops before checkout mutates character inventories.
 */
const SHOP_CART_STORAGE_KEY='alea_targans_gille_cart_v1';
const SHOP_CATEGORY_ORDER=['Alla','Vapen','Rustning','Sköld','Vapentillbehör','Äventyr','Proviant','Behållare','Verktyg','Kläder','Transport'];
let shopCatalog=[];
let shopCatalogLoaded=false;
let shopCategory='Alla';
let shopSearch='';
let shopCart=loadShopCart();
let shopCharacterId='';

function shopEsc(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function loadShopCart(){
  try{
    const value=JSON.parse(localStorage.getItem(SHOP_CART_STORAGE_KEY)||'[]');
    if(!Array.isArray(value))return [];
    return value
      .map(row=>({key:String(row?.key||''),qty:Math.max(1,Math.min(99,Number(row?.qty)||1))}))
      .filter(row=>row.key);
  }catch(_error){
    return [];
  }
}

function saveShopCart(){
  localStorage.setItem(SHOP_CART_STORAGE_KEY,JSON.stringify(shopCart));
}

function shopAvailableCharacters(){
  const user=activeUser();
  if(!user)return [];
  return (user.admin||centralCampaignRole==='gm')?(chars||[]):((chars||[]).filter(c=>c.ownerId===user.id));
}

function shopSelectedCharacter(){
  return shopAvailableCharacters().find(c=>c.id===shopCharacterId)||null;
}

function shopMoneyToKm(coins){
  coins=coins||{};
  return Math.max(0,Number(coins.GM)||0)*100+Math.max(0,Number(coins.SM)||0)*10+Math.max(0,Number(coins.KM)||0);
}

function shopKmToCoins(value){
  const n=Math.max(0,Math.round(Number(value)||0));
  return {GM:Math.floor(n/100),SM:Math.floor((n%100)/10),KM:n%10};
}

function shopMoneyLabel(value){
  const coins=shopKmToCoins(value),parts=[];
  if(coins.GM)parts.push(coins.GM+' GM');
  if(coins.SM)parts.push(coins.SM+' SM');
  if(coins.KM||!parts.length)parts.push(coins.KM+' KM');
  return parts.join(' ');
}

function shopItemPriceKm(item){
  const multiplier={GM:100,SM:10,KM:1}[item?.priceCurrency]||1;
  return Math.round((Number(item?.priceAmount)||0)*multiplier);
}

function shopCartTotalKm(){
  return shopCart.reduce((sum,row)=>{
    const item=shopItemByKey(row.key);
    return sum+(item?shopItemPriceKm(item)*Math.max(1,Number(row.qty)||1):0);
  },0);
}

function renderShopBuyer(){
  const select=document.getElementById('shopCharacterSelect');
  const wallet=document.getElementById('shopWallet');
  const checkout=document.getElementById('shopCheckout');
  const allowed=shopAvailableCharacters();
  if(!allowed.some(c=>c.id===shopCharacterId))shopCharacterId=allowed[0]?.id||'';
  if(select)select.innerHTML=allowed.length
    ?allowed.map(c=>'<option value="'+shopEsc(c.id)+'" '+(c.id===shopCharacterId?'selected':'')+'>'+shopEsc(c.identity?.namn||'Namnlös')+'</option>').join('')
    :'<option value="">Ingen tillgänglig rollperson</option>';
  const buyer=shopSelectedCharacter(),balance=shopMoneyToKm(buyer?.coins?.carried),total=shopCartTotalKm();
  if(wallet)wallet.innerHTML=buyer
    ?'<span>Buret av <b>'+shopEsc(buyer.identity?.namn||'rollpersonen')+'</b></span><strong>'+shopEsc(shopMoneyLabel(balance))+'</strong>'
    :'<span>Ingen rollperson tillgänglig.</span>';
  if(checkout){
    checkout.disabled=!buyer||!shopCart.length||total>balance;
    checkout.textContent=total>balance?'För lite pengar':'Köp hos Targan';
  }
}

function shopSelectCharacter(id){
  shopCharacterId=String(id||'');
  renderShopBuyer();
}

function shopWeaponCategoryLabel(category){
  return {
    melee:'Närstridsvapen',
    projectile:'Projektilvapen',
    thrown:'Kastvapen'
  }[category]||'Vapen';
}

function shopWeaponDescription(row){
  const bits=[];
  if(row.damage)bits.push('Skada '+row.damage);
  if(row.handling)bits.push(row.handling);
  if(row.strength_group)bits.push('STY-grupp '+row.strength_group);
  if(row.bv!==null&&row.bv!==undefined&&row.bv!=='')bits.push('BV '+row.bv);
  if(row.range_text)bits.push('Räckvidd '+row.range_text);
  return bits.join(' · ');
}

function normalizeShopWeapon(row){
  return {
    key:'weapon:'+row.id,
    source:'weapon',
    sourceId:row.id,
    category:'Vapen',
    subcategory:shopWeaponCategoryLabel(row.category),
    name:row.name||'Namnlöst vapen',
    description:shopWeaponDescription(row),
    bep:row.bep,
    priceAmount:row.price===null||row.price===undefined?null:Number(row.price),
    priceCurrency:'SM',
    purchaseKind:'weapon',
    quantityPerPurchase:1,
    sortOrder:Number(row.sort_order)||0,
    metadata:{
      damage:row.damage||'',
      handling:row.handling||'',
      strengthGroup:row.strength_group,
      bv:row.bv,
      weaponType:row.weapon_type||'',
      range:row.range_text||''
    }
  };
}

function normalizeShopItem(row){
  return {
    key:'item:'+row.id,
    source:'shop',
    sourceId:row.id,
    itemKey:row.item_key||'',
    category:row.category||'Övrigt',
    subcategory:'',
    name:row.name||'Namnlös vara',
    description:row.description||'',
    bep:row.bep,
    priceAmount:Number(row.price_amount)||0,
    priceCurrency:row.price_currency||'SM',
    purchaseKind:row.purchase_kind||'equipment',
    quantityPerPurchase:Number(row.quantity_per_purchase)||1,
    sortOrder:Number(row.sort_order)||0,
    metadata:row.metadata||{}
  };
}

async function loadShopCatalog(force=false){
  if(shopCatalogLoaded&&!force)return shopCatalog;
  const status=document.getElementById('shopStatus');
  if(status)status.textContent='Targan plockar fram varorna…';
  try{
    const [items]=await Promise.all([
      dbJson('rule_shop_items?active=eq.true&select=*&order=sort_order.asc,name.asc'),
      loadRuleWeapons(force)
    ]);
    const weapons=(ruleWeapons||[])
      .filter(row=>row.price!==null&&row.price!==undefined&&Number(row.price)>=0)
      .map(normalizeShopWeapon);
    const equipment=(items||[]).map(normalizeShopItem);
    shopCatalog=[...weapons,...equipment];
    shopCatalogLoaded=true;
    if(status)status.textContent='';
    return shopCatalog;
  }catch(error){
    shopCatalog=[];
    shopCatalogLoaded=false;
    if(status)status.textContent='Kunde inte läsa Targans varulager: '+(error?.message||error);
    throw error;
  }
}

function shopCategories(){
  const found=new Set(shopCatalog.map(item=>item.category).filter(Boolean));
  const ordered=SHOP_CATEGORY_ORDER.filter(name=>name==='Alla'||found.has(name));
  const extra=[...found].filter(name=>!SHOP_CATEGORY_ORDER.includes(name)).sort((a,b)=>a.localeCompare(b,'sv'));
  return [...ordered,...extra];
}

function shopPriceLabel(item){
  if(item.priceAmount===null||item.priceAmount===undefined||Number.isNaN(Number(item.priceAmount)))return 'Pris saknas';
  const amount=Number(item.priceAmount);
  const text=Number.isInteger(amount)?String(amount):String(amount).replace('.',',');
  return text+' '+shopEsc(item.priceCurrency||'SM');
}

function shopBepLabel(item){
  const value=Number(item.bep);
  if(item.bep===null||item.bep===undefined||item.bep===''||Number.isNaN(value))return '';
  return (Number.isInteger(value)?String(value):String(value).replace('.',','))+' BEP';
}

function shopFilteredItems(){
  const query=shopSearch.trim().toLocaleLowerCase('sv-SE');
  return shopCatalog.filter(item=>{
    if(shopCategory!=='Alla'&&item.category!==shopCategory)return false;
    if(!query)return true;
    const hay=[item.name,item.description,item.category,item.subcategory,item.itemKey]
      .join(' ')
      .toLocaleLowerCase('sv-SE');
    return hay.includes(query);
  }).sort((a,b)=>{
    if(a.category!==b.category)return a.category.localeCompare(b.category,'sv');
    if(a.sortOrder!==b.sortOrder)return a.sortOrder-b.sortOrder;
    return a.name.localeCompare(b.name,'sv');
  });
}

function shopItemDetailsHtml(item){
  const pills=[];
  if(item.subcategory)pills.push('<span>'+shopEsc(item.subcategory)+'</span>');
  const bep=shopBepLabel(item);
  if(bep)pills.push('<span>'+bep+'</span>');
  if(item.quantityPerPurchase>1)pills.push('<span>'+item.quantityPerPurchase+' st/köp</span>');
  return pills.join('');
}

function renderShopCategories(){
  const host=document.getElementById('shopCategories');
  if(!host)return;
  host.innerHTML=shopCategories().map(name=>
    '<button type="button" class="shop-category '+(name===shopCategory?'active':'')+'" onclick="shopSetCategory(\''+shopEsc(name).replaceAll("'","\\'")+'\')">'+shopEsc(name)+'</button>'
  ).join('');
}

function renderShopItems(){
  const host=document.getElementById('shopItems');
  if(!host)return;
  const rows=shopFilteredItems();
  document.getElementById('shopResultCount').textContent=rows.length+' varor';
  if(!rows.length){
    host.innerHTML='<div class="shop-empty"><b>Inget på hyllan matchar.</b><span>Prova en annan kategori eller sökning.</span></div>';
    return;
  }
  host.innerHTML=rows.map(item=>{
    const description=item.description?'<p>'+shopEsc(item.description)+'</p>':'';
    return '<article class="shop-item-card">'+
      '<div class="shop-item-top"><span class="shop-item-category">'+shopEsc(item.subcategory||item.category)+'</span><span class="shop-item-price">'+shopPriceLabel(item)+'</span></div>'+
      '<h3>'+shopEsc(item.name)+'</h3>'+
      description+
      '<div class="shop-item-meta">'+shopItemDetailsHtml(item)+'</div>'+
      '<button type="button" class="shop-add" onclick="shopAddItem(\''+shopEsc(item.key)+'\')">+ Lägg i varukorg</button>'+
    '</article>';
  }).join('');
}

function shopItemByKey(key){
  return shopCatalog.find(item=>item.key===key)||null;
}

function shopAddItem(key){
  const item=shopItemByKey(key);
  if(!item)return;
  const existing=shopCart.find(row=>row.key===key);
  if(existing)existing.qty=Math.min(99,existing.qty+1);
  else shopCart.push({key,qty:1});
  saveShopCart();
  renderShopCart();
  const status=document.getElementById('shopCartNotice');
  if(status){
    status.textContent=item.name+' lades i varukorgen.';
    clearTimeout(shopAddItem._timer);
    shopAddItem._timer=setTimeout(()=>{if(status)status.textContent='';},1400);
  }
}

function shopChangeQuantity(key,delta){
  const row=shopCart.find(x=>x.key===key);
  if(!row)return;
  row.qty=Math.max(0,Math.min(99,row.qty+delta));
  if(row.qty===0)shopCart=shopCart.filter(x=>x.key!==key);
  saveShopCart();
  renderShopCart();
}

function shopRemoveItem(key){
  shopCart=shopCart.filter(row=>row.key!==key);
  saveShopCart();
  renderShopCart();
}

function shopClearCart(){
  shopCart=[];
  saveShopCart();
  renderShopCart();
}

function shopCartTotals(rows){
  return shopMoneyLabel(rows.reduce((sum,{item,qty})=>sum+shopItemPriceKm(item)*qty,0));
}

function renderShopCart(){
  const host=document.getElementById('shopCartLines');
  const count=document.getElementById('shopCartCount');
  const total=document.getElementById('shopCartTotal');
  const clear=document.getElementById('shopCartClear');
  if(!host||!count||!total)return;
  const rows=shopCart.map(row=>({row,item:shopItemByKey(row.key)})).filter(x=>x.item);
  const units=rows.reduce((sum,x)=>sum+x.row.qty,0);
  count.textContent=String(units);
  clear?.classList.toggle('hidden',!rows.length);
  if(!rows.length){
    host.innerHTML='<div class="shop-cart-empty">Varukorgen är tom.</div>';
    total.textContent='0';
    return;
  }
  host.innerHTML=rows.map(({row,item})=>
    '<div class="shop-cart-line">'+
      '<div class="shop-cart-copy"><b>'+shopEsc(item.name)+'</b><small>'+shopPriceLabel(item)+' / köp</small></div>'+
      '<div class="shop-cart-stepper">'+
        '<button type="button" onclick="shopChangeQuantity(\''+shopEsc(row.key)+'\',-1)">−</button>'+
        '<span>'+row.qty+'</span>'+
        '<button type="button" onclick="shopChangeQuantity(\''+shopEsc(row.key)+'\',1)">+</button>'+
      '</div>'+
      '<button type="button" class="shop-cart-remove" onclick="shopRemoveItem(\''+shopEsc(row.key)+'\')" aria-label="Ta bort '+shopEsc(item.name)+'">×</button>'+
    '</div>'
  ).join('');
  total.textContent=shopCartTotals(rows.map(x=>({item:x.item,qty:x.row.qty})));
  renderShopBuyer();
}

function shopSetCategory(name){
  shopCategory=name||'Alla';
  renderShopCategories();
  renderShopItems();
}

function shopSetSearch(value){
  shopSearch=String(value||'');
  renderShopItems();
}

function shopAddPurchasedItem(character,item,qty){
  ensureEquipmentState(character);
  character.projectiles=character.projectiles||[];
  qty=Math.max(1,Number(qty)||1);

  if(item.source==='weapon'){
    const rule=(ruleWeapons||[]).find(row=>row.id===item.sourceId);
    if(!rule)return;
    for(let i=0;i<qty;i++){
      const weapon={equipId:newEquipItemId('weapon'),materialKey:'standard',material:'Standard',fv:0,erf:0};
      copyRuleWeaponToInstance(weapon,rule);
      character.weapons.push(weapon);
    }
    return;
  }

  const meta=item.metadata||{};
  if(item.purchaseKind==='projectile'){
    const name=meta.projectile_name||item.name;
    const units=Math.max(1,Number(item.quantityPerPurchase)||1)*qty;
    const existing=character.projectiles.find(x=>(x.name||'').localeCompare(name,'sv',{sensitivity:'base'})===0);
    if(existing)existing.count=Math.max(0,Number(existing.count)||0)+units;
    else character.projectiles.push({name,count:units});
    return;
  }

  if(item.purchaseKind==='armor'){
    for(let i=0;i<qty;i++)character.armor.push({
      equipId:newEquipItemId('armor'),shopItemId:item.sourceId,name:item.name,
      material:'Standard',materialKey:'standard',abs:Number(meta.abs)||0,
      bep:item.bep==null?'':Number(item.bep),baseAbs:Number(meta.abs)||0,
      baseBep:item.bep==null?0:Number(item.bep),magicBlocking:false
    });
    return;
  }

  if(item.purchaseKind==='shield'){
    for(let i=0;i<qty;i++)character.shields.push({
      equipId:newEquipItemId('shield'),shopItemId:item.sourceId,name:item.name,fv:0,erf:0,
      bep:item.bep==null?'':Number(item.bep),abs:Number(meta.abs)||0,
      strengthGroup:Number(meta.strength_group)||null
    });
    return;
  }

  const existing=character.equipment.find(x=>x.shopItemId===item.sourceId);
  if(existing)existing.count=Math.max(1,Number(existing.count)||1)+qty;
  else character.equipment.push({
    equipId:newEquipItemId('equipment'),shopItemId:item.sourceId,shopCategory:item.category,
    name:item.name,bep:item.bep==null?0:Number(item.bep),count:qty
  });
}

async function checkoutShopCart(){
  const buyer=shopSelectedCharacter();
  if(!buyer||!shopCart.length)return;
  const total=shopCartTotalKm();
  const balance=shopMoneyToKm(buyer.coins?.carried);
  if(total>balance){
    alert('Rollpersonen har inte tillräckligt med burna pengar.');
    return;
  }
  const units=shopCart.reduce((sum,row)=>sum+(Number(row.qty)||0),0);
  if(!await askConfirm('Handla hos Targan',units+' varor för '+shopMoneyLabel(total)+'?','Köp'))return;

  const index=chars.findIndex(c=>c.id===buyer.id);
  const snapshot=JSON.parse(JSON.stringify(buyer));
  try{
    shopCart.forEach(row=>{
      const item=shopItemByKey(row.key);
      if(item)shopAddPurchasedItem(buyer,item,row.qty);
    });
    buyer.coins=buyer.coins||{carried:{GM:0,SM:0,KM:0},stored:{GM:0,SM:0,KM:0}};
    buyer.coins.carried=shopKmToCoins(balance-total);
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));
    await syncCharacterToCentral(buyer);
    shopCart=[];
    saveShopCart();
    if(current?.id===buyer.id)current=buyer;
    renderShopCart();
    showBackupToast('✓ Köpet genomfört hos Targan');
  }catch(error){
    if(index>=0)chars[index]=snapshot;
    if(current?.id===snapshot.id)current=chars[index];
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));
    alert('Köpet kunde inte genomföras: '+(error?.message||error));
  }
}

async function openShop(){
  editing=false;
  document.getElementById('home')?.classList.add('hidden');
  document.getElementById('view')?.classList.add('hidden');
  document.getElementById('admin')?.classList.add('hidden');
  document.getElementById('combatPage')?.classList.add('hidden');
  document.getElementById('shopPage')?.classList.remove('hidden');
  document.getElementById('back')?.classList.add('hidden');
  document.getElementById('editBtn')?.classList.add('hidden');
  document.getElementById('cancelEditBtn')?.classList.add('hidden');
  document.body.classList.add('shop-open');
  try{
    await loadShopCatalog();
    if(centralCampaignRole==null&&centralCampaignId)await loadCampaignMapRole();
    renderShopCategories();
    renderShopItems();
    renderShopCart();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(_error){
    renderShopCart();
  }
}

function closeShop(){
  document.getElementById('shopPage')?.classList.add('hidden');
  document.body.classList.remove('shop-open');
  goHome();
}
