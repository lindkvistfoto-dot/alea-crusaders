/* Alea Crusaders Akademin — character progression, training and tutors.
 * All character changes are saved through the same central sync as Targans Gille.
 * Days are taken from the campaign clock; training never advances time itself. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rules=()=>window.aleaAcademyRules;
 let selectedId='',filter='all',search='',usingBonus=true,mode='self',hours=8,busy=false,notice='';
 let teacher={fv:18,intelligence:15,classmates:1,differentRace:0,ownDifferentRace:false,magician:false};
 const eligible=()=>typeof shopEligibleBuyers==='function'?shopEligibleBuyers():[];
 const selected=()=>eligible().find(c=>String(c.id)===selectedId)||null;
 const currentDay=()=>typeof campaignDayState!=='undefined'?Number(campaignDayState?.day_number):NaN;
 const registry=()=>typeof ruleSkills!=='undefined'?ruleSkills:[];
 const ruleFor=id=>registry().find(r=>String(r.id)===String(id));
 const wealth=c=>typeof shopCarriedValueKm==='function'?shopCarriedValueKm(c):0;
 const money=v=>typeof shopMoneyLabel==='function'?shopMoneyLabel(v):Math.round(v/10)+' SM';
 function activeRuleList(c){
  const ids=new Set((c?.skills||[]).map(s=>String(s.skillId||'')));
  const names=new Set((c?.skills||[]).map(s=>String(s.name||'').toLocaleLowerCase('sv-SE')));
  const tracked=new Set((c?.baseChanceSkills||[]).map(s=>String(s.skillId||'')));
  return registry().filter(r=>ids.has(String(r.id))||names.has(String(r.name||'').toLocaleLowerCase('sv-SE'))||tracked.has(String(r.id)));
 }
 function sortedRules(c){
  return activeRuleList(c).map(rule=>({rule,quote:rules().quote(c,rule,usingBonus)}))
   .filter(({rule,quote})=>{
    if(search&&!String(rule.name||'').toLocaleLowerCase('sv-SE').includes(search.toLocaleLowerCase('sv-SE')))return false;
    if(filter==='ready')return quote.ready;
    if(filter==='erf')return quote.erf>0;
    if(filter==='available')return quote.required!==null;
    return true;
   }).sort((a,b)=>Number(b.quote.ready)-Number(a.quote.ready)||b.quote.erf-a.quote.erf||
    String(a.rule.name).localeCompare(String(b.rule.name),'sv'));
 }
 const option=(value,text,selectedValue)=>'<option value="'+esc(value)+'"'+(String(value)===String(selectedValue)?' selected':'')+'>'+esc(text)+'</option>';
 function skillRow(c,rule,q){
  return '<div class="academy-skill-row'+(q.ready?' ready':'')+'">'+
   '<div class="academy-skill-title"><b>'+esc(rule.name)+'</b><small>'+esc(rule.type||'Övrigt')+' · kategori '+esc(q.category)+' · grundkostnad '+esc(q.baseCost)+'</small></div>'+
   '<div class="academy-skill-numbers"><span>FV <b>'+q.fv+'</b> → '+(q.multiplier?q.next:'—')+'</span>'+
    '<span>ERF <b>'+q.erf+'</b></span><span>Nästa FV <b>'+(q.required===null?'—':q.required)+'</b> p'+(q.multiplier?' (×'+q.multiplier+')':'')+'</span></div>'+
   '<div class="academy-skill-actions"><span class="'+(q.ready?'academy-can-buy':'academy-missing')+'">'+
    (q.ready?'Redo att höja':q.required===null?'Ej köpbart':q.missing+' poäng saknas')+'</span>'+
    '<button class="btn academy-buy" type="button" '+(!q.ready||busy?'disabled ':'')+
     'onclick="window.aleaAcademy.buy(\''+esc(rule.id)+'\')">Höj FV</button></div></div>';
 }
 function renderSkills(){
  const c=selected(),host=$('academySkills');if(!host)return;
  if(!c){host.innerHTML='<p class="academy-empty">Välj en rollfigur för att se färdigheter.</p>';return}
  const full=activeRuleList(c),quotes=full.map(rule=>rules().quote(c,rule,usingBonus));
  const ready=quotes.filter(q=>q.ready).length,points=quotes.reduce((v,q)=>v+Math.max(0,q.erf),0);
  const summary=$('academyProgressSummary');
  if(summary)summary.innerHTML='<div><strong>'+ready+'</strong><span>FV-höjningar möjliga</span></div>'+
    '<div><strong>'+points+'</strong><span>Bundna ERF-poäng</span></div>'+
    '<div><strong>'+Math.max(0,Number(c.live?.bonusExp)||0)+'</strong><span>Bonuspoäng</span></div>';
  const rows=sortedRules(c);
  host.innerHTML=rows.length?rows.map(({rule,quote})=>skillRow(c,rule,quote)).join(''):
   '<p class="academy-empty">Inga färdigheter matchar urvalet. Nya färdigheter och baschanser registreras på rollfigurens färdighetssida.</p>';
  const balance=$('academyFunds');if(balance)balance.textContent=money(wealth(c));
 }
 function renderTraining(){
  const c=selected(),model=rules(),slot=$('academyTraining');if(!slot)return;
  if(!c){slot.innerHTML='<p class="academy-empty">Välj en rollfigur först.</p>';return}
  const running=c.academyTraining;
  const day=currentDay();
  const htmlHead='<div class="academy-training-intro">Utbildning bokas i kampanjdagar. Endast SL kan föra fram tiden. Ett färdighetsslag görs efter en hel träningsperiod; med lärare görs två slag.</div>';
  if(running?.status==='active'){
   const due=Number(running.readyDay),days=Number.isFinite(day)?Math.max(0,due-day):null;
   slot.innerHTML=htmlHead+'<div class="academy-active"><span class="academy-eyebrow">Pågående studier</span>'+
    '<h3>'+esc(running.skillName)+'</h3>'+
    '<p>'+(running.mode==='teacher'?'Träning med lärare':'Ensamträning')+' · '+running.hoursPerDay+' timmar/dag, sex dagar/vecka · '+
     running.rolls+' egenskapsslag</p><p>Start dag '+running.startDay+' · klar dag '+due+
     (days!==null?' · '+(days===0?'Färdig!':days+' dagar kvar'):'')+'</p>'+
    '<p>Chans (CL) per slag: <b>'+esc(Math.max(0,Math.min(20,running.cl)))+'</b> på 1T20. '+
      (running.costSm?'Betalt: '+running.costSm+' SM.':'Ingen lärarkostnad.')+'</p>'+
    '<button class="btn primary" type="button" '+(busy||!Number.isFinite(day)||day<due?'disabled':'')+
     ' onclick="window.aleaAcademy.finish()">Avsluta veckan och slå</button>'+
    (!Number.isFinite(day)?'<small>Kampanjdag saknas – kontakta SL.</small>':'')+
    '</div>';return;
  }
  const trained=activeRuleList(c);
  const wanted=ruleFor($('academyTrainSkill')?.value)||trained[0]||null;
  if(!wanted){slot.innerHTML=htmlHead+'<p class="academy-empty">Lägg till en färdighet eller använd den så att ERF registreras på rollfiguren.</p>';return}
  const allowed=model.trainingAllowed(c,wanted);
  let estimate=null,error='';
  try{estimate=model.plan(c,wanted,{mode,hours,teacher,day})}catch(e){error=e.message}
  const teacherForm=mode==='teacher'?
   '<div class="academy-teacher-grid">'+
   '<label>Lärarens FV<input type="number" min="0" max="100" value="'+teacher.fv+'" onchange="window.aleaAcademy.teacher(\'fv\',this.value)"></label>'+
   '<label>Lärarens INT<input type="number" min="13" max="100" value="'+teacher.intelligence+'" onchange="window.aleaAcademy.teacher(\'intelligence\',this.value)"></label>'+
   '<label>Elever i klassen (inkl. dig)<input type="number" min="1" max="100" value="'+teacher.classmates+'" onchange="window.aleaAcademy.teacher(\'classmates\',this.value)"></label>'+
   '<label>Elever av annan ras<input type="number" min="0" max="100" value="'+teacher.differentRace+'" onchange="window.aleaAcademy.teacher(\'differentRace\',this.value)"></label>'+
   '<label class="academy-check"><input type="checkbox" '+(teacher.ownDifferentRace?'checked':'')+' onchange="window.aleaAcademy.teacher(\'ownDifferentRace\',this.checked)"> Rollfiguren har annan ras än läraren</label>'+
   '<label class="academy-check"><input type="checkbox" '+(teacher.magician?'checked':'')+' onchange="window.aleaAcademy.teacher(\'magician\',this.checked)"> Magiker som lärare (300 SM/vecka)</label></div>':
   '<label class="academy-self-hours">Timmar per träningsdag <select onchange="window.aleaAcademy.hours(this.value)">'+
     option(8,'8 timmar · 1 vecka',hours)+option(6,'6 timmar · 1,5 veckor',hours)+option(4,'4 timmar · 2 veckor',hours)+'</select></label>';
  slot.innerHTML=htmlHead+
   '<div class="academy-training-form">'+
   '<label>Färdighet <select id="academyTrainSkill" onchange="window.aleaAcademy.trainSkill(this.value)">'+
    trained.map(r=>option(r.id,r.name+' (FV '+model.skillState(c,r).fv+')',wanted.id)).join('')+'</select></label>'+
   '<div class="academy-method"><button type="button" class="btn'+(mode==='self'?' active':'')+'" onclick="window.aleaAcademy.mode(\'self\')">Ensamträning</button>'+
   '<button type="button" class="btn'+(mode==='teacher'?' active':'')+'" onclick="window.aleaAcademy.mode(\'teacher\')">Med lärare</button></div>'+
   teacherForm+
   '<div class="academy-training-quote">'+
    '<div><span>Träningstid</span><strong>'+(estimate?estimate.readyDay-estimate.startDay+' kampanjdagar':'—')+'</strong></div>'+
    '<div><span>Egenskapsslag</span><strong>'+(estimate?estimate.rolls:'—')+'</strong></div>'+
    '<div><span>CL (1T20)</span><strong>'+(estimate?Math.max(0,Math.min(20,estimate.cl)):'—')+'</strong></div>'+
    '<div><span>Kostnad</span><strong>'+(estimate?estimate.costSm+' SM':'—')+'</strong></div>'+
    '</div>'+
   (!allowed.allowed?'<p class="academy-warning">Färdigheten har nått sin högsta tillåtna nivå för träning.</p>':'')+
   (error?'<p class="academy-warning">'+esc(error)+'</p>':'')+
   (!Number.isInteger(day)||day<1?'<p class="academy-warning">Kampanjens dag behöver vara aktiverad av SL.</p>':'')+
   (estimate&&wealth(c)<estimate.costSm*10?'<p class="academy-warning">Inte tillräckligt med silvermynt i den burna börsen.</p>':'')+
   '<button class="btn primary academy-start" '+(!estimate||wealth(c)<estimate.costSm*10||busy?'disabled':'')+
    ' type="button" onclick="window.aleaAcademy.start()">Boka träningsperiod</button></div>';
 }
 function renderHistory(){
  const c=selected(),host=$('academyHistory');if(!host)return;
  const events=Array.isArray(c?.academyHistory)?c.academyHistory.slice(-8).reverse():[];
  host.innerHTML=events.length?events.map(row=>{
   if(row.kind==='purchase')return '<div class="academy-history-row">📜 '+esc(row.skillName)+
    ': FV '+esc(row.fromFv)+' → '+esc(row.toFv)+' · '+esc(row.spent)+' ERF</div>';
   return '<div class="academy-history-row">🎓 '+esc(row.skillName)+
    ': '+esc(row.earned)+' ERF på dag '+esc(row.completedDay)+
    ' ('+(row.mode==='teacher'?'med lärare':'ensamträning')+')</div>';
  }).join(''):'<p class="academy-empty">Ingen akademihistorik ännu.</p>'
 }
 function render(){
  const list=eligible(),pick=$('academyCharacter'),c=selected();
  if(pick){
   pick.innerHTML=list.map(p=>option(p.id,p.identity?.namn||p.name||'Namnlös',selectedId)).join('');
   if(c)pick.value=String(c.id);
  }
  const note=$('academyNotice');if(note){note.textContent=notice;note.hidden=!notice}
  const active=$('academyFilter');if(active)active.value=filter;
  const bonus=$('academyBonus');if(bonus)bonus.checked=usingBonus;
  const input=$('academySearch');if(input&&input.value!==search)input.value=search;
  renderSkills();renderTraining();renderHistory();
 }
 async function commit(character,modify){
  if(busy)throw Error('En ändring pågår redan.');
  const editable=eligible().some(c=>String(c.id)===String(character.id));
  if(!editable||typeof canEditCharacter==='function'&&!canEditCharacter(character))
   throw Error('Du får inte ändra den här rollfiguren.');
  busy=true;render();
  try{
   const draft=modify();
   if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(draft);
   const i=chars.findIndex(x=>String(x.id)===String(character.id));
   if(i<0)throw Error('Rollfiguren finns inte kvar.');
   chars[i]=draft;
   if(typeof current!=='undefined'&&current&&String(current.id)===String(draft.id))current=draft;
   localStorage.setItem('dod_chars_v03a',JSON.stringify(chars));
   if(typeof renderCards==='function')renderCards();
   return draft
  }finally{busy=false;render()}
 }
 async function buy(id){
  const c=selected(),r=ruleFor(id);if(!c||!r||busy)return;
  try{
   const q=rules().quote(c,r,usingBonus);
   if(!q.ready)throw Error('Erfarenhetspoängen räcker inte till nästa FV.');
   const ok=await askConfirm('Förbättra färdighet',
    (c.identity?.namn||'Rollfiguren')+' höjer '+r.name+' från FV '+q.fv+' till '+q.next+
     ' för '+q.required+' erfarenhetspoäng. Bekräfta köpet.','Höj FV');
   if(!ok)return;
   const outcome=rules().purchase(c,r,usingBonus);
   await commit(c,()=>outcome.character);
   notice='✓ '+r.name+' höjt till FV '+q.next+' för '+q.required+' erfarenhetspoäng.';
  }catch(e){notice='Kunde inte höja FV: '+(e.message||e)}
  render()
 }
 async function start(){
  const c=selected(),r=ruleFor($('academyTrainSkill')?.value);if(!c||!r||busy)return;
  try{
   const session=rules().plan(c,r,{mode,hours,teacher,day:currentDay()});
   if(wealth(c)<session.costSm*10)throw Error('Inte tillräckligt med mynt i den burna börsen.');
   const ok=await askConfirm('Boka träning',
    'Starta '+r.name+' på dag '+session.startDay+' till dag '+session.readyDay+
    '? '+(session.costSm?'Läraren kostar '+session.costSm+' SM, som betalas nu.':'Ensamträning kostar inga lärarpengar.')+
    ' Kampanjens tid ändras inte automatiskt.','Boka träning');
   if(!ok)return;
   await commit(c,()=>{
    const draft=JSON.parse(JSON.stringify(c));
    if(session.costSm&&!shopSpendCarriedCoins(draft,session.costSm*10))throw Error('Pengarna räcker inte.');
    draft.academyTraining=session;return draft;
   });
   notice='✓ Träning bokad. Klart kampanjdag '+session.readyDay+'.';
  }catch(e){notice='Träningen kunde inte bokas: '+(e.message||e)}
  render()
 }
 async function finish(){
  const c=selected(),session=c?.academyTraining;if(!session||busy)return;
  const r=ruleFor(session.skillId);
  try{
   const day=currentDay();
   if(!Number.isInteger(day)||day<session.readyDay)throw Error('För få kampanjdagar har gått.');
   if(!r)throw Error('Färdigheten finns inte i registret.');
   const ok=await askConfirm('Avsluta träningsperiod',
    'Slå '+session.rolls+' egenskapsslag för '+r.name+' med CL '+Math.max(0,Math.min(20,session.cl))+
    '. Framgång ger ett ERF per lyckat slag.','Slå träning');
   if(!ok)return;
   const result=rules().finish(c,r,day);
   await commit(c,()=>result.character);
   notice='🎲 '+r.name+': '+result.rolls.map(x=>x.die+(x.success?' ✓':' ✗')).join(', ')+
    '. '+result.earned+' ERF tillagda.';
  }catch(e){notice='Träningen kunde inte avslutas: '+(e.message||e)}
  render()
 }
 async function open(){
  if(!eligible().length){alert('Det finns ingen rollfigur som du kan träna.');return}
  if(typeof loadRuleSkills==='function')await loadRuleSkills();
  if(!registry().length){alert('Färdighetsregistret kunde inte läsas.');return}
  const preferred=eligible().find(c=>typeof current!=='undefined'&&current&&c.id===current.id)||eligible()[0];
  if(!eligible().some(c=>String(c.id)===selectedId))selectedId=String(preferred.id);
  if(typeof editing!=='undefined')editing=false;
  window.aleaJournalClose?.(false);
  for(const section of document.querySelectorAll('main > section[id]'))section.classList.add('hidden');
  $('academyPage')?.classList.remove('hidden');
  $('back')?.classList.add('hidden');$('editBtn')?.classList.add('hidden');$('cancelEditBtn')?.classList.add('hidden');
  document.body.classList.remove('shop-open','inn-open');
  document.body.classList.add('academy-open');
  notice='';render();
  window.scrollTo?.({top:0,behavior:'smooth'})
 }
 function close(){
  $('academyPage')?.classList.add('hidden');
  document.body.classList.remove('academy-open');
  if(typeof goHome==='function')goHome();
 }
 function selection(id){selectedId=String(id||'');notice='';render()}
 function setTeacher(key,value){
  if(key==='magician'||key==='ownDifferentRace')teacher[key]=value===true;
  else teacher[key]=Math.floor(Number(value)||0);
  if(key==='ownDifferentRace'&&teacher.ownDifferentRace&&teacher.differentRace===0)teacher.differentRace=1;
  if(key==='ownDifferentRace'&&!teacher.ownDifferentRace&&teacher.classmates===1)teacher.differentRace=0;
  render()
 }
 const api={open,close,render,buy,start,finish,selection,teacher:setTeacher,
  filter:value=>{filter=String(value);renderSkills()},
  search:value=>{search=String(value);renderSkills()},
  bonus:value=>{usingBonus=!!value;renderSkills()},
  mode:value=>{mode=value==='teacher'?'teacher':'self';renderTraining()},
  hours:value=>{hours=Number(value);renderTraining()},
  trainSkill:id=>{const e=$('academyTrainSkill');if(e)e.value=id;renderTraining()}
 };
 window.aleaAcademy=api;window.openAcademy=open;window.closeAcademy=close;
 // Other application destinations must hide this standalone page, including
 // mobile top-bar routing via synthetic button clicks.
 document.addEventListener('click',e=>{
  if(!$('academyPage')||$('academyPage').classList.contains('hidden'))return;
  const button=e.target.closest?.('button');
  if(!button)return;
  if(button.closest?.('#academyPage'))return;
  if(button.id==='academyNavBtn'||button.id==='mobileHubNavBtn')return;
  if(button.closest?.('.alea-toolstrip,.landing-route-nav,.landing-feature-grid')||button.id==='back'){
   $('academyPage').classList.add('hidden');document.body.classList.remove('academy-open');
  }
 },true);
})();
