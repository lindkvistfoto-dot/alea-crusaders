/* Värdshus — player-facing lodging, meals and services. */
const INN_CART_STORAGE_KEY='alea_inn_cart_v1';
const INN_SECTIONS=[
  {category:'Boende',title:'Boende'},
  {category:'Mat & dryck',title:'Mat'},
  {category:'Tjänster',title:'Tjänster'}
];
const INN_HERO_SRC='./assets/innkeeper-hero.jpg?v=0.33.18';

let innCatalog=[];
let innCatalogLoaded=false;
let innSearch='';
let innCart=loadInnCart();
let innBuyerId='';
let innCheckoutBusy=false;
let innExpandedItemKey='';
let innGameType='high';
let innGameStakeKm=5;
let innGameBusy=false;
let innGameResult=null;
let innGamePhase='idle';
const INN_FIVE_CROWNS_PAYOUTS={
  'Ett par':0,
  'Två par':1,
  'Triss':2,
  'Kåk':3,
  'Stege':4,
  'Fyrtal':8,
  'Fem kronor':50,
  'Fem sexor':100,
  'Ingen vinst':0
};
let innGameHouseDice=null;
let innGamePlayerDice=null;
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

function innFilteredItems(){
  const query=innSearch.trim().toLocaleLowerCase('sv-SE');
  return innCatalog.filter(item=>{
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

function innItemRowHtml(item){
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
}

function renderInnItems(){
  const host=document.getElementById('innItems');
  if(!host)return;
  const rows=innFilteredItems();
  const count=document.getElementById('innResultCount');
  if(count)count.textContent=rows.length+' alternativ';

  host.innerHTML=INN_SECTIONS.map(section=>{
    const sectionRows=rows.filter(item=>item.category===section.category);
    return '<section class="inn-menu-section" data-inn-category="'+shopEsc(section.category)+'">'+
      '<h3 class="inn-menu-heading">'+shopEsc(section.title)+'</h3>'+
      '<div class="inn-menu-list">'+
        (sectionRows.length
          ?sectionRows.map(innItemRowHtml).join('')
          :'<div class="inn-menu-empty">Inga träffar.</div>')+
      '</div>'+
    '</section>';
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
  renderInnGame();
}

function innGameSetBuyer(id){
  innSetBuyer(id);
}

function innGameSetStakeKm(value){
  innGameStakeKm=Math.max(1,Math.floor(Number(value)||1));
  renderInnGame();
}

function innGameSetType(type){
  if(innGameBusy)return;
  innGameType=type==='five'?'five':'high';
  innGameResult=null;
  innGameHouseDice=null;
  innGamePlayerDice=null;
  innGamePhase='idle';
  window.alea3dInnClear?.();
  renderInnGame();
}

function openInnGame(){
  const modal=document.getElementById('innGameModal');
  if(!modal)return;
  modal.classList.remove('hidden');
  document.body.classList.add('inn-game-open');
  renderInnGame();
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.alea3dInnPrepare?.()));
  setTimeout(()=>document.getElementById('innGamePlayBtn')?.focus(),0);
}

function closeInnGame(){
  if(innGameBusy){
    const notice=document.getElementById('innGameNotice');
    if(notice)notice.textContent='Vänta tills kastet är avgjort.';
    return;
  }
  document.getElementById('innGameModal')?.classList.add('hidden');
  document.body.classList.remove('inn-game-open');
}

function innRandomD6(){
  try{
    if(globalThis.crypto?.getRandomValues){
      const box=new Uint32Array(1);
      const limit=Math.floor(4294967296/6)*6;
      do{globalThis.crypto.getRandomValues(box);}while(box[0]>=limit);
      return (box[0]%6)+1;
    }
  }catch(_error){}
  return Math.floor(Math.random()*6)+1;
}

function innRoll2d6(){
  return [innRandomD6(),innRandomD6()];
}

function innWait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function innDiceBoxValues(result,qty=2){
  return (Array.isArray(result)?result:[])
    .map(row=>Number(row?.value))
    .filter(value=>Number.isInteger(value)&&value>=1&&value<=6)
    .slice(0,qty);
}

function innFallbackDiceHtml(values,rolling=false){
  const faces=['','⚀','⚁','⚂','⚃','⚄','⚅'];
  return values.map(value=>'<span class="inn-game-fallback-die '+(rolling?'rolling':'')+'">'+faces[value]+'</span>').join('');
}

function innRandomDice(qty){
  return Array.from({length:qty},()=>innRandomD6());
}

async function innFallbackAnimatedRoll(qty=2){
  const host=document.getElementById('innGameDiceFallback');
  if(!host)return innRandomDice(qty);
  host.classList.remove('hidden');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduced){
    const values=innRandomDice(qty);
    host.innerHTML=innFallbackDiceHtml(values,false);
    return values;
  }
  const started=Date.now();
  while(Date.now()-started<950){
    host.innerHTML=innFallbackDiceHtml(innRandomDice(qty),true);
    await innWait(85);
  }
  const values=innRandomDice(qty);
  host.innerHTML=innFallbackDiceHtml(values,false);
  return values;
}

async function innAnimatedDice(qty=2){
  const fallback=document.getElementById('innGameDiceFallback');
  if(fallback){
    fallback.classList.add('hidden');
    fallback.innerHTML='';
  }
  if(typeof window.alea3dInnRoll==='function'){
    try{
      const result=await window.alea3dInnRoll([{qty,sides:6}]);
      const values=innDiceBoxValues(result,qty);
      if(values.length===qty)return values;
      throw new Error('DiceBox returnerade inte rätt antal giltiga T6-resultat.');
    }catch(error){
      console.warn('Värdshusets DiceBox-kast misslyckades, använder reservanimation.',error);
    }
  }
  return innFallbackAnimatedRoll(qty);
}

function innAnimated2d6(){
  return innAnimatedDice(2);
}

function innFiveCrownsCategory(dice){
  const counts=[...new Map(dice.map(value=>[value,dice.filter(x=>x===value).length])).values()].sort((a,b)=>b-a);
  const unique=[...new Set(dice)].sort((a,b)=>a-b);
  if(dice.every(value=>value===6))return 'Fem sexor';
  if(counts[0]===5)return 'Fem kronor';
  if(counts[0]===4)return 'Fyrtal';
  if(counts[0]===3&&counts[1]===2)return 'Kåk';
  if(counts[0]===3)return 'Triss';
  if(counts[0]===2&&counts[1]===2)return 'Två par';
  if(counts[0]===2)return 'Ett par';
  if(unique.length===5&&(
    unique.join(',')==='1,2,3,4,5'||
    unique.join(',')==='2,3,4,5,6'
  ))return 'Stege';
  return 'Ingen vinst';
}

function innFiveCrownsProbabilityTable(){
  return [
    {name:'Ett par',chance:'46,30 %',payout:'0×'},
    {name:'Två par',chance:'23,15 %',payout:'1×'},
    {name:'Triss',chance:'15,43 %',payout:'2×'},
    {name:'Kåk',chance:'3,86 %',payout:'3×'},
    {name:'Stege',chance:'3,09 %',payout:'4×'},
    {name:'Fyrtal',chance:'1,93 %',payout:'8×'},
    {name:'Fem kronor',chance:'0,064 %',payout:'50×'},
    {name:'Fem sexor',chance:'0,013 %',payout:'100×'}
  ];
}

function innDieHtml(value){
  const faces=['','⚀','⚁','⚂','⚃','⚄','⚅'];
  return '<span class="inn-game-die" aria-label="'+value+'">'+faces[value]+'</span>';
}

function innGameResultHtml(){
  if(innGameType==='five'){
    if(innGameBusy){
      return '<div class="inn-game-phase-message"><b>Fem tärningar kastas…</b><span>Jakten på Fem kronor är igång.</span></div>';
    }
    if(!innGameResult){
      return '<div class="inn-game-awaiting">Välj insats och kasta fem T6.</div>';
    }
    const r=innGameResult;
    const net=r.payoutKm-r.stakeKm;
    const outcomeClass=net>0?'win':net===0?'tie':'loss';
    const money=r.multiplier>0
      ?'Utbetalning: <b>'+r.multiplier+'× = '+shopMoneyHtml(r.payoutKm)+'</b>'+(net>0?' · Netto +'+shopMoneyHtml(net):net===0?' · Insatsen tillbaka':'')
      :'Ingen utbetalning · Förlust <b>−'+shopMoneyHtml(r.stakeKm)+'</b>';
    return '<div class="inn-five-result">'+
      '<div class="inn-five-result-dice">'+r.playerDice.map(innDieHtml).join('')+'</div>'+
      '<div class="inn-game-outcome '+outcomeClass+'"><strong>'+shopEsc(r.category)+'</strong><span>'+money+'</span></div>'+
    '</div>';
  }

  if(innGameBusy){
    if(innGamePhase==='house'){
      return '<div class="inn-game-phase-message"><b>Huset kastar…</b><span>Två T6 rullar över bordet.</span></div>';
    }
    if(innGamePhase==='house-wait'&&Array.isArray(innGameHouseDice)){
      const total=innGameHouseDice.reduce((sum,value)=>sum+value,0);
      return '<div class="inn-game-phase-message house-settled"><b>Huset fick '+total+'</b><span>Din tur…</span></div>';
    }
    if(innGamePhase==='player'){
      const houseTotal=Array.isArray(innGameHouseDice)?innGameHouseDice.reduce((sum,value)=>sum+value,0):0;
      return '<div class="inn-game-phase-message"><b>Du kastar…</b><span>Huset står på '+houseTotal+'.</span></div>';
    }
  }
  if(!innGameResult){
    return '<div class="inn-game-awaiting">Välj insats och starta spelet. Huset kastar först.</div>';
  }
  const r=innGameResult;
  const outcomeClass=r.outcome==='win'?'win':r.outcome==='tie'?'tie':'loss';
  const headline=r.outcome==='win'
    ?'Du vann!'
    :r.outcome==='tie'
      ?'Oavgjort'
      :'Huset vann';
  const money=r.outcome==='win'
    ?'Vinst: <b>+'+shopMoneyHtml(r.stakeKm)+'</b>'
    :r.outcome==='tie'
      ?'Insatsen återbetalas.'
      :'Förlust: <b>−'+shopMoneyHtml(r.stakeKm)+'</b>';
  return '<div class="inn-game-rolls">'+
    '<div class="inn-game-roll"><span>Huset</span><div>'+r.houseDice.map(innDieHtml).join('')+'</div><b>'+r.houseTotal+'</b></div>'+
    '<div class="inn-game-versus">mot</div>'+
    '<div class="inn-game-roll"><span>Du</span><div>'+r.playerDice.map(innDieHtml).join('')+'</div><b>'+r.playerTotal+'</b></div>'+
  '</div>'+
  '<div class="inn-game-outcome '+outcomeClass+'"><strong>'+headline+'</strong><span>'+money+'</span></div>';
}

function innGameInfoHtml(){
  if(innGameType==='five'){
    return '<p>Du kastar fem T6 en gång. Kombinationen avgör utbetalningen. Fem kronor betyder fem lika; fem sexor är toppvinsten.</p>'+
      '<div class="inn-five-paytable">'+
        innFiveCrownsProbabilityTable().map(row=>
          '<div><span>'+row.name+'</span><small>'+row.chance+'</small><b>'+row.payout+'</b></div>'
        ).join('')+
      '</div>'+
      '<div class="inn-five-rtp">Teoretisk återbetalning: <b>97,9 %</b> · Husfördel: <b>2,1 %</b></div>';
  }
  return '<p>Huset slår 2T6 först. Efter en kort paus kastar du dina 2T6. Högst summa vinner.</p>'+
    '<div class="inn-game-rules"><span>Vinst <b>2×</b></span><span>Oavgjort <b>1×</b></span><span>Förlust <b>0×</b></span></div>';
}

function renderInnGame(){
  const select=document.getElementById('innGameBuyerSelect');
  const balance=document.getElementById('innGameBalance');
  const info=document.getElementById('innGameInfo');
  const play=document.getElementById('innGamePlayBtn');
  const result=document.getElementById('innGameResult');
  if(!select||!balance||!play||!result)return;

  document.querySelectorAll('[data-inn-game-type]').forEach(button=>{
    button.classList.toggle('active',button.dataset.innGameType===innGameType);
    button.disabled=innGameBusy;
  });
  if(info)info.innerHTML=innGameInfoHtml();

  const title=document.getElementById('innGameTitle');
  if(title)title.textContent=innGameType==='five'?'Fem kronor':'Högt kast';

  const buyers=innEligibleBuyers();
  if(!buyers.some(c=>String(c.id)===String(innBuyerId)))innBuyerId=buyers[0]?String(buyers[0].id):'';
  select.innerHTML=buyers.length
    ?buyers.map(c=>'<option value="'+shopEsc(c.id)+'" '+(String(c.id)===String(innBuyerId)?'selected':'')+'>'+shopEsc(c.identity?.namn||c.name||'Namnlös')+'</option>').join('')
    :'<option value="">Ingen tillgänglig rollfigur</option>';
  select.disabled=!buyers.length||innGameBusy;

  document.querySelectorAll('[data-inn-game-stake]').forEach(button=>{
    const value=Number(button.dataset.innGameStake)||0;
    button.classList.toggle('active',value===innGameStakeKm);
    button.disabled=innGameBusy;
  });

  const buyer=innBuyerById();
  const funds=buyer?shopCarriedValueKm(buyer):0;
  balance.innerHTML=buyer
    ?'<span>Börs: <b>'+shopMoneyHtml(funds)+'</b></span><span>Insats: <b>'+shopMoneyHtml(innGameStakeKm)+'</b></span>'
    :'Ingen rollfigur är kopplad till ditt konto.';
  play.disabled=innGameBusy||!buyer||funds<innGameStakeKm;
  play.textContent=innGameBusy
    ?innGameType==='five'
      ?'Fem tärningar rullar…'
      :innGamePhase==='house'?'Huset kastar…':innGamePhase==='house-wait'?'Din tur snart…':innGamePhase==='player'?'Du kastar…':'Avgör…'
    :innGameType==='five'?'Kasta fem tärningar':'Spela';
  result.innerHTML=innGameResultHtml();

  const phase=document.getElementById('innGamePhaseLabel');
  if(phase){
    phase.textContent=innGameType==='five'
      ?innGameBusy?'5T6 · KASTAR':'5T6 · FEM KRONOR'
      :innGameBusy
        ?innGamePhase==='house'?'HUSET KASTAR':innGamePhase==='house-wait'?'HUSET: '+(innGameHouseDice||[]).reduce((s,v)=>s+v,0)+' · DIN TUR':innGamePhase==='player'?'DITT KAST':'AVGJORT'
        :'2T6 · HUSET BÖRJAR';
  }

  const notice=document.getElementById('innGameNotice');
  if(notice){
    notice.innerHTML=buyer&&funds<innGameStakeKm
      ?'Du behöver '+shopMoneyHtml(innGameStakeKm-funds)+' till för den insatsen.'
      :'';
  }
}

async function innPlayHighRoll(){
  if(innGameType==='five')return innPlayFiveCrowns();
  if(innGameBusy)return;
  const buyer=innBuyerById();
  if(!buyer)return;
  const stake=Math.max(1,Math.floor(Number(innGameStakeKm)||1));
  if(shopCarriedValueKm(buyer)<stake){
    renderInnGame();
    return;
  }

  innGameBusy=true;
  innGameResult=null;
  innGameHouseDice=null;
  innGamePlayerDice=null;
  innGamePhase='house';
  renderInnGame();

  const draft=JSON.parse(JSON.stringify(buyer));
  try{
    shopEnsureCoins(draft);
    if(!shopSpendCarriedCoins(draft,stake))throw new Error('Börsen räcker inte till insatsen.');

    await window.alea3dInnClear?.();
    const houseDice=await innAnimated2d6();
    innGameHouseDice=houseDice;
    innGamePhase='house-wait';
    renderInnGame();

    await innWait(1050);

    innGamePhase='player';
    renderInnGame();
    await window.alea3dInnClear?.();
    const playerDice=await innAnimated2d6();
    innGamePlayerDice=playerDice;

    const playerTotal=playerDice[0]+playerDice[1];
    const houseTotal=houseDice[0]+houseDice[1];
    let outcome='loss';
    let payout=0;
    if(playerTotal>houseTotal){
      outcome='win';
      payout=stake*2;
    }else if(playerTotal===houseTotal){
      outcome='tie';
      payout=stake;
    }

    if(payout>0){
      const afterStake=shopCarriedValueKm(draft);
      draft.coins.carried=shopMoneyBreakdown(afterStake+payout);
    }

    if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(draft);
    const index=(chars||[]).findIndex(c=>String(c.id)===String(buyer.id));
    if(index<0)throw new Error('Spelaren kunde inte hittas.');
    chars[index]=draft;
    if(current&&String(current.id)===String(draft.id))current=draft;
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));

    innGameResult={playerDice,houseDice,playerTotal,houseTotal,outcome,stakeKm:stake};
    innGamePhase='result';
    if(typeof renderCards==='function')renderCards();
    renderInnBuyer();
  }catch(error){
    innGamePhase='idle';
    const notice=document.getElementById('innGameNotice');
    if(notice)notice.textContent='Spelet kunde inte genomföras: '+(error?.message||error);
  }finally{
    innGameBusy=false;
    renderInnGame();
  }
}

