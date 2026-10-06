/* Targans Gille — player-facing shop browser, cart and character checkout. */
const SHOP_CART_STORAGE_KEY='alea_targans_gille_cart_v1';
const SHOP_CURRENCY_KM={GM:100,SM:10,KM:1};
const SHOP_CATEGORY_ORDER=['Alla','Vapen','Rustning','Sköld','Vapentillbehör','Äventyr','Proviant','Behållare','Verktyg','Kläder','Transport'];
let shopCatalog=[];
let shopCatalogLoaded=false;
let shopCategory='Alla';
let shopSearch='';
let shopCart=loadShopCart();
let shopBuyerId='';
let shopCheckoutBusy=false;
let shopExpandedItemKey='';
const shopRowQuantities=new Map();
const SHOP_HERO_SRC='./assets/targans-gille-clean.jpg?v=0.33.27';

async function loadShopHeroImage(){
  const img=document.getElementById('shopHeroImage');
  if(!img)return;
  if(img.dataset.shopHeroLoaded==='1')return;
  img.dataset.shopHeroLoaded='1';
  img.onload=()=>img.classList.add('loaded');
  img.onerror=()=>{
    img.classList.remove('loaded');
    console.warn('Targans hero kunde inte laddas');
  };
  img.src=SHOP_HERO_SRC;
}

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

const SHOP_CURRENCY_NAMES={GM:'guldmynt',SM:'silvermynt',KM:'kopparmynt'};

function shopCoinHtml(currency){
  const code=['GM','SM','KM'].includes(currency)?currency:'SM';
  const name=SHOP_CURRENCY_NAMES[code];
  const motif=code==='GM'
    ?'<path class="shop-coin-mark" d="M5.4 11.9 6.5 7.8l2.2 2 1.3-3.2 1.3 3.2 2.2-2 1.1 4.1z"/><path class="shop-coin-mark" d="M6.2 13.4h7.6"/>'
    :code==='SM'
      ?'<path class="shop-coin-mark" d="m10 5.2 1.35 2.73 3.01.44-2.18 2.12.52 3-2.7-1.42-2.7 1.42.52-3-2.18-2.12 3.01-.44z"/>'
      :'<circle class="shop-coin-mark shop-coin-dot" cx="10" cy="10" r="2.8"/><circle class="shop-coin-mark" cx="10" cy="10" r="4.7"/>';
  return '<span class="shop-coin shop-coin-'+code.toLowerCase()+'" title="'+shopEsc(name)+'" aria-hidden="true">'+
    '<svg viewBox="0 0 20 20" focusable="false">'+
      '<circle class="shop-coin-rim" cx="10" cy="10" r="9"/>'+
      '<circle class="shop-coin-face" cx="10" cy="10" r="7"/>'+
      motif+
    '</svg>'+
  '</span>';
}

function shopCurrencyAmountHtml(amount,currency){
  const code=['GM','SM','KM'].includes(currency)?currency:'SM';
  const value=Number(amount);
  const text=Number.isInteger(value)?String(value):String(value).replace('.',',');
  return '<span class="shop-money-unit"><span class="shop-money-amount">'+shopEsc(text)+'</span>'+shopCoinHtml(code)+'<span class="shop-money-sr">'+shopEsc(SHOP_CURRENCY_NAMES[code])+'</span></span>';
}

function shopPriceLabel(item){
  if(item.priceAmount===null||item.priceAmount===undefined||Number.isNaN(Number(item.priceAmount)))return 'Pris saknas';
  const amount=Number(item.priceAmount);
  const text=Number.isInteger(amount)?String(amount):String(amount).replace('.',',');
  return text+' '+shopEsc(item.priceCurrency||'SM');
}

