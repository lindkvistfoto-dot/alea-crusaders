/* Värdshus — player-facing lodging, meals and services. */
const INN_CART_STORAGE_KEY='alea_inn_cart_v1';
const INN_CATEGORY_ORDER=['Alla','Boende','Mat & dryck','Tjänster'];
const INN_HERO_SRC='./assets/innkeeper-hero.jpg?v=0.32.0';

let innCatalog=[];
let innCatalogLoaded=false;
let innCategory='Alla';
let innSearch='';
let innCart=loadInnCart();
let innBuyerId='';
let innCheckoutBusy=false;
let innExpandedItemKey='';
const innRowQuantities=new Map();

function loadInnCart(){
  try{
    const value=JSON.parse(localStorage.getItem(INN_CART_STORAGE_KEY)||'[]');
    if(!Array.isArray(value))return [];
    return value
      .map(row=>({key:String(row?.key||''),qty:Math.max(1,Math.min(99,Number(row?.qty)||1))}))
      .filter(row=>row.key);
  }catch(_error){
    return [];
  }
}

function saveInnCart(){
  localStorage.setItem(INN_CART_STORAGE_KEY,JSON.stringify(innCart));
}

async function loadInnHeroImage(){
  const img=document.getElementById('innHeroImage');
  if(!img||img.dataset.innHeroLoaded==='1')return;
  img.dataset.innHeroLoaded='1';
  img.onload=()=>img.classList.add('loaded');
  img.onerror=()=>{
    img.classList.remove('loaded');
    console.warn('Värdshusbilden kunde inte laddas');
  };
  img.src=INN_HERO_SRC;
}

function normalizeInnItem(row){
  return {
    key:'inn:'+String(row.item_key||row.id||''),
    sourceId:row.id,
    itemKey:row.item_key||'',
    category:row.category||'Tjänster',
    name:row.name||'Namnlös tjänst',
    description:row.description||'',
    priceAmount:Number(row.price_amount)||0,
    priceCurrency:row.price_currency||'SM',
    unitLabel:row.unit_label||'',
    metadata:row.metadata||{},
    sortOrder:Number(row.sort_order)||0
  };
}

async function loadInnCatalog(force=false){
  if(innCatalogLoaded&&!force)return innCatalog;
  const status=document.getElementById('innStatus');
  if(status)status.textContent='Värdinnan ser efter vad huset kan erbjuda…';
  try{
    const rows=await dbJson('rule_inn_items?active=eq.true&select=*&order=sort_order.asc,name.asc');
    innCatalog=(rows||[]).map(normalizeInnItem);
    innCatalogLoaded=true;
    if(status)status.textContent='';
    return innCatalog;
  }catch(error){
    innCatalog=[];
    innCatalogLoaded=false;
    if(status)status.textContent='Kunde inte läsa värdshusets utbud: '+(error?.message||error);
    throw error;
  }
}

function innCategories(){
  const found=new Set(innCatalog.map(item=>item.category).filter(Boolean));
  const ordered=INN_CATEGORY_ORDER.filter(name=>name==='Alla'||found.has(name));
  const extra=[...found].filter(name=>!INN_CATEGORY_ORDER.includes(name)).sort((a,b)=>a.localeCompare(b,'sv'));
  return [...ordered,...extra];
}

function innFilteredItems(){
  const query=innSearch.trim().toLocaleLowerCase('sv-SE');
  return innCatalog.filter(item=>{
    if(innCategory!=='Alla'&&item.category!==innCategory)return false;
    if(!query)return true;
    return [item.name,item.description,item.category,item.unitLabel,item.itemKey]
      .join(' ')
      .toLocaleLowerCase('sv-SE')
      .includes(query);
  }).sort((a,b)=>{
    if(a.category!==b.category)return a.category.localeCompare(b.category,'sv');
    if(a.sortOrder!==b.sortOrder)return a.sortOrder-b.sortOrder;
    return a.name.localeCompare(b.name,'sv');
  });
}