async function innPlayFiveCrowns(){
  if(innGameBusy)return;
  const buyer=innBuyerById();
  if(!buyer)return;
  const stake=Math.max(1,Math.floor(Number(innGameStakeKm)||1));
  if(shopCarriedValueKm(buyer)<stake){
    renderInnGame();
    return;
  }

  innGameBusy=true;
  innGameResult=null;
  innGameHouseDice=null;
  innGamePlayerDice=null;
  innGamePhase='player';
  renderInnGame();

  const draft=JSON.parse(JSON.stringify(buyer));
  try{
    shopEnsureCoins(draft);
    if(!shopSpendCarriedCoins(draft,stake))throw new Error('Börsen räcker inte till insatsen.');

    await window.alea3dInnClear?.();
    const playerDice=await innAnimatedDice(5);
    innGamePlayerDice=playerDice;

    const category=innFiveCrownsCategory(playerDice);
    const multiplier=Number(INN_FIVE_CROWNS_PAYOUTS[category])||0;
    const payoutKm=stake*multiplier;

    if(payoutKm>0){
      const afterStake=shopCarriedValueKm(draft);
      draft.coins.carried=shopMoneyBreakdown(afterStake+payoutKm);
    }

    if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(draft);
    const index=(chars||[]).findIndex(c=>String(c.id)===String(buyer.id));
    if(index<0)throw new Error('Spelaren kunde inte hittas.');
    chars[index]=draft;
    if(current&&String(current.id)===String(draft.id))current=draft;
    localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));

    innGameResult={playerDice,category,multiplier,payoutKm,stakeKm:stake};
    innGamePhase='result';
    if(typeof renderCards==='function')renderCards();
    renderInnBuyer();
  }catch(error){
    innGamePhase='idle';
    const notice=document.getElementById('innGameNotice');
    if(notice)notice.textContent='Spelet kunde inte genomföras: '+(error?.message||error);
  }finally{
    innGameBusy=false;
    renderInnGame();
  }
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
    renderInnItems();
    renderInnCart();
    renderInnBuyer();
    renderInnGame();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(_error){
    renderInnCart();
    renderInnGame();
  }
}

function closeInn(){
  closeInnGame();
  document.getElementById('innPage')?.classList.add('hidden');
  document.body.classList.remove('inn-open');
  goHome();
}