function shopPriceHtml(item){
  if(item.priceAmount===null||item.priceAmount===undefined||Number.isNaN(Number(item.priceAmount)))return 'Pris saknas';
  return shopCurrencyAmountHtml(item.priceAmount,item.priceCurrency||'SM');
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

function shopRowQuantity(key){
  return Math.max(1,Math.min(99,Number(shopRowQuantities.get(key))||1));
}

function shopChangeRowQuantity(key,delta){
  shopRowQuantities.set(key,Math.max(1,Math.min(99,shopRowQuantity(key)+(Number(delta)||0))));
  renderShopItems();
}

function shopToggleItemDetails(key){
  shopExpandedItemKey=shopExpandedItemKey===key?'':key;
  renderShopItems();
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
    const key=shopEsc(item.key);
    const qty=shopRowQuantity(item.key);
    const expanded=shopExpandedItemKey===item.key;
    const description=item.description?'<p>'+shopEsc(item.description)+'</p>':'';
    const details=shopItemDetailsHtml(item);
    return '<article class="shop-item-row '+(expanded?'expanded':'')+'">'+
      '<div class="shop-item-main">'+
        '<button type="button" class="shop-item-name" aria-expanded="'+(expanded?'true':'false')+'" onclick="shopToggleItemDetails(\''+key+'\')">'+shopEsc(item.name)+'</button>'+
        '<span class="shop-item-price">'+shopPriceHtml(item)+'</span>'+
        '<div class="shop-row-stepper" aria-label="Antal">'+
          '<button type="button" onclick="shopChangeRowQuantity(\''+key+'\',-1)" aria-label="Minska antal">−</button>'+
          '<span>'+qty+'</span>'+
          '<button type="button" onclick="shopChangeRowQuantity(\''+key+'\',1)" aria-label="Öka antal">+</button>'+
        '</div>'+
        '<button type="button" class="shop-row-buy" onclick="shopAddItem(\''+key+'\','+qty+')">Köp</button>'+
      '</div>'+
      '<div class="shop-item-details '+(expanded?'':'hidden')+'">'+
        (details?'<div class="shop-item-meta">'+details+'</div>':'')+
        description+
        '<div class="shop-item-detail-price">Pris: <b>'+shopPriceHtml(item)+'</b></div>'+
      '</div>'+
    '</article>';
  }).join('');
}

function shopItemByKey(key){
  return shopCatalog.find(item=>item.key===key)||null;
}