function innItemByKey(key){
  return innCatalog.find(item=>item.key===key)||null;
}

function innPriceHtml(item){
  return shopCurrencyAmountHtml(item.priceAmount,item.priceCurrency||'SM');
}

function innRowQuantity(key){
  return Math.max(1,Math.min(99,Number(innRowQuantities.get(key))||1));
}

function innChangeRowQuantity(key,delta){
  innRowQuantities.set(key,Math.max(1,Math.min(99,innRowQuantity(key)+(Number(delta)||0))));
  renderInnItems();
}

function innToggleItemDetails(key){
  innExpandedItemKey=innExpandedItemKey===key?'':key;
  renderInnItems();
}

function innDetailsHtml(item){
  const pills=[];
  if(item.unitLabel)pills.push('<span>'+shopEsc(item.unitLabel)+'</span>');
  const capacity=Number(item.metadata?.capacity)||0;
  if(capacity>0)pills.push('<span>Upp till '+capacity+' personer</span>');
  return pills.join('');
}

function renderInnCategories(){
  const host=document.getElementById('innCategories');
  if(!host)return;
  host.innerHTML=innCategories().map(name=>
    '<button type="button" class="shop-category '+(name===innCategory?'active':'')+'" onclick="innSetCategory(\''+shopEsc(name).replaceAll("'","\\'")+'\')">'+shopEsc(name)+'</button>'
  ).join('');
}

function renderInnItems(){
  const host=document.getElementById('innItems');
  if(!host)return;
  const rows=innFilteredItems();
  const count=document.getElementById('innResultCount');
  if(count)count.textContent=rows.length+' alternativ';
  if(!rows.length){
    host.innerHTML='<div class="shop-empty"><b>Inget matchar.</b><span>Prova en annan kategori eller sökning.</span></div>';
    return;
  }
  host.innerHTML=rows.map(item=>{
    const key=shopEsc(item.key);
    const qty=innRowQuantity(item.key);
    const expanded=innExpandedItemKey===item.key;
    const description=item.description?'<p>'+shopEsc(item.description)+'</p>':'';
    const details=innDetailsHtml(item);
    return '<article class="shop-item-row '+(expanded?'expanded':'')+'">'+
      '<div class="shop-item-main">'+
        '<button type="button" class="shop-item-name" aria-expanded="'+(expanded?'true':'false')+'" onclick="innToggleItemDetails(\''+key+'\')">'+shopEsc(item.name)+'</button>'+
        '<span class="shop-item-price">'+innPriceHtml(item)+'</span>'+
        '<div class="shop-row-stepper" aria-label="Antal">'+
          '<button type="button" onclick="innChangeRowQuantity(\''+key+'\',-1)" aria-label="Minska antal">−</button>'+
          '<span>'+qty+'</span>'+
          '<button type="button" onclick="innChangeRowQuantity(\''+key+'\',1)" aria-label="Öka antal">+</button>'+
        '</div>'+
        '<button type="button" class="shop-row-buy" onclick="innAddItem(\''+key+'\','+qty+')">Beställ</button>'+
      '</div>'+
      '<div class="shop-item-details '+(expanded?'':'hidden')+'">'+
        (details?'<div class="shop-item-meta inn-item-meta">'+details+'</div>':'')+
        description+
        '<div class="shop-item-detail-price">Pris: <b>'+innPriceHtml(item)+'</b></div>'+
      '</div>'+
    '</article>';
  }).join('');
}

function innAddItem(key,quantity=1){
  const item=innItemByKey(key);
  if(!item)return;
  const qty=Math.max(1,Math.min(99,Math.floor(Number(quantity)||1)));
  const existing=innCart.find(row=>row.key===key);
  if(existing)existing.qty=Math.min(99,existing.qty+qty);
  else innCart.push({key,qty});
  innRowQuantities.set(key,1);
  saveInnCart();
  renderInnItems();
  renderInnCart();
  const status=document.getElementById('innCartNotice');
  if(status){
    status.textContent=(qty>1?qty+' × ':'')+item.name+' lades på notan.';
    clearTimeout(innAddItem._timer);
    innAddItem._timer=setTimeout(()=>{if(status)status.textContent='';},1400);
  }
}