function shopAddItem(key,quantity=1){
  const item=shopItemByKey(key);
  if(!item)return;
  const qty=Math.max(1,Math.min(99,Math.floor(Number(quantity)||1)));
  const existing=shopCart.find(row=>row.key===key);
  if(existing)existing.qty=Math.min(99,existing.qty+qty);
  else shopCart.push({key,qty});
  shopRowQuantities.set(key,1);
  saveShopCart();
  renderShopItems();
  renderShopCart();
  const status=document.getElementById('shopCartNotice');
  if(status){
    status.textContent=(qty>1?qty+' × ':'')+item.name+' lades i varukorgen.';
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
  const totals=new Map();
  rows.forEach(({item,qty})=>{
    if(item.priceAmount===null||item.priceAmount===undefined)return;
    const currency=item.priceCurrency||'SM';
    totals.set(currency,(totals.get(currency)||0)+Number(item.priceAmount)*qty);
  });
  return [...totals.entries()].map(([currency,value])=>{
    const amount=Number.isInteger(value)?String(value):String(value).replace('.',',');
    return amount+' '+currency;
  });
}


function shopCartRows(){
  return shopCart.map(row=>({row,item:shopItemByKey(row.key)})).filter(x=>x.item);
}

function shopCurrencyValueKm(currency){
  return SHOP_CURRENCY_KM[currency]||0;
}

function shopCartCostKm(rows=shopCartRows()){
  return rows.reduce((sum,{row,item})=>{
    const factor=shopCurrencyValueKm(item.priceCurrency||'SM');
    return sum+(Number(item.priceAmount)||0)*factor*(Number(row.qty)||0);
  },0);
}

function shopMoneyBreakdown(totalKm){
  let left=Math.max(0,Math.floor(Number(totalKm)||0));
  const GM=Math.floor(left/SHOP_CURRENCY_KM.GM);left%=SHOP_CURRENCY_KM.GM;
  const SM=Math.floor(left/SHOP_CURRENCY_KM.SM);left%=SHOP_CURRENCY_KM.SM;
  return {GM,SM,KM:left};
}

function shopMoneyLabel(totalKm){
  const c=shopMoneyBreakdown(totalKm);
  const parts=[];
  if(c.GM)parts.push(c.GM+' GM');
  if(c.SM)parts.push(c.SM+' SM');
  if(c.KM||!parts.length)parts.push(c.KM+' KM');
  return parts.join(' · ');
}

function shopMoneyHtml(totalKm){
  const c=shopMoneyBreakdown(totalKm);
  const parts=[];
  if(c.GM)parts.push(shopCurrencyAmountHtml(c.GM,'GM'));
  if(c.SM)parts.push(shopCurrencyAmountHtml(c.SM,'SM'));
  if(c.KM||!parts.length)parts.push(shopCurrencyAmountHtml(c.KM,'KM'));
  return '<span class="shop-money">'+parts.join('<span class="shop-money-sep" aria-hidden="true">·</span>')+'</span>';
}

function shopEnsureCoins(c){
  if(!c)return null;
  c.coins=c.coins||{};
  c.coins.carried=c.coins.carried||{GM:0,SM:0,KM:0};
  c.coins.stored=c.coins.stored||{GM:0,SM:0,KM:0};
  ['GM','SM','KM'].forEach(k=>{
    c.coins.carried[k]=Math.max(0,Number(c.coins.carried[k])||0);
    c.coins.stored[k]=Math.max(0,Number(c.coins.stored[k])||0);
  });
  return c.coins;
}

function shopCarriedValueKm(c){
  const coins=shopEnsureCoins(c);
  if(!coins)return 0;
  return ['GM','SM','KM'].reduce((sum,k)=>sum+(Number(coins.carried[k])||0)*SHOP_CURRENCY_KM[k],0);
}

function shopSpendCarriedCoins(c,costKm){
  const before=shopCarriedValueKm(c);
  const cost=Math.max(0,Math.floor(Number(costKm)||0));
  if(before<cost)return false;
  c.coins.carried=shopMoneyBreakdown(before-cost);
  return true;
}

function shopEligibleBuyers(){
  const u=typeof activeUser==='function'?activeUser():null;
  if(!u)return [];
  if(u.admin)return Array.isArray(chars)?chars:[];
  return (Array.isArray(chars)?chars:[]).filter(c=>String(c.ownerId||'')===String(u.id));
}

function shopBuyerById(id=shopBuyerId){
  return shopEligibleBuyers().find(c=>String(c.id)===String(id))||null;
}

function shopSetBuyer(id){
  const next=shopBuyerById(id);
  shopBuyerId=next?String(next.id):'';
  renderShopBuyer();
}

function renderShopBuyer(){
  const select=document.getElementById('shopBuyerSelect');
  const balance=document.getElementById('shopBuyerBalance');
  const button=document.getElementById('shopCheckoutBtn');
  if(!select||!balance||!button)return;
  const buyers=shopEligibleBuyers();
  if(!buyers.some(c=>String(c.id)===String(shopBuyerId)))shopBuyerId=buyers[0]?String(buyers[0].id):'';
  select.innerHTML=buyers.length
    ?buyers.map(c=>'<option value="'+shopEsc(c.id)+'" '+(String(c.id)===String(shopBuyerId)?'selected':'')+'>'+shopEsc(c.identity?.namn||c.name||'Namnlös')+'</option>').join('')
    :'<option value="">Ingen tillgänglig rollfigur</option>';
  select.disabled=!buyers.length;
  const buyer=shopBuyerById();
  const rows=shopCartRows();
  const cost=shopCartCostKm(rows);
  if(!buyer){
    balance.textContent='Ingen rollfigur är kopplad till ditt konto.';
    button.disabled=true;
    return;
  }
  const funds=shopCarriedValueKm(buyer);
  balance.innerHTML='<span>Börs (buret): <b>'+shopMoneyHtml(funds)+'</b></span>'+(cost>funds?'<span class="shop-insufficient">Saknar '+shopMoneyHtml(cost-funds)+'</span>':'');
  button.disabled=shopCheckoutBusy||!rows.length||cost>funds;
  button.innerHTML=shopCheckoutBusy?'Genomför köp…':'Köp för '+shopMoneyHtml(cost);
}

function shopArmorInstance(item){
  const wantedName=String(item.name||'');
  const type=(ruleArmorTypes||[]).find(t=>(t.name||'').localeCompare(wantedName,'sv',{sensitivity:'base'})===0)
    ||(ruleArmorTypes||[]).find(t=>Number(t.absorption)===Number(item.metadata?.abs));
  const mat=typeof armorMaterialByKey==='function'?(armorMaterialByKey('standard')||ruleArmorMaterials?.[0]):null;
  const st=type&&mat&&typeof armorSuggestedStats==='function'?armorSuggestedStats(type,mat):null;
  if(type&&mat&&st){
    return {
      equipId:newEquipItemId('armor'),
      armorTypeId:st.base.id,
      armorTypeKey:st.base.type_key,
      materialKey:mat.material_key,
      material:mat.name,
      name:wantedName||armorInstanceName(type,mat),
      abs:st.absorption,
      bep:st.bep,
      baseAbs:Number(st.base.absorption||0),
      baseBep:Number(st.base.bep||0),
      magicBlocking:st.magicBlocking,
      shopItemKey:item.itemKey||''
    };
  }
  return {
    equipId:newEquipItemId('armor'),
    materialKey:'standard',
    material:'Standard',
    name:wantedName,
    abs:Number(item.metadata?.abs)||0,
    bep:item.bep==null?'':Number(item.bep),
    shopItemKey:item.itemKey||''
  };
}

function shopAddPurchasedItem(c,item,purchases=1){
  const qty=Math.max(1,Math.floor(Number(purchases)||1));
  ensureEquipmentState(c);
  c.projectiles=c.projectiles||[];
  if(item.source==='weapon'||item.purchaseKind==='weapon'){
    const rule=(ruleWeapons||[]).find(r=>r.id===item.sourceId);
    for(let i=0;i<qty;i++){
      const w={
        equipId:newEquipItemId('weapon'),
        materialKey:'standard',
        material:'Standard',
        weaponTypeId:'',
        weapon_id:'',
        weaponCategory:rule?.category||'melee',
        name:item.name||'Vapen',
        fv:10,erf:0,damage:'',bv:'',length:'',range:'',bep:'',weight:'',
        handling:'',strengthGroup:null,weaponType:'',price:'',reloadRounds:''
      };
      if(rule)copyRuleWeaponToInstance(w,rule);
      w.fv=10;w.erf=0;w.shopSource='targans_gille';
      c.weapons.push(w);
    }
    return;
  }
  if(item.purchaseKind==='projectile'){
    const name=String(item.metadata?.projectile_name||item.name||'Projektiler').replace(/,\s*\d+\s*st\.?$/i,'');
    const count=qty*Math.max(1,Number(item.quantityPerPurchase)||1);
    const existing=c.projectiles.find(p=>(p.name||'').localeCompare(name,'sv',{sensitivity:'base'})===0);
    if(existing)existing.count=Math.max(0,Number(existing.count)||0)+count;
    else c.projectiles.push({name,count});
    return;
  }
  if(item.purchaseKind==='armor'){
    c.armor=c.armor||[];
    for(let i=0;i<qty;i++)c.armor.push(shopArmorInstance(item));
    return;
  }
  if(item.purchaseKind==='shield'){
    c.shields=c.shields||[];
    for(let i=0;i<qty;i++)c.shields.push({
      equipId:newEquipItemId('shield'),
      name:item.name||'Sköld',
      fv:10,
      erf:0,
      bep:item.bep==null?'':Number(item.bep),
      abs:item.metadata?.abs==null?'':Number(item.metadata.abs),
      strengthGroup:item.metadata?.strength_group==null?null:Number(item.metadata.strength_group),
      shopItemKey:item.itemKey||''
    });
    return;
  }
  c.equipment=c.equipment||[];
  for(let i=0;i<qty;i++)c.equipment.push({
    equipId:newEquipItemId('equipment'),
    name:item.name||'Utrustning',
    bep:item.bep==null?'':Number(item.bep),
    shopItemKey:item.itemKey||'',
    purchaseKind:item.purchaseKind||'equipment'
  });
}

async function shopCheckout(){
  if(shopCheckoutBusy)return;
  const buyer=shopBuyerById();
  const rows=shopCartRows();
  if(!buyer||!rows.length)return;
  const cost=shopCartCostKm(rows);
  const funds=shopCarriedValueKm(buyer);
  if(funds<cost){
    renderShopBuyer();
    return;
  }
  const units=rows.reduce((sum,x)=>sum+(Number(x.row.qty)||0),0);
  const buyerName=buyer.identity?.namn||buyer.name||'rollfiguren';
  const ok=await askConfirm(
    'Handla hos Targan',
    'Köp '+units+' varor till '+buyerName+' för '+shopMoneyLabel(cost)+'? Targan växlar mynten automatiskt.',
    'Köp'
  );
  if(!ok)return;
  shopCheckoutBusy=true;renderShopBuyer();
  const draft=JSON.parse(JSON.stringify(buyer));
  try{
    shopEnsureCoins(draft);
    rows.forEach(({row,item})=>shopAddPurchasedItem(draft,item,row.qty));
    if(!shopSpendCarriedCoins(draft,cost))throw new Error('Börsen räcker inte till köpet.');
    if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(draft);
    const index=(chars||[]).findIndex(c=>String(c.id)===String(buyer.id));
    if(index<0)throw new Error('Köparen kunde inte hittas.');
    chars[index]=draft;
    if(current&&String(current.id)===String(draft.id))current=draft;
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));
    shopCart=[];saveShopCart();
    const status=document.getElementById('shopCartNotice');
    renderShopCart();
    if(status)status.textContent='✓ '+buyerName+' har fått varorna. '+shopMoneyLabel(shopCarriedValueKm(draft))+' återstår i börsen.';
    if(typeof renderCards==='function')renderCards();
  }catch(error){
    alert('Köpet kunde inte genomföras: '+(error?.message||error));
  }finally{
    shopCheckoutBusy=false;
    renderShopBuyer();
  }
}

function renderShopCart(){
  const host=document.getElementById('shopCartLines');
  const count=document.getElementById('shopCartCount');
  const total=document.getElementById('shopCartTotal');
  const clear=document.getElementById('shopCartClear');
  if(!host||!count||!total)return;
  const rows=shopCartRows();
  const units=rows.reduce((sum,x)=>sum+x.row.qty,0);
  count.textContent=String(units);
  clear?.classList.toggle('hidden',!rows.length);
  if(!rows.length){
    host.innerHTML='<div class="shop-cart-empty">Targan väntar på din beställning.</div>';
    total.innerHTML=shopMoneyHtml(0);
    renderShopBuyer();
    return;
  }
  host.innerHTML=rows.map(({row,item})=>
    '<div class="shop-cart-line">'+
      '<div class="shop-cart-copy"><b>'+shopEsc(item.name)+'</b><small>'+shopPriceHtml(item)+' / köp</small></div>'+
      '<div class="shop-cart-stepper">'+
        '<button type="button" onclick="shopChangeQuantity(\''+shopEsc(row.key)+'\',-1)">−</button>'+
        '<span>'+row.qty+'</span>'+
        '<button type="button" onclick="shopChangeQuantity(\''+shopEsc(row.key)+'\',1)">+</button>'+
      '</div>'+
      '<button type="button" class="shop-cart-remove" onclick="shopRemoveItem(\''+shopEsc(row.key)+'\')" aria-label="Ta bort '+shopEsc(item.name)+'">×</button>'+
    '</div>'
  ).join('');
  total.innerHTML=shopMoneyHtml(shopCartCostKm(rows));
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

async function openShop(){
  editing=false;
  document.getElementById('home')?.classList.add('hidden');
  document.getElementById('view')?.classList.add('hidden');
  document.getElementById('admin')?.classList.add('hidden');
  document.getElementById('combatPage')?.classList.add('hidden');
  document.getElementById('innPage')?.classList.add('hidden');
  document.getElementById('shopPage')?.classList.remove('hidden');
  document.getElementById('back')?.classList.add('hidden');
  document.getElementById('editBtn')?.classList.add('hidden');
  document.getElementById('cancelEditBtn')?.classList.add('hidden');
  document.body.classList.add('shop-open');
  void loadShopHeroImage();
  try{
    await loadShopCatalog();
    renderShopCategories();
    renderShopItems();
    renderShopCart();
    renderShopBuyer();
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