function innChangeQuantity(key,delta){
  const row=innCart.find(x=>x.key===key);
  if(!row)return;
  row.qty=Math.max(0,Math.min(99,row.qty+(Number(delta)||0)));
  if(row.qty===0)innCart=innCart.filter(x=>x.key!==key);
  saveInnCart();
  renderInnCart();
}

function innRemoveItem(key){
  innCart=innCart.filter(row=>row.key!==key);
  saveInnCart();
  renderInnCart();
}

function innClearCart(){
  innCart=[];
  saveInnCart();
  renderInnCart();
}

function innCartRows(){
  return innCart.map(row=>({row,item:innItemByKey(row.key)})).filter(x=>x.item);
}

function innCartCostKm(rows=innCartRows()){
  return rows.reduce((sum,{row,item})=>{
    return sum+(Number(item.priceAmount)||0)*shopCurrencyValueKm(item.priceCurrency||'SM')*(Number(row.qty)||0);
  },0);
}

function innEligibleBuyers(){
  return typeof shopEligibleBuyers==='function'?shopEligibleBuyers():[];
}

function innBuyerById(id=innBuyerId){
  return innEligibleBuyers().find(c=>String(c.id)===String(id))||null;
}

function innSetBuyer(id){
  const next=innBuyerById(id);
  innBuyerId=next?String(next.id):'';
  renderInnBuyer();
}

function renderInnBuyer(){
  const select=document.getElementById('innBuyerSelect');
  const balance=document.getElementById('innBuyerBalance');
  const button=document.getElementById('innCheckoutBtn');
  if(!select||!balance||!button)return;

  const buyers=innEligibleBuyers();
  if(!buyers.some(c=>String(c.id)===String(innBuyerId)))innBuyerId=buyers[0]?String(buyers[0].id):'';
  select.innerHTML=buyers.length
    ?buyers.map(c=>'<option value="'+shopEsc(c.id)+'" '+(String(c.id)===String(innBuyerId)?'selected':'')+'>'+shopEsc(c.identity?.namn||c.name||'Namnlös')+'</option>').join('')
    :'<option value="">Ingen tillgänglig rollfigur</option>';
  select.disabled=!buyers.length;

  const buyer=innBuyerById();
  const cost=innCartCostKm();
  if(!buyer){
    balance.textContent='Ingen rollfigur är kopplad till ditt konto.';
    button.disabled=true;
    return;
  }

  const funds=shopCarriedValueKm(buyer);
  balance.innerHTML='<span>Börs (buret): <b>'+shopMoneyHtml(funds)+'</b></span>'+
    (cost>funds?'<span class="shop-insufficient">Saknar '+shopMoneyHtml(cost-funds)+'</span>':'');
  button.disabled=innCheckoutBusy||!innCartRows().length||cost>funds;
  button.innerHTML=innCheckoutBusy?'Betalar…':'Betala '+shopMoneyHtml(cost);
}

function renderInnCart(){
  const host=document.getElementById('innCartLines');
  const count=document.getElementById('innCartCount');
  const total=document.getElementById('innCartTotal');
  const clear=document.getElementById('innCartClear');
  if(!host||!count||!total)return;

  const rows=innCartRows();
  const units=rows.reduce((sum,x)=>sum+(Number(x.row.qty)||0),0);
  count.textContent=String(units);
  clear?.classList.toggle('hidden',!rows.length);

  if(!rows.length){
    host.innerHTML='<div class="shop-cart-empty">Notan är tom.</div>';
    total.innerHTML=shopMoneyHtml(0);
    renderInnBuyer();
    return;
  }

  host.innerHTML=rows.map(({row,item})=>
    '<div class="shop-cart-line">'+
      '<div class="shop-cart-copy"><b>'+shopEsc(item.name)+'</b><small>'+innPriceHtml(item)+(item.unitLabel?' · '+shopEsc(item.unitLabel):'')+'</small></div>'+
      '<div class="shop-cart-stepper">'+
        '<button type="button" onclick="innChangeQuantity(\''+shopEsc(row.key)+'\',-1)">−</button>'+
        '<span>'+row.qty+'</span>'+
        '<button type="button" onclick="innChangeQuantity(\''+shopEsc(row.key)+'\',1)">+</button>'+
      '</div>'+
      '<button type="button" class="shop-cart-remove" onclick="innRemoveItem(\''+shopEsc(row.key)+'\')" aria-label="Ta bort '+shopEsc(item.name)+'">×</button>'+
    '</div>'
  ).join('');

  total.innerHTML=shopMoneyHtml(innCartCostKm(rows));
  renderInnBuyer();
}

async function innCheckout(){
  if(innCheckoutBusy)return;
  const buyer=innBuyerById();
  const rows=innCartRows();
  if(!buyer||!rows.length)return;

  const cost=innCartCostKm(rows);
  const funds=shopCarriedValueKm(buyer);
  if(funds<cost){
    renderInnBuyer();
    return;
  }

  const units=rows.reduce((sum,x)=>sum+(Number(x.row.qty)||0),0);
  const buyerName=buyer.identity?.namn||buyer.name||'rollfiguren';
  const ok=await askConfirm(
    'Betala värdshuset',
    'Betala '+units+' poster för '+buyerName+' till ett värde av '+shopMoneyLabel(cost)+'?',
    'Betala'
  );
  if(!ok)return;

  innCheckoutBusy=true;
  renderInnBuyer();
  const draft=JSON.parse(JSON.stringify(buyer));

  try{
    shopEnsureCoins(draft);
    if(!shopSpendCarriedCoins(draft,cost))throw new Error('Börsen räcker inte till notan.');
    if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(draft);

    const index=(chars||[]).findIndex(c=>String(c.id)===String(buyer.id));
    if(index<0)throw new Error('Betalaren kunde inte hittas.');
    chars[index]=draft;
    if(current&&String(current.id)===String(draft.id))current=draft;
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));

    innCart=[];
    saveInnCart();
    renderInnCart();
    const status=document.getElementById('innCartNotice');
    if(status)status.innerHTML='✓ Notan är betald. '+shopMoneyHtml(shopCarriedValueKm(draft))+' återstår i börsen.';
    if(typeof renderCards==='function')renderCards();
  }catch(error){
    alert('Betalningen kunde inte genomföras: '+(error?.message||error));
  }finally{
    innCheckoutBusy=false;
    renderInnBuyer();
  }
}

function innSetCategory(name){
  innCategory=name||'Alla';
  renderInnCategories();
  renderInnItems();
}

function innSetSearch(value){
  innSearch=String(value||'');
  renderInnItems();
}

async function openInn(){
  editing=false;
  document.getElementById('home')?.classList.add('hidden');
  document.getElementById('view')?.classList.add('hidden');
  document.getElementById('admin')?.classList.add('hidden');
  document.getElementById('combatPage')?.classList.add('hidden');
  document.getElementById('mapPage')?.classList.add('hidden');
  document.getElementById('dicePage')?.classList.add('hidden');
  document.getElementById('shopPage')?.classList.add('hidden');
  document.getElementById('innPage')?.classList.remove('hidden');
  document.getElementById('back')?.classList.add('hidden');
  document.getElementById('editBtn')?.classList.add('hidden');
  document.getElementById('cancelEditBtn')?.classList.add('hidden');
  document.body.classList.remove('shop-open');
  document.body.classList.add('inn-open');

  void loadInnHeroImage();
  try{
    await loadInnCatalog();
    renderInnCategories();
    renderInnItems();
    renderInnCart();
    renderInnBuyer();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(_error){
    renderInnCart();
  }
}

function closeInn(){
  document.getElementById('innPage')?.classList.add('hidden');
  document.body.classList.remove('inn-open');
  goHome();
}
