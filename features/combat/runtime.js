const COMBAT_PHASE_LABELS={initiative:'Initiativ',declaration:'Deklaration',movement:'Rörelse',magic:'Magi',quick:'Snabba handlingar',normal:'Normal slagväxling',new_contact:'Ny närstridskontakt',late:'Sena handlingar',effects:'Besvärjelseeffekter',round_end:'Rundslut',reaction:'Reaktion'};
function combatPhaseLabel(p){return COMBAT_PHASE_LABELS[p]||String(p||'—')}
function combatSideLabel(s){return s==='heroes'?'Hjältar':s==='enemies'?'Fiender':'Neutral'}
function combatStatusLabel(s){return s==='setup'?'Förberedelse':s==='active'?'Pågår':s==='paused'?'Pausad':s==='completed'?'Avslutad':String(s||'—')}
function combatCanManage(){return !!activeUser()?.admin||centralCampaignRole==='gm'}
let combatDiceBusy=false,combatDiceLastRoll=null,combatDiceFadeTimer=null;
function combatPositionDiceLayer(){
 const layer=$('combatDiceLayer'),board=document.querySelector('#combatPage .combat-board');
 if(!layer||!board||$('combatPage')?.classList.contains('hidden'))return false;
 const rect=board.getBoundingClientRect();
 if(rect.width<80||rect.height<80)return false;
 layer.style.left=rect.left+'px';layer.style.top=rect.top+'px';
 layer.style.width=rect.width+'px';layer.style.height=rect.height+'px';
 layer.classList.add('positioned');
 window.alea3dCombatPrepare?.();
 return true
}
function combatShowDiceHost(){
 const host=$('combatDiceHost');
 if(combatDiceFadeTimer){clearTimeout(combatDiceFadeTimer);combatDiceFadeTimer=null}
 host?.classList.remove('initiative-fading')
}
function combatFadeInitiativeDice(){
 const host=$('combatDiceHost');if(!host)return;
 if(combatDiceFadeTimer){clearTimeout(combatDiceFadeTimer);combatDiceFadeTimer=null}
 host.classList.add('initiative-fading');
 combatDiceFadeTimer=setTimeout(async()=>{
  combatDiceFadeTimer=null;
  try{await window.alea3dCombatClear?.()}catch(_error){}
 },900)
}
async function combatWaitForInitiativeDiceToSettle(startedAt,used3d){
 if(!used3d)return;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const minimum=reduced?350:2300;
 const elapsed=Math.max(0,performance.now()-startedAt);
 if(elapsed<minimum)await new Promise(resolve=>setTimeout(resolve,minimum-elapsed));
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
}
function combatSecureDie(sides){
 sides=Math.max(2,Math.floor(Number(sides)||6));
 try{
  if(globalThis.crypto?.getRandomValues){
   const box=new Uint32Array(1),limit=Math.floor(4294967296/sides)*sides;
   do{globalThis.crypto.getRandomValues(box)}while(box[0]>=limit);
   return (box[0]%sides)+1
  }
 }catch(_error){}
 return Math.floor(Math.random()*sides)+1
}
function combatDiceResultRows(result){
 return (Array.isArray(result)?result:[]).map(row=>({
  sides:Number(String(row?.sides??'').replace(/^d/i,'')),
  value:Number(row?.value)
 })).filter(row=>Number.isInteger(row.sides)&&Number.isInteger(row.value)&&row.value>=1&&row.value<=row.sides)
}
function combatResolveDiceRows(raw,specs){
 const pools=new Map();
 raw.forEach(row=>{
  if(!pools.has(row.sides))pools.set(row.sides,[]);
  pools.get(row.sides).push(row.value)
 });
 const rolls=[];
 for(const spec of specs){
  const logical=Math.floor(Number(spec.sides)||6),physical=logical===3?6:logical;
  for(let i=0;i<Math.max(1,Math.floor(Number(spec.qty)||1));i++){
   const pool=pools.get(physical)||[];
   if(!pool.length)return null;
   const rawValue=pool.shift(),value=logical===3?Math.ceil(rawValue/2):rawValue;
   rolls.push({sides:logical,value,rawValue})
  }
 }
 return rolls
}
function combatDiceExpression(rolls){
 const counts={};
 (rolls||[]).forEach(row=>counts[row.sides]=(counts[row.sides]||0)+1);
 return Object.keys(counts).map(Number).sort((a,b)=>a-b).map(sides=>counts[sides]+'T'+sides).join(' + ')
}
function combatRenderDiceReadout(label,rolls){
 const host=$('combatDiceReadout');if(!host)return;
 const total=(rolls||[]).reduce((sum,row)=>sum+Number(row.value||0),0);
 const detail=(rolls||[]).map(row=>'T'+row.sides+': '+row.value).join(' · ');
 host.innerHTML='<b>'+escAttr(label||'Slag')+'</b><span>'+escAttr(combatDiceExpression(rolls))+' · '+escAttr(detail)+'</span><strong>'+total+'</strong>';
 host.classList.add('show')
}
async function combatRollDice(specs,label='Slag'){
 if(combatDiceBusy)return null;
 combatHideInitiativeLegend();
 const clean=(Array.isArray(specs)?specs:[]).map(spec=>({
  qty:Math.max(1,Math.min(20,Math.floor(Number(spec?.qty)||1))),
  sides:[3,4,6,8,10,20,100].includes(Number(spec?.sides))?Number(spec.sides):6
 }));
 if(!clean.length)return null;
 combatDiceBusy=true;combatDiceLastRoll=null;
 combatShowDiceHost();
 combatPositionDiceLayer();
 const outcomeHost=$('combatDiceReadout');
 outcomeHost?.classList.remove('success','fail','special','perfect','fumble','outcome-show');
 const layer=$('combatDiceLayer'),readout=$('combatDiceReadout');
 layer?.classList.add('rolling');
 if(readout){readout.innerHTML='<b>'+escAttr(label)+'</b><span>Tärningarna rullar…</span>';readout.classList.add('show')}
 try{
  let rolls=null;
  if(typeof window.alea3dCombatRoll==='function'){
   try{
    const physical=clean.map(spec=>({qty:spec.qty,sides:spec.sides===3?6:spec.sides}));
    const result=await window.alea3dCombatRoll(physical);
    rolls=combatResolveDiceRows(combatDiceResultRows(result),clean);
    if(!rolls)throw new Error('DiceBox returnerade inte rätt antal giltiga tärningsresultat.')
   }catch(error){
    console.warn('Stridens DiceBox-kast misslyckades, använder reservslag.',error)
   }
  }
  if(!rolls){
   rolls=[];
   clean.forEach(spec=>{
    const physical=spec.sides===3?6:spec.sides;
    for(let i=0;i<spec.qty;i++){
     const rawValue=combatSecureDie(physical);
     rolls.push({sides:spec.sides,value:spec.sides===3?Math.ceil(rawValue/2):rawValue,rawValue})
    }
   })
  }
  const total=rolls.reduce((sum,row)=>sum+row.value,0);
  combatDiceLastRoll={label,rolls,total,expression:combatDiceExpression(rolls)};
  combatRenderDiceReadout(label,rolls);
  return combatDiceLastRoll
 }finally{
  combatDiceBusy=false;
  layer?.classList.remove('rolling')
 }
}

let combatSelectedSceneId='',combatSceneBusy=false,combatRuntimeMapUrl='',combatRuntimeMapMeta=null,combatRuntimeMapError='';
let combatMovementPlan=null,combatMovementDrag=null,combatMovementAnimation=null,combatMovementSuppressClickUntil=0;
let combatActionMenuId=null;

function combatSceneFromId(id){
 return (campaignCombatScenes||[]).find(scene=>String(scene.id)===String(id))||null
}
function combatActiveSceneId(){
 return String(activeCombat?.settings?.scene_id||'')
}
async function loadCombatSceneChoices(force=false){
 if(!centralCampaignId)return[];
 if(typeof loadCampaignCombatScenes==='function'&&(force||!(campaignCombatScenes||[]).length))await loadCampaignCombatScenes();
 const scenes=Array.isArray(campaignCombatScenes)?campaignCombatScenes:[];
 const activeSceneId=combatActiveSceneId();
 const selectedExists=scenes.some(scene=>String(scene.id)===String(combatSelectedSceneId));
 if(!selectedExists){
  if(activeSceneId&&scenes.some(scene=>String(scene.id)===activeSceneId))combatSelectedSceneId=activeSceneId;
  else combatSelectedSceneId=scenes.length===1?String(scenes[0].id):''
 }
 renderCombatGmControls();
 return scenes
}
function selectCombatScene(id){
 combatSelectedSceneId=String(id||'');
 renderCombatGmControls()
}
function renderCombatGmControls(){
 const host=$('combatGmControls');if(!host)return;
 if(!combatCanManage()){host.classList.add('hidden');host.innerHTML='';return}
 host.classList.remove('hidden');
 const scenes=Array.isArray(campaignCombatScenes)?campaignCombatScenes:[];
 if(scenes.length===1&&!combatSelectedSceneId)combatSelectedSceneId=String(scenes[0].id);
 const activeSceneId=combatActiveSceneId();
 const scene=combatSceneFromId(combatSelectedSceneId);
 host.innerHTML='<div class="combat-gm-control-copy"><span>SL · STRIDSSCEN</span><small>Pågående strid återupptas automatiskt · Play startar vald scen med nytt initiativ · Reset återställer aktiv scen utan nytt initiativ</small></div>'+
  '<select id="combatScenePicker" onchange="selectCombatScene(this.value)" '+(combatSceneBusy?'disabled':'')+'>'+
    (scenes.length?scenes.map(row=>'<option value="'+escAttr(row.id)+'" '+(String(row.id)===String(combatSelectedSceneId)?'selected':'')+'>'+escAttr(row.name||'Stridsscen')+'</option>').join(''):'<option value="">Ingen stridsscen</option>')+
  '</select>'+
  '<button id="combatPlayBtn" class="btn combat-play-btn" type="button" onclick="playCombatScene()" '+(combatSceneBusy||!scene||(activeCombat&&!combatIsResetReadyForPlay(scene))?'disabled':'')+'>▶ Play</button>'+
  '<button id="combatResetBtn" class="btn combat-reset-btn" type="button" onclick="resetCombatScene()" '+(combatSceneBusy||!activeCombat?'disabled':'')+'>↻ Reset</button>'+
  (activeCombat?'<span class="combat-gm-active">'+(activeCombat?.settings?.reset_ready_for_play===true?'Återställd · redo för Play: ':'Sparad: ')+escAttr(activeCombat.name||combatSceneFromId(activeSceneId)?.name||'Strid')+' · runda '+(Number(activeCombat.round_number)||1)+' · '+escAttr(combatPhaseLabel(activeCombat.phase))+'</span>':'<span class="combat-gm-active idle">Ingen aktiv strid</span>')
}
function combatNumber(value,fallback=null){
 if(value==null||value==='')return fallback;
 const n=Number(value);return Number.isFinite(n)?n:fallback
}
function combatStateValue(state,...keys){
 for(const key of keys){if(state&&state[key]!=null&&state[key]!=='')return state[key]}
 return null
}
function combatSourceStats(sceneCombatant,sources){
 const state=sceneCombatant?.state&&typeof sceneCombatant.state==='object'?sceneCombatant.state:{};
 const source=sceneCombatant.source_type==='character'?sources.characters.get(sceneCombatant.source_id):
  sceneCombatant.source_type==='npc'?sources.npcs.get(sceneCombatant.source_id):
  sceneCombatant.source_type==='monster'?sources.monsters.get(sceneCombatant.source_id):null;
 const data=source?.data&&typeof source.data==='object'?source.data:{};
 const attributes=source?.attributes&&typeof source.attributes==='object'?source.attributes:{};
 const live=data.live&&typeof data.live==='object'?data.live:{};
 const derived=data.derived&&typeof data.derived==='object'?data.derived:{};
 const base=data.base&&typeof data.base==='object'?data.base:{};
 const strengthRaw=base.Styrka&&typeof base.Styrka==='object'?base.Styrka.v:(base.STY??base.Styrka);
 const smidighetRaw=base.Smidighet&&typeof base.Smidighet==='object'?base.Smidighet.v:(base.SMI??base.Smidighet);
 let smi=combatNumber(combatStateValue(state,'smi','SMI','smidighet'),combatNumber(smidighetRaw,combatNumber(attributes.SMI,10)));
 let sty=combatNumber(combatStateValue(state,'sty','STY','styrka'),combatNumber(strengthRaw,combatNumber(attributes.STY,10)));
 const attackProfile={
  weapons:Array.isArray(data.weapons)?data.weapons:(Array.isArray(source?.weapons)?source.weapons:[]),
  currentEquipment:data.currentEquipment&&typeof data.currentEquipment==='object'?data.currentEquipment:null,
  sty,smi
 };
 let maxKp=combatNumber(combatStateValue(state,'max_kp','kp_max'),combatNumber(live.KPmax,null));
 if(maxKp==null&&attributes.FYS!=null&&attributes.STO!=null)maxKp=Math.ceil((Number(attributes.FYS)+Number(attributes.STO))/2);
 let currentKp=combatNumber(combatStateValue(state,'current_kp','kp'),combatNumber(live.KP,maxKp));
 let maxPsy=combatNumber(combatStateValue(state,'max_psy','psy_max'),combatNumber(live.PSYmax,combatNumber(attributes.PSY,null)));
 let currentPsy=combatNumber(combatStateValue(state,'current_psy','psy'),combatNumber(live.PSY,maxPsy));
 let move=combatNumber(combatStateValue(state,'movement_max','movement','move'),combatNumber(derived['Förflyttning'],combatNumber(attributes.SMI,10)));
 return{
  current_kp:currentKp,max_kp:maxKp,current_psy:currentPsy,max_psy:maxPsy,
  movement_max:move,movement_remaining:move,smi,sty,attack_profile:attackProfile,
  flying:state.flying===true,
  controller_user_id:sceneCombatant.source_type==='character'?(source?.owner_id||null):null
 }
}
async function combatLoadSceneRuntimeData(scene){
 const sceneId=encodeURIComponent(scene.id),campaignId=encodeURIComponent(centralCampaignId);
 const [sceneCombatants,sceneHexes,characters,npcs,monsters]=await Promise.all([
  dbJson('campaign_combat_scene_combatants?scene_id=eq.'+sceneId+'&select=*&order=sort_order.asc,name.asc'),
  dbJson('campaign_combat_scene_hexes?scene_id=eq.'+sceneId+'&select=q,r,movement_mode,sight_mode,movement_cost,notes&order=r.asc,q.asc'),
  dbJson('characters?campaign_id=eq.'+campaignId+'&select=id,name,owner_id,data'),
  dbJson('campaign_npcs?campaign_id=eq.'+campaignId+'&select=id,name,attributes,weapons'),
  dbJson('campaign_monsters?campaign_id=eq.'+campaignId+'&select=id,name,attributes,weapons')
 ]);
 return{
  sceneCombatants:Array.isArray(sceneCombatants)?sceneCombatants:[],
  sceneHexes:Array.isArray(sceneHexes)?sceneHexes:[],
  sources:{
   characters:new Map((characters||[]).map(row=>[row.id,row])),
   npcs:new Map((npcs||[]).map(row=>[row.id,row])),
   monsters:new Map((monsters||[]).map(row=>[row.id,row]))
  }
 }
}
async function combatDeleteRuntime(combatId){
 if(!combatId)return;
 await dbJson('combat_instances?id=eq.'+encodeURIComponent(combatId),{method:'DELETE',headers:{'Prefer':'return=minimal'}})
}
function combatRollD10(){
 try{
  if(globalThis.crypto?.getRandomValues){
   const box=new Uint32Array(1),limit=Math.floor(4294967296/10)*10;
   do{globalThis.crypto.getRandomValues(box)}while(box[0]>=limit);
   return (box[0]%10)+1
  }
 }catch(_error){}
 return Math.floor(Math.random()*10)+1
}
const COMBAT_INITIATIVE_COLORS=['#d7544d','#4f86c6','#d4a72c','#68a05d','#9a69b4','#d87b39','#49a5a0','#cc6f92','#7e6ac8','#8a7a55'];
let combatInitiativeVisuals=new Map();
function combatBuildInitiative(rows,dieByCombatant=new Map(),colorByCombatant=new Map()){
 const visible=(rows||[]).filter(row=>row.visible_to_players!==false);
 const results=visible.map((row,index)=>{
  const smi=Math.max(0,combatNumber(row.state?.smi,10));
  const die=combatNumber(dieByCombatant.get(String(row.id)),combatRollD10());
  return{
   combatant_id:row.id,
   name:row.name_snapshot,
   smi,die,total:smi+die,
   color:colorByCombatant.get(String(row.id))||COMBAT_INITIATIVE_COLORS[index%COMBAT_INITIATIVE_COLORS.length],
   original_sort:Number(row.sort_order)||index
  }
 }).sort((a,b)=>b.total-a.total||b.smi-a.smi||a.original_sort-b.original_sort||String(a.name).localeCompare(String(b.name),'sv'));

 const rankById=new Map(results.map((result,index)=>[String(result.combatant_id),index+1]));
 const resultById=new Map(results.map(result=>[String(result.combatant_id),result]));
 rows.forEach((row,index)=>{
  const result=resultById.get(String(row.id));
  if(result){
   const rank=rankById.get(String(row.id));
   row.sort_order=rank-1;
   row.state={...(row.state||{}),initiative_roll:result.die,initiative_total:result.total,initiative_rank:rank}
  }else{
   row.sort_order=1000+(Number(row.sort_order)||index)
  }
 });
 return{
  formula:'SMI+1T10',
  status:'resolved',
  rolled_at:new Date().toISOString(),
  order:results.map(result=>result.combatant_id),
  results:results.map((result,index)=>({...result,rank:index+1}))
 }
}
function combatInitiativeEntries(rows){
 return (rows||[]).filter(row=>row.visible_to_players!==false).map((row,index)=>({
  combatant_id:String(row.id),
  name:row.name_snapshot||'Kombatant',
  smi:Math.max(0,combatNumber(row.state?.smi,10)),
  color:COMBAT_INITIATIVE_COLORS[index%COMBAT_INITIATIVE_COLORS.length],
  groupId:index
 }))
}
function combatInitiativeDiceMap(raw,entries){
 const byGroup=new Map(),sequential=[];
 for(const item of (Array.isArray(raw)?raw:[])){
  if(Array.isArray(item?.rolls)&&item.rolls.length){
   const roll=item.rolls[0],value=Number(roll?.value??roll?.result);
   const group=Number(item.id??item.groupId??roll?.groupId);
   if(Number.isInteger(value)&&value>=1&&value<=10){
    if(Number.isFinite(group))byGroup.set(group,value);
    sequential.push(value)
   }
  }else{
   const value=Number(item?.value??item?.result),group=Number(item?.groupId);
   if(Number.isInteger(value)&&value>=1&&value<=10){
    if(Number.isFinite(group))byGroup.set(group,value);
    sequential.push(value)
   }
  }
 }
 const values=new Map();
 entries.forEach((entry,index)=>{
  const value=byGroup.get(entry.groupId)??sequential[index];
  if(Number.isInteger(value)&&value>=1&&value<=10)values.set(entry.combatant_id,value)
 });
 return values
}
let combatInitiativeTransferTimer=null,combatInitiativeTransferToken=0;
function combatCancelInitiativeTransfer(){
 combatInitiativeTransferToken++;
 if(combatInitiativeTransferTimer){clearTimeout(combatInitiativeTransferTimer);combatInitiativeTransferTimer=null}
 document.querySelectorAll('.combat-initiative-flyer').forEach(node=>node.remove())
}
function combatInitiativeTransferToOrder(initiative){
 const host=$('combatInitiativeLegend');if(!host||!initiative?.results?.length)return;
 combatCancelInitiativeTransfer();
 const token=combatInitiativeTransferToken;
 const results=[...initiative.results].sort((a,b)=>(Number(a.rank)||999)-(Number(b.rank)||999));
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const transferOne=index=>{
  if(token!==combatInitiativeTransferToken)return;
  if(index===0)combatFadeInitiativeDice();
  if(index>=results.length){
   combatInitiativeTransferTimer=setTimeout(()=>{
    if(token!==combatInitiativeTransferToken)return;
    host.classList.remove('show','resolved','transferring');
    host.querySelectorAll('.combat-initiative-chip').forEach(chip=>chip.classList.remove('departing'))
   },reduced?80:320);
   return
  }
  const result=results[index];
  const chip=host.querySelector('.combat-initiative-chip[data-combatant-id="'+CSS.escape(String(result.combatant_id))+'"]');
  const target=document.querySelector('.combatant-card[data-combatant-id="'+CSS.escape(String(result.combatant_id))+'"] .combat-order-number');
  if(!chip||!target){
   combatInitiativeTransferTimer=setTimeout(()=>transferOne(index+1),reduced?60:220);
   return
  }
  chip.classList.add('departing');
  target.classList.add('initiative-arrival');
  setTimeout(()=>target.classList.remove('initiative-arrival'),reduced?120:720);
  if(reduced){
   chip.style.visibility='hidden';
   combatInitiativeTransferTimer=setTimeout(()=>transferOne(index+1),90);
   return
  }
  const from=chip.getBoundingClientRect(),to=target.getBoundingClientRect();
  const flyer=chip.cloneNode(true);
  flyer.classList.add('combat-initiative-flyer');
  flyer.classList.remove('departing');
  Object.assign(flyer.style,{
   position:'fixed',
   left:from.left+'px',
   top:from.top+'px',
   width:from.width+'px',
   height:from.height+'px',
   margin:'0',
   zIndex:'1800',
   pointerEvents:'none'
  });
  document.body.appendChild(flyer);
  const dx=(to.left+to.width/2)-(from.left+from.width/2);
  const dy=(to.top+to.height/2)-(from.top+from.height/2);
  const animation=flyer.animate([
   {transform:'translate(0,0) scale(1)',opacity:1,filter:'brightness(1)'},
   {transform:'translate('+(dx*.78)+'px,'+(dy*.78)+'px) scale(.72)',opacity:.86,filter:'brightness(1.15)',offset:.72},
   {transform:'translate('+dx+'px,'+dy+'px) scale(.42)',opacity:.08,filter:'brightness(1.35)'}
  ],{duration:680,easing:'cubic-bezier(.2,.75,.25,1)',fill:'forwards'});
  animation.finished.catch(()=>{}).finally(()=>flyer.remove());
  combatInitiativeTransferTimer=setTimeout(()=>transferOne(index+1),520)
 };
 host.classList.add('transferring');
 combatInitiativeTransferTimer=setTimeout(()=>transferOne(0),reduced?700:3000)
}
function combatShowInitiativeLegend(entries,initiative=null){
 const host=$('combatInitiativeLegend');if(!host)return;
 combatCancelInitiativeTransfer();
 const results=new Map((initiative?.results||[]).map(result=>[String(result.combatant_id),result]));
 const displayEntries=initiative?.results?.length
  ?[...entries].sort((a,b)=>(Number(results.get(a.combatant_id)?.rank)||999)-(Number(results.get(b.combatant_id)?.rank)||999))
  :entries;
 host.innerHTML='<div class="combat-initiative-title">Initiativ · SMI + T10</div><div class="combat-initiative-chips">'+displayEntries.map(entry=>{
  const result=results.get(entry.combatant_id);
  return '<div class="combat-initiative-chip" data-combatant-id="'+escAttr(entry.combatant_id)+'" style="--initiative-color:'+entry.color+'">'+
   '<i></i><b>'+escAttr(entry.name)+'</b>'+
   (result?'<span>T10 '+result.die+' + SMI '+result.smi+' = <strong>'+result.total+'</strong> · #'+result.rank+'</span>':'<span>T10 rullar… · SMI '+entry.smi+'</span>')+
  '</div>'
 }).join('')+'</div>';
 host.classList.add('show');
 host.classList.toggle('resolved',!!initiative);
 if(initiative?.results?.length)combatInitiativeTransferToOrder(initiative)
}
function combatHideInitiativeLegend(){
 combatCancelInitiativeTransfer();
 const host=$('combatInitiativeLegend');if(host){host.classList.remove('show','resolved','transferring');host.querySelectorAll('.combat-initiative-chip').forEach(chip=>chip.style.visibility='')}
}
async function combatRollAndApplyInitiative(instanceId,{roundNumber=null}={}){
 const initiativeRound=Math.max(1,Number(roundNumber??activeCombat?.round_number)||1);
 const entries=combatInitiativeEntries(combatants);
 if(!entries.length){
  await dbJson('combat_instances?id=eq.'+encodeURIComponent(instanceId),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({initiative:{formula:'SMI+1T10',status:'resolved',rolled_at:new Date().toISOString(),order:[],results:[]},phase:'movement'})
  });
  return
 }
 combatInitiativeVisuals=new Map(entries.map(entry=>[entry.combatant_id,entry]));
 combatShowInitiativeLegend(entries);
 combatShowDiceHost();
 combatPositionDiceLayer();
 const readout=$('combatDiceReadout');if(readout)readout.classList.remove('show');
 try{await window.alea3dCombatClear?.()}catch(_){}
 let dieMap=new Map(),used3d=false;
 const initiativeRollStartedAt=performance.now();
 if(typeof window.alea3dCombatRoll==='function'){
  try{
   const notation=entries.map(entry=>({qty:1,sides:10,theme:'default',themeColor:entry.color}));
   const raw=await window.alea3dCombatRoll(notation);
   dieMap=combatInitiativeDiceMap(raw,entries);
   if(dieMap.size!==entries.length)throw new Error('Kunde inte koppla samtliga initiativtärningar till rätt kombatant.');
   used3d=true
  }catch(error){
   console.warn('Samtidigt initiativkast i DiceBox misslyckades, använder reservslag.',error);
   dieMap=new Map()
  }
 }
 if(dieMap.size!==entries.length){
  entries.forEach(entry=>dieMap.set(entry.combatant_id,combatRollD10()))
 }
 await combatWaitForInitiativeDiceToSettle(initiativeRollStartedAt,used3d);
 const colors=new Map(entries.map(entry=>[entry.combatant_id,entry.color]));
 const initiative=combatBuildInitiative(combatants,dieMap,colors);
 const firstActorId=initiative.order[0]||null;

 await Promise.all(combatants.map(row=>dbJson('combatants?id=eq.'+encodeURIComponent(row.id),{
  method:'PATCH',headers:{'Prefer':'return=minimal'},
  body:JSON.stringify({sort_order:row.sort_order,state:row.state,updated_at:new Date().toISOString()})
 })));
 await dbJson('combat_instances?id=eq.'+encodeURIComponent(instanceId),{
  method:'PATCH',headers:{'Prefer':'return=minimal'},
  body:JSON.stringify({initiative,active_actor_id:firstActorId,phase:'movement',updated_at:new Date().toISOString()})
 });

 const logRows=initiative.results.map(result=>({
  combat_id:instanceId,campaign_id:centralCampaignId,round_number:initiativeRound,phase:'initiative',
  actor_id:result.combatant_id,target_id:null,event_type:'initiative',
  message:'#'+result.rank+' '+result.name+' · SMI '+result.smi+' + T10 '+result.die+' = '+result.total,
  details:{rank:result.rank,smi:result.smi,die:result.die,total:result.total,color:result.color,formula:'SMI+1T10'},
  player_visible:true
 }));
 if(logRows.length)await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(logRows)});
 combatShowInitiativeLegend(entries,initiative)
}
function combatCaptureInitiativeForReset(){
 const previous=activeCombat?.initiative&&typeof activeCombat.initiative==='object'?activeCombat.initiative:{};
 const resultById=new Map((Array.isArray(previous.results)?previous.results:[]).map(result=>[String(result.combatant_id),result]));
 const entries=(combatants||[]).map(row=>{
  const key=String(row.source_instance_key||'');
  const rank=combatNumber(row.state?.initiative_rank,null);
  const roll=combatNumber(row.state?.initiative_roll,null);
  const total=combatNumber(row.state?.initiative_total,null);
  if(!key||rank==null)return null;
  return{
   key,rank,roll,total,
   smi:combatNumber(row.state?.smi,null),
   result:resultById.get(String(row.id))||null
  }
 }).filter(Boolean).sort((a,b)=>a.rank-b.rank);
 return{
  formula:previous.formula||'SMI+1T10',
  rolled_at:previous.rolled_at||null,
  entries
 }
}
async function combatCreateRuntimeFromScene(scene,{initiativeSnapshot=null,resetReady=false}={}){
 const runtime=await combatLoadSceneRuntimeData(scene);
 const instanceId=crypto.randomUUID();
 const settings={
  ...(scene.settings&&typeof scene.settings==='object'?scene.settings:{}),
  scene_id:scene.id,
  source:'campaign_combat_scene',
  development_mode:'movement',
  reset_ready_for_play:resetReady===true,
  background_image_path:scene.background_image_path||null,
  background_width:scene.background_width||null,
  background_height:scene.background_height||null
 };
 const combatantRows=runtime.sceneCombatants.map((row,index)=>{
  const stats=combatSourceStats(row,runtime.sources);
  const side=(row.state?.side&&['heroes','enemies','neutral'].includes(row.state.side))
    ?row.state.side
    :(row.combatant_type==='enemy'||row.combatant_type==='monster'?'enemies':'heroes');
  const sourceType=['character','npc','monster'].includes(row.source_type)?row.source_type:null;
  if(!sourceType||!row.source_id)return null;
  const id=crypto.randomUUID();
  return{
   id,combat_id:instanceId,campaign_id:centralCampaignId,source_type:sourceType,source_id:row.source_id,
   source_instance_key:sourceType+':'+row.source_id+':'+Math.max(1,Number(row.instance_no)||1),
   name_snapshot:row.name||'Kombatant',side,controller_user_id:stats.controller_user_id,
   q:row.start_q==null?0:Number(row.start_q),r:row.start_r==null?0:Number(row.start_r),
   flying:stats.flying,visible_to_players:row.visible_to_players!==false,
   current_kp:stats.current_kp,max_kp:stats.max_kp,current_psy:stats.current_psy,max_psy:stats.max_psy,
   movement_max:stats.movement_max,movement_remaining:stats.movement_remaining,status:'active',action_plan:[],
   state:{...(row.state||{}),smi:stats.smi,sty:stats.sty,attack_profile:stats.attack_profile,scene_combatant_id:row.id,scene_start_q:row.start_q,scene_start_r:row.start_r},
   sort_order:Number(row.sort_order)||index
  }
 }).filter(Boolean);

 let initiative={formula:'SMI+1T10',status:'pending',rolled_at:null,order:[],results:[]};
 let startPhase='initiative',startActorId=null;
 const preservedEntries=Array.isArray(initiativeSnapshot?.entries)?initiativeSnapshot.entries:[];
 if(preservedEntries.length){
  const rowByKey=new Map(combatantRows.map(row=>[String(row.source_instance_key||''),row]));
  const order=[],results=[];
  preservedEntries.forEach((entry,index)=>{
   const row=rowByKey.get(String(entry.key||''));if(!row)return;
   const rank=Math.max(1,combatNumber(entry.rank,index+1));
   const roll=combatNumber(entry.roll,null),total=combatNumber(entry.total,null),smi=combatNumber(entry.smi,combatNumber(row.state?.smi,10));
   row.sort_order=rank-1;
   row.state={...(row.state||{}),initiative_rank:rank,initiative_roll:roll,initiative_total:total};
   order.push(row.id);
   results.push({
    ...(entry.result&&typeof entry.result==='object'?entry.result:{}),
    combatant_id:row.id,name:row.name_snapshot,smi,die:roll,total,rank
   })
  });
  const orderedIds=new Set(order.map(String));
  combatantRows.forEach((row,index)=>{if(!orderedIds.has(String(row.id)))row.sort_order=1000+index});
  initiative={
   formula:initiativeSnapshot.formula||'SMI+1T10',
   status:'resolved',
   rolled_at:initiativeSnapshot.rolled_at||new Date().toISOString(),
   order,results
  };
  startPhase='movement';
  startActorId=order[0]||null
 }

 let instanceCreated=false;
 try{
  const pendingInitiative={formula:'SMI+1T10',status:'pending',rolled_at:null,order:[],results:[]};
  await dbJson('combat_instances',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
   id:instanceId,campaign_id:centralCampaignId,event_id:scene.source_event_id||null,map_id:scene.map_id||null,
   name:scene.name||'Strid',status:'active',round_number:1,phase:'initiative',winning_side:null,
   initiative:pendingInitiative,active_actor_id:null,settings,started_by:activeUser()?.id||null,started_at:new Date().toISOString(),completed_at:null
  })});
  instanceCreated=true;

  if(combatantRows.length)await dbJson('combatants',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(combatantRows)});

  const hexRows=runtime.sceneHexes.map(row=>({
   combat_id:instanceId,campaign_id:centralCampaignId,q:Number(row.q),r:Number(row.r),
   movement_mode:row.movement_mode||'free',sight_mode:row.sight_mode||'clear',
   movement_cost:Number(row.movement_cost)||1,notes:row.notes||''
  }));
  if(hexRows.length)await dbJson('combat_hexes',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(hexRows)});

  if(startActorId){
   await dbJson('combat_instances?id=eq.'+encodeURIComponent(instanceId),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({initiative,active_actor_id:startActorId,phase:startPhase,updated_at:new Date().toISOString()})
   })
  }
  return instanceId
 }catch(error){
  if(instanceCreated){
   try{await combatDeleteRuntime(instanceId)}catch(cleanupError){console.error('Kunde inte städa misslyckad stridsruntime',cleanupError)}
  }
  throw error
 }
}

async function combatStartScene(sceneId,{reset=false}={}){
 if(!combatCanManage()||combatSceneBusy)return;
 const scene=combatSceneFromId(sceneId);if(!scene){alert('Välj en stridsscen.');return}
 combatSceneBusy=true;renderCombatGmControls();
 const previousCombatId=activeCombat?.id||null;
 let replacementCombatId=null,replacementCommitted=false;
 try{
  const initiativeSnapshot=reset?combatCaptureInitiativeForReset():null;
  replacementCombatId=await combatCreateRuntimeFromScene(scene,{initiativeSnapshot,resetReady:reset});
  combatSelectedSceneId=String(scene.id);
  await loadActiveCombat(replacementCombatId);
  if(String(activeCombat?.id||'')!==String(replacementCombatId))throw new Error('Den nya stridsruntime-instansen kunde inte verifieras.');
  if(!reset)await combatRollAndApplyInitiative(replacementCombatId);
  if(previousCombatId&&String(previousCombatId)!==String(replacementCombatId))await combatDeleteRuntime(previousCombatId);
  replacementCommitted=true;
  await loadActiveCombat(replacementCombatId);
 }catch(e){
  console.error('Kunde inte starta stridsscen',e);
  if(replacementCombatId&&!replacementCommitted){
   try{await combatDeleteRuntime(replacementCombatId)}catch(cleanupError){console.error('Kunde inte återställa efter misslyckat byte av stridsruntime',cleanupError)}
  }
  if(previousCombatId&&!replacementCommitted){
   try{await loadActiveCombat(previousCombatId)}catch(_error){}
  }else if(replacementCombatId&&replacementCommitted){
   try{await loadActiveCombat(replacementCombatId)}catch(_error){}
  }
  alert((reset?'Reset':'Play')+' kunde inte genomföras: '+(e?.message||e))
 }finally{
  combatSceneBusy=false;
  renderCombatGmControls()
 }
}
function combatIsResetReadyForPlay(scene){
 return !!activeCombat?.id&&
  activeCombat?.settings?.reset_ready_for_play===true&&
  String(combatActiveSceneId())===String(scene?.id||'')
}
function combatConfirmReplaceActiveRuntime(scene){
 if(!activeCombat?.id||combatIsResetReadyForPlay(scene))return true;
 const activeName=activeCombat.name||combatSceneFromId(combatActiveSceneId())?.name||'Strid';
 const selectedName=scene?.name||'vald stridsscen';
 return confirm('En pågående strid ("'+activeName+'") är sparad och kan återupptas där den slutade.\n\nPlay startar "'+selectedName+'" från början och ersätter den sparade striden. Vill du fortsätta?')
}
async function playCombatScene(){
 await loadCombatSceneChoices();
 const scene=combatSceneFromId(combatSelectedSceneId);
 if(activeCombat?.id&&!combatConfirmReplaceActiveRuntime(scene))return;
 return combatStartScene(combatSelectedSceneId,{reset:false})
}
async function resetCombatScene(){
 const sceneId=combatActiveSceneId()||combatSelectedSceneId;
 if(!sceneId)return;
 combatSelectedSceneId=sceneId;
 return combatStartScene(sceneId,{reset:true})
}
async function combatRuntimeMapRecord(){
 if(!activeCombat?.map_id)return null;
 let map=(campaignMaps||[]).find(row=>String(row.id)===String(activeCombat.map_id))||null;
 if(map)return map;
 try{
  let rows=await dbJson('campaign_maps?id=eq.'+encodeURIComponent(activeCombat.map_id)+'&select=id,name,image_path,width,height&limit=1');
  map=rows?.[0]||null;
  if(map&&Array.isArray(campaignMaps)&&!campaignMaps.some(row=>String(row.id)===String(map.id)))campaignMaps.push(map);
  return map
 }catch(error){
  console.warn('Kunde inte läsa stridskartans kartpost',error);
  return null
 }
}
async function loadCombatRuntimeBackground(){
 combatRuntimeMapUrl='';combatRuntimeMapMeta=null;combatRuntimeMapError='';
 if(!activeCombat)return;
 const settings=activeCombat.settings&&typeof activeCombat.settings==='object'?activeCombat.settings:{};
 try{
  if(settings.background_image_path){
   if(typeof getCombatSceneBackgroundUrl!=='function')throw new Error('Bakgrundsläsaren för stridsscener saknas.');
   combatRuntimeMapUrl=await getCombatSceneBackgroundUrl(settings.background_image_path);
   combatRuntimeMapMeta={
    width:Math.max(1,Number(settings.background_width)||1600),
    height:Math.max(1,Number(settings.background_height)||1000),
    name:activeCombat.name||'Stridskarta'
   };
   return
  }
  const map=await combatRuntimeMapRecord();
  if(map?.image_path){
   if(typeof getMapImageUrl!=='function')throw new Error('Kartläsaren är inte tillgänglig.');
   combatRuntimeMapUrl=await getMapImageUrl(map);
   combatRuntimeMapMeta={
    width:Math.max(1,Number(map.width)||1600),
    height:Math.max(1,Number(map.height)||1000),
    name:map.name||activeCombat.name||'Stridskarta'
   };
  }
 }catch(error){
  combatRuntimeMapError=error?.message||String(error);
  console.error('Kunde inte läsa bakgrundsbild för aktiv strid',error)
 }
}
function combatRuntimeGeometry(){
 const settings=activeCombat?.settings&&typeof activeCombat.settings==='object'?activeCombat.settings:{};
 const meta=combatRuntimeMapMeta;
 if(!meta)return null;
 const width=Math.max(1,Number(meta.width)||1600),height=Math.max(1,Number(meta.height)||1000);
 const rows=Math.max(2,Number(settings.rows)||Math.round((Number(settings.map_height_m)||45)/(Number(settings.hex_m)||1.5))||30);
 const scale=Math.max(.5,Math.min(1.5,Number(settings.hex_scale)||1));
 const rowPitch=(height/rows)*scale,size=rowPitch/1.5,xPitch=Math.sqrt(3)*size;
 return{
  width,height,rows,size,xPitch,rowPitch,
  offsetX:Number(settings.offset_x)||0,
  offsetY:Number(settings.offset_y)||0
 }
}
function combatRuntimeHexCells(){
 const g=combatRuntimeGeometry();if(!g)return[];
 const terrainByKey=new Map((combatHexes||[]).map(row=>[Number(row.q)+','+Number(row.r),row]));
 const cells=[];
 const rMin=Math.floor((-g.offsetY)/g.rowPitch)-3,rMax=Math.ceil((g.height-g.offsetY)/g.rowPitch)+3;
 for(let r=rMin;r<=rMax;r++){
  const qMin=Math.floor((-g.offsetX)/g.xPitch-r/2)-2,qMax=Math.ceil((g.width-g.offsetX)/g.xPitch-r/2)+2;
  for(let q=qMin;q<=qMax;q++){
   const x=g.xPitch*(q+r/2)+g.offsetX,y=g.rowPitch*r+g.offsetY;
   if(x<-g.size||x>g.width+g.size||y<-g.size||y>g.height+g.size)continue;
   const key=q+','+r,terrain=terrainByKey.get(key)||null;
   cells.push({
    q,r,x,y,key,
    movement_mode:terrain?.movement_mode||'free',
    sight_mode:terrain?.sight_mode||'clear',
    movement_cost:Number(terrain?.movement_cost)||1,
    notes:terrain?.notes||''
   })
  }
 }
 return cells
}
const COMBAT_PRIMARY_ACTIONS=[
 {key:'attack_melee',type:'attack',label:'Anfall',icon:'⚔',mode:'melee'},
 {key:'attack_ranged',type:'attack',label:'Avståndsanfall',icon:'🏹',mode:'ranged'},
 {key:'parry',type:'parry',label:'Parera',icon:'🛡',mode:'reaction',reactive:true},
 {key:'spell_prepare',type:'spell',label:'Förbereda besvärjelse',icon:'✨',mode:'prepare'},
 {key:'spell_cast',type:'spell',label:'Lägg besvärjelse',icon:'🔮',mode:'cast'},
 {key:'move_full',type:'move',label:'Full förflyttning',icon:'🏃',mode:'full',automatic:true},
 {key:'other',type:'other',label:'Annan handling',icon:'⚙',mode:'other'}
];
function combatIsActiveTurn(combatant){
 return !!combatant&&String(activeCombat?.active_actor_id||'')===String(combatant.id)
}
function combatChosenAction(combatant){
 if(!combatant||!activeCombat)return null;
 const round=Number(activeCombat.round_number)||1;
 return (combatActions||[]).find(action=>
  String(action.combatant_id)===String(combatant.id)&&
  Number(action.round_number)===round&&
  action.slot_key==='primary'&&
  action.status!=='cancelled'
 )||null
}
function combatActionDefinition(action){
 if(!action)return null;
 const key=action.source_data?.action_key||'';
 return COMBAT_PRIMARY_ACTIONS.find(item=>item.key===key)||
  COMBAT_PRIMARY_ACTIONS.find(item=>item.type===action.action_type)||null
}
function combatCanChoosePrimaryAction(combatant){
 return combatCanManage()&&combatIsActiveTurn(combatant)&&activeCombat?.status==='active'
}
async function chooseCombatPrimaryAction(combatantId,actionKey){
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 const def=COMBAT_PRIMARY_ACTIONS.find(item=>item.key===actionKey);
 if(!combatant||!def||def.automatic||def.reactive||!combatCanChoosePrimaryAction(combatant))return;
 if(combatMovementHasUsedMoreThanHalf(combatant))return;
 const round=Number(activeCombat.round_number)||1;
 const existing=combatChosenAction(combatant);
 const weaponOptions=def.type==='attack'?combatAttackWeaponOptions(combatant,def.mode):[];
 const autoWeapon=weaponOptions.length===1?weaponOptions[0]:null;
 const sourceData={action_key:def.key,label:def.label,mode:def.mode};
 if(autoWeapon){
  sourceData.weapon_key=combatWeaponKey(autoWeapon);
  sourceData.weapon_name=autoWeapon.name||'Vapen';
  sourceData.weapon_id=autoWeapon.weapon_id||autoWeapon.weaponTypeId||null
 }else if(def.type==='attack'&&def.mode==='melee'&&!weaponOptions.length){
  sourceData.weapon_key='unarmed';sourceData.weapon_name='Obeväpnad'
 }
 const body={
  combat_id:activeCombat.id,campaign_id:centralCampaignId,combatant_id:combatant.id,
  round_number:round,phase:activeCombat.phase||'movement',action_type:def.type,slot_key:'primary',
  source_data:sourceData,
  target_combatant_id:null,status:def.type==='parry'?'reserved':'planned',
  sequence:Math.max(0,(combatNumber(combatant.state?.initiative_rank,1)||1)-1),
  result:{},player_visible:true,created_by:activeUser()?.id||null
 };
 try{
  if(existing){
   await dbJson('combat_actions?id=eq.'+encodeURIComponent(existing.id),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({
     phase:body.phase,action_type:body.action_type,slot_key:body.slot_key,
     source_data:body.source_data,target_combatant_id:null,status:body.status,
     sequence:body.sequence,result:{},player_visible:true,updated_at:new Date().toISOString()
    })
   })
  }else{
   await dbJson('combat_actions',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(body)})
  }
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte välja action',error);
  alert('Kunde inte välja action: '+(error?.message||error))
 }
}
function combatPrimaryActionIsSpent(action){
 if(!action)return false;
 if(action.action_type==='move'&&action.source_data?.action_key==='move_full')return true;
 return ['reserved','pending','resolving','resolved'].includes(action.status)
}
function combatHasUnusedAction(combatant){
 if(!combatant||combatMovementHasUsedMoreThanHalf(combatant))return false;
 return !combatPrimaryActionIsSpent(combatChosenAction(combatant))
}
function combatSuccessfulMeleeAttack(action){
 return !!action&&action.action_type==='attack'&&action.source_data?.mode==='melee'&&
  action.result?.success===true&&action.status!=='cancelled'
}
function combatPendingParryOpportunity(){
 const round=Number(activeCombat?.round_number)||1;
 for(let i=(combatActions||[]).length-1;i>=0;i--){
  const attack=combatActions[i];
  if(Number(attack.round_number)!==round||!combatSuccessfulMeleeAttack(attack))continue;
  if(!attack.target_combatant_id||attack.result?.parry_decision)return null;
  const defender=combatants.find(row=>String(row.id)===String(attack.target_combatant_id));
  const attacker=combatants.find(row=>String(row.id)===String(attack.combatant_id));
  if(!defender||!attacker||['dead','removed'].includes(defender.status))return null;
  if(!combatHasUnusedAction(defender))return null;
  return{attack,defender,attacker}
 }
 return null
}
async function chooseCombatParry(defenderId,attackActionId){
 const opportunity=combatPendingParryOpportunity();
 if(!opportunity||String(opportunity.defender.id)!==String(defenderId)||String(opportunity.attack.id)!==String(attackActionId))return;
 const defender=opportunity.defender,attack=opportunity.attack;
 if(!combatHasUnusedAction(defender)||!combatCanManage())return;
 const existing=combatChosenAction(defender);
 const parryId=existing?.id||crypto.randomUUID();
 const sourceData={
  action_key:'parry',label:'Parera',mode:'reaction',
  reaction_to_action_id:attack.id,attacker_id:attack.combatant_id
 };
 const payload={
  phase:'reaction',action_type:'parry',slot_key:'primary',source_data:sourceData,
  target_combatant_id:attack.combatant_id,status:'pending',
  sequence:Math.max(0,(combatNumber(defender.state?.initiative_rank,1)||1)-1),
  result:{reaction_to_action_id:attack.id},player_visible:true
 };
 try{
  if(existing){
   await dbJson('combat_actions?id=eq.'+encodeURIComponent(existing.id),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({...payload,updated_at:new Date().toISOString()})
   })
  }else{
   await dbJson('combat_actions',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
    id:parryId,combat_id:activeCombat.id,campaign_id:centralCampaignId,combatant_id:defender.id,
    round_number:Number(activeCombat.round_number)||1,...payload,created_by:activeUser()?.id||null
   })})
  }
  const attackResult={...(attack.result||{}),parry_decision:'parry',parry_action_id:parryId};
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(attack.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({result:attackResult,updated_at:new Date().toISOString()})
  });
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte välja parering',error);
  alert('Kunde inte välja parering: '+(error?.message||error))
 }
}
async function declineCombatParry(defenderId,attackActionId){
 const opportunity=combatPendingParryOpportunity();
 if(!opportunity||String(opportunity.defender.id)!==String(defenderId)||String(opportunity.attack.id)!==String(attackActionId)||!combatCanManage())return;
 try{
  const attackResult={...(opportunity.attack.result||{}),parry_decision:'declined'};
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(opportunity.attack.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({result:attackResult,updated_at:new Date().toISOString()})
  });
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte avstå parering',error);
  alert('Kunde inte registrera valet: '+(error?.message||error))
 }
}
function combatReactionPromptHtml(){
 const opportunity=combatPendingParryOpportunity();
 if(!opportunity)return '';
 const {attack,defender,attacker}=opportunity;
 return '<section class="combat-reaction-prompt">'+
  '<div><span>REAKTION</span><b>Lyckat närstridsanfall mot '+escAttr(defender.name_snapshot)+'</b>'+
  '<small>'+escAttr(attacker.name_snapshot)+' har träffat. '+escAttr(defender.name_snapshot)+' har en action kvar.</small></div>'+
  '<div class="combat-reaction-actions">'+
   '<button type="button" class="btn combat-parry-btn" onclick="chooseCombatParry(\''+defender.id+'\',\''+attack.id+'\')">🛡 Parera</button>'+
   '<button type="button" class="btn combat-take-hit-btn" onclick="declineCombatParry(\''+defender.id+'\',\''+attack.id+'\')">Ta träffen</button>'+
  '</div>'+
 '</section>'
}
function combatFumbleTableKey(mode,weapon=null){
 if(weapon?._unarmed)return 'natural';
 if(mode==='ranged')return 'ranged';
 return 'melee'
}
function combatFumbleRule(mode,weapon,roll){
 const tableKey=combatFumbleTableKey(mode,weapon);
 return typeof ruleCombatFumble==='function'?ruleCombatFumble(tableKey,roll):null
}
function combatFumbleTableLabel(tableKey){
 return tableKey==='ranged'?'avståndsvapen':tableKey==='natural'?'naturlig/obeväpnad attack':'närstridsvapen'
}
function combatParseSimpleDiceFormula(value){
 const match=String(value||'').trim().toUpperCase().match(/^(\d+)T(\d+)$/);
 if(!match)return null;
 const qty=Math.max(1,Math.min(20,Number(match[1])||1)),sides=Number(match[2]);
 return [3,4,6,8,10,20,100].includes(sides)?{qty,sides}:null
}
async function combatResolveFumbleParams(rule,weapon){
 const params={...(rule?.effect_params||{})};
 for(const key of ['count_dice','distance_dice']){
  const spec=combatParseSimpleDiceFormula(params[key]);
  if(!spec)continue;
  const rolled=await combatRollDice([spec],'Fummel · '+(key==='count_dice'?'antal':'avstånd'));
  const value=Number(rolled?.total);
  if(Number.isFinite(value))params[key==='count_dice'?'count':'distance_hex']=value
 }
 if(params.thrown_distance_dice){
  const category=weapon?.weaponCategory||weapon?.category||'';
  if(category==='thrown'){
   const spec=combatParseSimpleDiceFormula(params.thrown_distance_dice);
   if(spec){
    const rolled=await combatRollDice([spec],'Fummel · kastvapnets avstånd');
    const value=Number(rolled?.total);
    if(Number.isFinite(value))params.distance_hex=value
   }
  }else if(params.distance_hex==null){
   params.distance_hex=0
  }
 }
 return params
}
function combatFumbleOverlay(entry,totalEntries=1,index=0){
 const host=$('combatDiceReadout');if(!host||!entry)return;
 host.classList.remove('success','fail','special','perfect','outcome-show');
 host.classList.add('show','outcome-show','fumble','fumble-detail');
 host.innerHTML='<span class="combat-outcome-icon" aria-hidden="true">⚠</span>'+
  '<div class="combat-outcome-copy"><b>FUMMEL '+entry.roll+' · '+escAttr(entry.title)+'</b>'+
  '<span>'+escAttr(entry.effect_text||'')+(totalEntries>1?' · resultat '+(index+1)+'/'+totalEntries:'')+'</span></div>'
}
function combatFumbleEffectRecord(action,entry,weapon){
 return{
  id:(action?.id||'fumble')+':'+entry.sequence,
  source:'fumble',
  action_id:action?.id||null,
  round_number:Number(activeCombat?.round_number)||1,
  table_key:entry.table_key,
  roll:entry.roll,
  title:entry.title,
  effect_type:entry.effect_type,
  params:entry.params||{},
  weapon_key:weapon?._unarmed?'unarmed':combatWeaponKey(weapon),
  weapon_name:weapon?.name||'Obeväpnad',
  created_at:new Date().toISOString()
 }
}
async function combatApplyFumbleEntries(actor,action,weapon,entries){
 if(!actor||!entries?.length)return {applied:[],pending:[]};
 const state={...(actor.state||{})};
 const effects=Array.isArray(state.combat_effects)?[...state.combat_effects]:[];
 const broken=new Set((state.broken_weapon_keys||[]).map(String));
 const dropped=new Set((state.dropped_weapon_keys||[]).map(String));
 let movementMax=combatMovementMaximum(actor),movementRemaining=combatMovementBudget(actor);
 const applied=[],pending=[];
 for(const entry of entries){
  if(entry.effect_type==='roll_twice')continue;
  const effect=combatFumbleEffectRecord(action,entry,weapon);
  effects.push(effect);
  const key=weapon?._unarmed?'':combatWeaponKey(weapon);
  if(entry.effect_type==='weapon_break'&&key){
   broken.add(key);effect.applied=true;applied.push(effect.effect_type);continue
  }
  if(entry.effect_type==='drop_weapon'&&key){
   dropped.add(key);effect.applied=true;applied.push(effect.effect_type);continue
  }
  if(entry.effect_type==='prone'){
   state.prone=true;effect.applied=true;applied.push(effect.effect_type);continue
  }
  if(entry.effect_type==='movement_penalty'){
   const delta=Number(entry.params?.amount)||0;
   if(delta){
    movementMax=Math.max(0,movementMax+delta);
    movementRemaining=Math.max(0,Math.min(movementMax,movementRemaining+delta));
    state.fumble_movement_penalty=(Number(state.fumble_movement_penalty)||0)+delta;
    effect.applied=true;applied.push(effect.effect_type);continue
   }
  }
  effect.applied=false;
  effect.pending=true;
  pending.push(effect.effect_type)
 }
 state.combat_effects=effects;
 state.broken_weapon_keys=[...broken];
 state.dropped_weapon_keys=[...dropped];
 const patch={state,updated_at:new Date().toISOString()};
 if(movementMax!==combatMovementMaximum(actor))patch.movement_max=movementMax;
 if(movementRemaining!==combatMovementBudget(actor))patch.movement_remaining=movementRemaining;
 await dbJson('combatants?id=eq.'+encodeURIComponent(actor.id),{
  method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(patch)
 });
 actor.state=state;
 if(patch.movement_max!=null)actor.movement_max=patch.movement_max;
 if(patch.movement_remaining!=null)actor.movement_remaining=patch.movement_remaining;
 return{applied:[...new Set(applied)],pending:[...new Set(pending)]}
}
async function combatResolveFumbleChain(actor,action,mode,weapon){
 const tableKey=combatFumbleTableKey(mode,weapon),entries=[];
 let pendingRolls=1,sequence=0,truncated=false;
 while(pendingRolls>0){
  if(sequence>=20){truncated=true;break}
  pendingRolls--;sequence++;
  const rolled=await combatRollDice([{qty:1,sides:20}],'Fummel · '+combatFumbleTableLabel(tableKey));
  const value=Number(rolled?.rolls?.[0]?.value);
  if(!Number.isInteger(value))throw new Error('Fummelslaget gav inget giltigt T20-resultat.');
  const rule=combatFumbleRule(mode,weapon,value);
  if(!rule)throw new Error('Ingen fummelregel hittades för '+tableKey+' och T20 '+value+'.');
  const params=await combatResolveFumbleParams(rule,weapon);
  const entry={
   sequence,table_key:tableKey,roll:value,title:rule.title,effect_text:rule.effect_text,
   effect_type:rule.effect_type,params
  };
  entries.push(entry);
  combatFumbleOverlay(entry);
  if(rule.effect_type==='roll_twice')pendingRolls+=Math.max(2,Number(params.count)||2);
  if(pendingRolls>0)await new Promise(resolve=>setTimeout(resolve,650))
 }
 const effects=await combatApplyFumbleEntries(actor,action,weapon,entries);
 const result={table_key:tableKey,entries,effects,truncated};
 await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(entries.map(entry=>({
  combat_id:activeCombat.id,campaign_id:centralCampaignId,round_number:Number(activeCombat.round_number)||1,
  phase:'attack',actor_id:actor.id,target_id:null,event_type:'fumble',
  message:actor.name_snapshot+' · Fummel '+entry.roll+' · '+entry.title+' · '+entry.effect_text,
  details:{...entry,weapon_key:weapon?._unarmed?'unarmed':combatWeaponKey(weapon),weapon_name:weapon?.name||'Obeväpnad'},
  player_visible:true
 })))});
 if(entries.length)combatFumbleOverlay(entries[entries.length-1],entries.length,entries.length-1);
 return result
}
function combatFumbleResultHtml(result){
 const fumble=result?.fumble;
 if(!fumble?.entries?.length)return '';
 return '<div class="combat-fumble-results"><div class="combat-fumble-head"><b>⚠ Fummeltabell · '+escAttr(combatFumbleTableLabel(fumble.table_key))+'</b><span>Automatiskt slag</span></div>'+
  fumble.entries.map(entry=>'<div class="combat-fumble-row"><strong>T20 '+entry.roll+'</strong><div><b>'+escAttr(entry.title)+'</b><span>'+escAttr(entry.effect_text||'')+'</span></div></div>').join('')+
  (fumble.truncated?'<div class="combat-fumble-warning">Fummelkedjan stoppades efter 20 tabellslag.</div>':'')+
 '</div>'
}
function combatAttackFv(weapon){
 const fv=combatNumber(weapon?.fv,null);
 return fv!=null&&fv>0?Math.floor(fv):null
}
function combatOutcomeMeta(outcome){
 if(typeof expertOutcomePresentation==='function')return expertOutcomePresentation(outcome);
 return {
  fail:{label:'MISSLYCKAT SLAG',cls:'fail',icon:'✕',tier:'normal'},
  success:{label:'LYCKAT SLAG',cls:'success',icon:'✓',tier:'normal'},
  special:{label:'SÄRSKILT SLAG',cls:'special',icon:'✦',tier:'major'},
  perfect:{label:'PERFEKT SLAG',cls:'perfect',icon:'★',tier:'critical'},
  fumble:{label:'FUMMELSLAG',cls:'fumble',icon:'⚠',tier:'critical'}
 }[outcome]||{label:String(outcome||'').toUpperCase(),cls:'fail',icon:'?',tier:'normal'}
}
function combatOutcomeLabel(outcome){return combatOutcomeMeta(outcome).label}
function combatShowOutcomeOverlay(outcome,context=''){
 const host=$('combatDiceReadout');if(!host)return;
 const meta=combatOutcomeMeta(outcome);
 host.classList.remove('success','fail','special','perfect','fumble','outcome-show');
 host.innerHTML='<span class="combat-outcome-icon" aria-hidden="true">'+meta.icon+'</span><div class="combat-outcome-copy"><b>'+escAttr(meta.label)+'</b>'+(context?'<span>'+escAttr(context)+'</span>':'')+'</div>';
 host.classList.add('show','outcome-show',meta.cls)
}
function combatAttackResultHtml(action){
 if(!action||action.action_type!=='attack'||!action.result?.outcome)return '';
 const result=action.result,outcome=result.outcome,full=result.full_damage===true,meta=combatOutcomeMeta(outcome);
 return '<div class="combat-attack-result '+escAttr(outcome)+'">'+
  '<div><span>Attackslag</span><b><i class="combat-result-icon" aria-hidden="true">'+meta.icon+'</i>'+escAttr(meta.label)+'</b></div>'+
  '<div class="combat-attack-result-rolls"><span>T20 <b>'+result.roll+'</b> mot FV <b>'+result.fv+'</b></span>'+
   (result.confirmation_roll!=null?'<span>Kontrollslag <b>'+result.confirmation_roll+'</b></span>':'')+
  '</div>'+
  (full?'<strong>FULL SKADA</strong>':'')+
  (result.erf
   ?'<div class="combat-erf-result '+(result.erf.awarded>0?'gained':'locked')+'">'+
     (result.erf.awarded>0
      ?'<b>+'+result.erf.awarded+' ERF</b>'+(result.erf.erf_roll!=null?' · 1T3 '+result.erf.erf_roll+' + 1':'')
      :escAttr(result.erf.message||'Ingen ny ERF'))+
    '</div>'
   :'')+
  combatFumbleResultHtml(result)+
 '</div>'
}
function combatOutcomeEarnsErf(outcome){
 return ['success','special','perfect'].includes(outcome)
}
function combatSyncWeaponErfLocal(actor,weapon,newErf){
 if(actor?.source_type!=='character'||newErf==null||typeof chars==='undefined')return;
 const character=(chars||[]).find(c=>String(c._dbId||c.id)===String(actor.source_id));
 if(!character)return;
 const data=character.data&&typeof character.data==='object'?character.data:character;
 const key=String(weapon?.equipId||weapon?.name||'');
 const match=(data.weapons||[]).find(item=>String(item.equipId||item.name)===key);
 if(match)match.erf=Number(newErf)||0;
 try{localStorage.setItem('dod_chars_v03a',JSON.stringify(chars))}catch(_error){}
}
async function combatAwardAttackErf(actor,weapon,outcome){
 if(actor?.source_type!=='character'||!combatOutcomeEarnsErf(outcome))return null;
 const itemKey=String(weapon?.equipId||weapon?.name||'');
 if(!itemKey||!actor.source_id)return null;
 try{
  let amount=null,erfRoll=null;
  if(outcome==='perfect'){
   const roll=await combatRollDice([{qty:1,sides:3}],(weapon?.name||'Vapen')+' · ERF 1T3+1');
   erfRoll=Number(roll?.rolls?.[0]?.value);
   if(!Number.isInteger(erfRoll))throw new Error('ERF-slaget gav inget giltigt T3-resultat.');
   amount=erfRoll+1
  }
  if(typeof awardCharacterErfItem!=='function')throw new Error('ERF-regelmotorn är inte tillgänglig.');
  const awarded=await awardCharacterErfItem(actor.source_id,'weapons',itemKey,outcome,{amount});
  combatSyncWeaponErfLocal(actor,weapon,awarded?.new_erf);
  return {
   awarded:Number(awarded?.awarded)||amount||1,
   new_erf:Number(awarded?.new_erf),
   erf_roll:erfRoll,
   item_group:'weapons',item_key:itemKey,reason:outcome
  }
 }catch(error){
  const message=String(error?.message||error||'');
  if(/redan tjänat ERF|redan.*ERF/i.test(message)){
   return {awarded:0,locked:true,reason:outcome,message:'ERF redan erhållet under aktuell viloperiod.'}
  }
  if(/ny dag med vila|kan inte tjänas denna dag/i.test(message)){
   return {awarded:0,locked:true,reason:outcome,message:'Tillräcklig vila krävs för ny ERF-period.'}
  }
  console.warn('ERF från vapenattack kunde inte registreras',error);
  return {awarded:0,error:true,reason:outcome,message:message||'ERF kunde inte registreras.'}
 }
}
async function combatResolveAttackAction(actor,target,action,weapon){
 const fv=combatAttackFv(weapon);
 if(fv==null)throw new Error((weapon?.name||'Vapnet')+' saknar ett giltigt FV.');
 const label=(weapon?.name||'Vapen')+' · '+actor.name_snapshot+' → '+target.name_snapshot;
 const first=await combatRollDice([{qty:1,sides:20}],label);
 const roll=Number(first?.rolls?.[0]?.value);
 if(!Number.isInteger(roll))throw new Error('Attackslaget gav inget giltigt T20-resultat.');
 const ctx={target:fv,baseTarget:fv,skillConfirmKind:null};
 let resolution=typeof expertSkillInitialResolution==='function'
  ?expertSkillInitialResolution(ctx,roll)
  :{outcome:(roll!==20&&roll<=fv)?'success':'fail'};
 let confirmationRoll=null,outcome=resolution.outcome;
 if(!outcome&&resolution.confirm){
  ctx.skillConfirmKind=resolution.confirm;
  await new Promise(resolve=>setTimeout(resolve,520));
  const confirm=await combatRollDice([{qty:1,sides:20}],label+' · kontrollslag');
  confirmationRoll=Number(confirm?.rolls?.[0]?.value);
  if(!Number.isInteger(confirmationRoll))throw new Error('Kontrollslaget gav inget giltigt T20-resultat.');
  outcome=typeof expertSkillConfirmationResolution==='function'
   ?expertSkillConfirmationResolution(ctx,confirmationRoll)
   :resolution.fallback
 }
 const success=['success','special','perfect'].includes(outcome);
 const fullDamage=outcome==='special'||outcome==='perfect';
 const result={
  success,outcome,roll,confirmation_roll:confirmationRoll,fv,
  weapon_key:combatWeaponKey(weapon),weapon_name:weapon?.name||'Vapen',
  full_damage:fullDamage,damage_mode:fullDamage?'full':'roll',
  rule_engine:'expert_skill'
 };
 await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{
  method:'PATCH',headers:{'Prefer':'return=minimal'},
  body:JSON.stringify({
   target_combatant_id:target.id,status:'resolved',result,updated_at:new Date().toISOString()
  })
 });
 await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
  combat_id:activeCombat.id,campaign_id:centralCampaignId,round_number:Number(activeCombat.round_number)||1,
  phase:'attack',actor_id:actor.id,target_id:target.id,event_type:'attack',
  message:actor.name_snapshot+' attackerar '+target.name_snapshot+' med '+(weapon?.name||'vapen')+
   ' · T20 '+roll+(confirmationRoll!=null?' / kontroll '+confirmationRoll:'')+
   ' mot FV '+fv+' · '+combatOutcomeLabel(outcome)+(fullDamage?' · FULL SKADA':''),
  details:result,player_visible:true
 })});
 const erf=await combatAwardAttackErf(actor,weapon,outcome);
 if(erf)result.erf=erf;
 if(outcome==='fumble'){
  combatShowOutcomeOverlay(outcome,(weapon?.name||'Vapen')+' · T20 '+roll+' mot FV '+fv);
  await new Promise(resolve=>setTimeout(resolve,700));
  result.fumble=await combatResolveFumbleChain(actor,action,action?.source_data?.mode||'melee',weapon)
 }else{
  combatShowOutcomeOverlay(outcome,(weapon?.name||'Vapen')+' · T20 '+roll+' mot FV '+fv)
 }
 if(erf||result.fumble){
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({result,updated_at:new Date().toISOString()})
  })
 }
 return result
}
async function rollCombatAttack(actorId,targetId){
 if(combatDiceBusy||!combatCanManage())return;
 const actor=combatants.find(row=>String(row.id)===String(actorId));
 const target=combatants.find(row=>String(row.id)===String(targetId));
 const action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||!target||!action||def?.type!=='attack'||!combatIsActiveTurn(actor)||action.status!=='planned')return;
 const weapon=combatActionWeapon(actor,action,def.mode);
 if(!weapon)return;
 const possible=combatPossibleAttackTargets(actor,def.mode,weapon);
 if(!possible.has(String(target.id)))return;
 try{
  await combatResolveAttackAction(actor,target,action,weapon);
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte slå attack',error);
  alert('Attackslaget kunde inte genomföras: '+(error?.message||error))
 }
}
function combatAttackExecutionHtml(target){
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||!target||!action||def?.type!=='attack'||!['melee','ranged'].includes(def.mode))return '';
 if(action.result?.outcome&&String(action.target_combatant_id||'')===String(target.id))return combatAttackResultHtml(action);
 if(action.status!=='planned')return '';
 const weapon=combatActionWeapon(actor,action,def.mode);
 if(!weapon)return '';
 const possible=combatPossibleAttackTargets(actor,def.mode,weapon);
 if(!possible.has(String(target.id)))return '';
 const fv=combatAttackFv(weapon);
 if(fv==null)return '<div class="combat-attack-execute disabled"><b>'+escAttr(weapon.name||'Vapen')+'</b><span>Vapnet saknar FV och kan inte slås ännu.</span></div>';
 return '<div class="combat-attack-execute">'+
  '<div><span>Valt mål</span><b>'+escAttr(target.name_snapshot)+'</b><small>'+escAttr(weapon.name||'Vapen')+' · FV '+fv+'</small></div>'+
  '<button type="button" class="btn combat-attack-roll-btn" onclick="rollCombatAttack(\''+actor.id+'\',\''+target.id+'\')">🎲 Slå attack 1T20</button>'+
 '</div>'
}
async function chooseCombatAttackWeapon(combatantId,weaponKey){
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 const action=combatChosenAction(combatant),def=combatActionDefinition(action);
 if(!combatant||!action||def?.type!=='attack'||!combatCanChoosePrimaryAction(combatant))return;
 const weapon=combatAttackWeaponOptions(combatant,def.mode).find(item=>combatWeaponKey(item)===String(weaponKey));
 if(!weapon)return;
 const sourceData={...(action.source_data||{}),weapon_key:combatWeaponKey(weapon),weapon_name:weapon.name||'Vapen',weapon_id:weapon.weapon_id||weapon.weaponTypeId||null};
 try{
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({source_data:sourceData,target_combatant_id:null,updated_at:new Date().toISOString()})
  });
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte välja attackvapen',error);
  alert('Kunde inte välja vapen: '+(error?.message||error))
 }
}
function combatAttackWeaponChooserHtml(combatant,action,def){
 if(def?.type!=='attack'||!['melee','ranged'].includes(def.mode))return '';
 const options=combatAttackWeaponOptions(combatant,def.mode);
 if(!options.length){
  return def.mode==='melee'
   ?'<div class="combat-weapon-choice single"><span>Vapen</span><b>👊 Obeväpnad</b></div>'
   :'<div class="combat-weapon-choice empty"><span>Vapen</span><b>Inget aktivt avståndsvapen</b></div>'
 }
 const selected=combatActionWeapon(combatant,action,def.mode);
 if(options.length===1){
  return '<div class="combat-weapon-choice single"><span>Vapen</span><b>⚔ '+escAttr(options[0].name||'Vapen')+'</b></div>'
 }
 return '<div class="combat-weapon-choice"><span>Välj vapen för attacken</span><div class="combat-weapon-choice-grid">'+
  options.map(weapon=>{
   const key=combatWeaponKey(weapon),active=selected&&combatWeaponKey(selected)===key;
   const reach=def.mode==='melee'?combatMeleeReachHexesForWeapon(weapon):combatWeaponRangeHexes(weapon,combatant);
   return '<button type="button" class="combat-weapon-choice-btn'+(active?' active':'')+'" onclick="chooseCombatAttackWeapon(\''+combatant.id+'\',\''+escAttr(key)+'\')"><b>'+escAttr(weapon.name||'Vapen')+'</b><small>'+reach+' hex</small></button>'
  }).join('')+
 '</div></div>'
}
function combatActionChooserHtml(combatant){
 if(!combatant)return '';
 const chosen=combatChosenAction(combatant),chosenDef=combatActionDefinition(chosen);
 if(!combatIsActiveTurn(combatant)){
  const active=combatants.find(row=>String(row.id)===String(activeCombat?.active_actor_id||''));
  return '<div class="combat-action-box waiting"><b>Inte den här kombatantens tur</b><span>Aktuell tur: '+escAttr(active?.name_snapshot||'—')+'</span></div>'
 }
 if(!combatCanManage()){
  return '<div class="combat-action-box waiting"><b>Din tur</b><span>Actionval hanteras av SL i den här utvecklingsversionen.</span></div>'
 }
 if(combatMovementHasUsedMoreThanHalf(combatant)){
  return '<div class="combat-action-box waiting full-move"><b>Full förflyttning</b><span>Mer än halva förflyttningsförmågan är använd. Actionen är förbrukad och resten av turen avvaktas.</span></div>'
 }
 return '<div class="combat-action-box">'+
  '<div class="combat-action-head"><div><b>Välj action</b><span>En action denna SR</span></div>'+
   (chosenDef?'<strong>Vald: '+chosenDef.icon+' '+escAttr(chosenDef.label)+'</strong>':'<strong>Ingen vald</strong>')+
  '</div>'+
  '<div class="combat-action-grid">'+COMBAT_PRIMARY_ACTIONS.filter(def=>!def.automatic&&!def.reactive).map(def=>{
   const active=chosenDef?.key===def.key;
   return '<button type="button" class="combat-action-btn'+(active?' active':'')+'" onclick="chooseCombatPrimaryAction(\''+combatant.id+'\',\''+def.key+'\')">'+
    '<span>'+def.icon+'</span><b>'+escAttr(def.label)+'</b>'+
   '</button>'
  }).join('')+'</div>'+
  combatAttackWeaponChooserHtml(combatant,chosen,chosenDef)+
  '<div class="combat-action-note">Vald action begränsar återstående förflyttning till högst halva förflyttningsförmågan denna SR. Går du först mer än halva sträckan förbrukas actionen automatiskt.</div>'+
 '</div>'
}
function combatCanUseActionMenu(combatant){
 return !!combatant&&combatCanChoosePrimaryAction(combatant)&&!combatMovementHasUsedMoreThanHalf(combatant)&&combatHasUnusedAction(combatant)
}
function toggleCombatActionMenu(event,combatantId){
 event?.stopPropagation?.();
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 if(!combatCanUseActionMenu(combatant))return;
 combatMovementPlan=null;
 combatActionMenuId=String(combatActionMenuId||'')===String(combatantId)?null:String(combatantId);
 combatSelectedTargetId=combatant.id;
 renderCombat()
}
async function chooseCombatRowAction(event,combatantId,actionKey){
 event?.stopPropagation?.();
 combatActionMenuId=String(combatantId);
 await chooseCombatPrimaryAction(combatantId,actionKey)
}
function combatRowActionMenuHtml(combatant){
 if(!combatant||String(combatActionMenuId||'')!==String(combatant.id))return '';
 const chosen=combatChosenAction(combatant),chosenDef=combatActionDefinition(chosen);
 const options=COMBAT_PRIMARY_ACTIONS.filter(def=>!def.automatic&&!def.reactive);
 return '<div class="combat-row-action-menu" role="menu" onclick="event.stopPropagation()">'+
  '<div class="combat-row-action-menu-title">Action</div>'+
  '<div class="combat-row-action-menu-grid">'+options.map(def=>{
   const active=chosenDef?.key===def.key;
   return '<button type="button" role="menuitem" class="combat-row-action-option'+(active?' active':'')+'" onclick="chooseCombatRowAction(event,\''+combatant.id+'\',\''+def.key+'\')">'+
    '<span>'+def.icon+'</span><b>'+escAttr(def.label)+'</b>'+
   '</button>'
  }).join('')+'</div>'+
  combatAttackWeaponChooserHtml(combatant,chosen,chosenDef)+
 '</div>'
}
function combatTurnOrderIds(){
 const fromInitiative=Array.isArray(activeCombat?.initiative?.order)?activeCombat.initiative.order.map(String):[];
 const valid=new Set((combatants||[]).filter(row=>!['dead','removed'].includes(row.status)).map(row=>String(row.id)));
 const ordered=fromInitiative.filter(id=>valid.has(id));
 if(ordered.length)return ordered;
 return (combatants||[]).filter(row=>!['dead','removed'].includes(row.status))
  .slice().sort((a,b)=>(combatNumber(a.state?.initiative_rank,999)-combatNumber(b.state?.initiative_rank,999))||(Number(a.sort_order)||0)-(Number(b.sort_order)||0))
  .map(row=>String(row.id))
}
function combatCanEndTurn(combatant){
 return !!combatant&&combatCanManage()&&combatIsActiveTurn(combatant)&&activeCombat?.status==='active'&&!combatIsMovementPlanning(combatant)&&!combatPendingParryOpportunity()
}
async function endCombatTurn(event,combatantId){
 event?.stopPropagation?.();
 const actor=combatActiveActor();
 if(!actor||String(actor.id)!==String(combatantId)||!combatCanEndTurn(actor))return;
 combatActionMenuId=null;combatMovementPlan=null;
 const order=combatTurnOrderIds();
 if(!order.length)return;
 const currentIndex=Math.max(0,order.indexOf(String(actor.id)));
 const nextIndex=currentIndex+1;
 const newRound=nextIndex>=order.length;
 const currentRound=Number(activeCombat.round_number)||1;
 const nextActorId=newRound?null:order[nextIndex];
 const round=currentRound+(newRound?1:0);
 const combatId=activeCombat.id;
 try{
  await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
   combat_id:combatId,campaign_id:centralCampaignId,round_number:currentRound,
   phase:'movement',actor_id:actor.id,target_id:null,event_type:'turn_end',
   message:actor.name_snapshot+' avslutar draget'+(newRound?' · SR '+currentRound+' avslutad':''),
   details:{next_actor_id:nextActorId,new_round:newRound,round_number:round},player_visible:true
  })});
  if(newRound){
   await Promise.all((combatants||[]).filter(row=>!['dead','removed'].includes(row.status)).map(row=>dbJson('combatants?id=eq.'+encodeURIComponent(row.id),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({movement_remaining:combatMovementMaximum(row),updated_at:new Date().toISOString()})
   })));
   const pendingInitiative={formula:'SMI+1T10',status:'pending',rolled_at:null,order:[],results:[]};
   await dbJson('combat_instances?id=eq.'+encodeURIComponent(combatId),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({
     active_actor_id:null,active_responder_id:null,round_number:round,phase:'initiative',
     initiative:pendingInitiative,updated_at:new Date().toISOString()
    })
   });
   await loadActiveCombat(combatId);
   await combatRollAndApplyInitiative(combatId,{roundNumber:round});
   await loadActiveCombat(combatId);
   return
  }
  await dbJson('combat_instances?id=eq.'+encodeURIComponent(combatId),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({active_actor_id:nextActorId,active_responder_id:null,round_number:round,phase:'movement',updated_at:new Date().toISOString()})
  });
  await loadActiveCombat(combatId)
 }catch(error){
  console.error('Kunde inte avsluta draget',error);
  alert('Kunde inte avsluta draget: '+(error?.message||error))
 }
}
async function loadActiveCombat(combatId=null){
 activeCombat=null;combatants=[];combatHexes=[];combatActions=[];combatLogRows=[];combatSelectedTargetId=null;combatRuntimeMapUrl='';combatRuntimeMapMeta=null;combatRuntimeMapError='';
 if(!centralCampaignId){renderCombat();return null}
 try{
  const instanceQuery=combatId
   ?'combat_instances?id=eq.'+encodeURIComponent(combatId)+'&campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=*&limit=1'
   :'combat_instances?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&status=in.(setup,active,paused)&select=*&order=updated_at.desc&limit=1';
  let rows=await dbJson(instanceQuery);
  activeCombat=rows?.[0]||null;
  if(activeCombat){
   const activeSceneId=combatActiveSceneId();
   if(activeSceneId&&!combatSceneFromId(combatSelectedSceneId)&&combatSceneFromId(activeSceneId))combatSelectedSceneId=activeSceneId;
   let cid=encodeURIComponent(activeCombat.id),round=Number(activeCombat.round_number)||1;
   let data=await Promise.all([
    dbJson('combatants?combat_id=eq.'+cid+'&select=*&order=sort_order.asc,name_snapshot.asc'),
    dbJson('combat_hexes?combat_id=eq.'+cid+'&select=*&order=r.asc,q.asc'),
    dbJson('combat_actions?combat_id=eq.'+cid+'&round_number=eq.'+round+'&select=*&order=sequence.asc,created_at.asc'),
    dbJson('combat_log?combat_id=eq.'+cid+'&select=*&order=id.desc&limit=60')
   ]);
   combatants=Array.isArray(data[0])?data[0]:[];
   combatHexes=Array.isArray(data[1])?data[1]:[];
   combatActions=Array.isArray(data[2])?data[2]:[];
   combatLogRows=(Array.isArray(data[3])?data[3]:[]).reverse();
   combatSelectedTargetId=activeCombat.active_actor_id||null;
   if(combatMovementPlan&&String(combatMovementPlan.combatantId)!==String(activeCombat.active_actor_id||''))combatMovementPlan=null;
   if(combatActionMenuId&&String(combatActionMenuId)!==String(activeCombat.active_actor_id||''))combatActionMenuId=null;
   await loadCombatRuntimeBackground()
  }
 }catch(e){console.error('Kunde inte läsa strid',e);activeCombat=null}
 renderCombat();renderCombatGmControls();return activeCombat
}
async function openCombat(){
 combatReturn=!$('mapPage').classList.contains('hidden')?'map':(!$('dicePage').classList.contains('hidden')?'dice':(!$('view').classList.contains('hidden')?'view':(!$('admin').classList.contains('hidden')?'admin':'home')));
 ['home','view','admin','mapPage','dicePage'].forEach(id=>$(id).classList.add('hidden'));
 $('combatPage').classList.remove('hidden');$('back').classList.add('hidden');$('editBtn').classList.add('hidden');$('cancelEditBtn').classList.add('hidden');
 $('combatBody').innerHTML='<div class="combat-empty">Laddar strid…</div>';
 await loadCombatSceneChoices();
 await loadActiveCombat()
}
function closeCombat(){
 $('combatPage').classList.add('hidden');
 if(combatReturn==='map'){$('mapPage').classList.remove('hidden')}
 else if(combatReturn==='dice'){$('dicePage').classList.remove('hidden')}
 else if(combatReturn==='view'&&current){$('view').classList.remove('hidden');$('back').classList.remove('hidden');$('editBtn').classList.remove('hidden')}
 else if(combatReturn==='admin'&&activeUser()?.admin){$('admin').classList.remove('hidden')}
 else{$('home').classList.remove('hidden');renderCards()}
}
function selectCombatTarget(id){
 if(combatActionMenuId&&String(combatActionMenuId)!==String(id||''))combatActionMenuId=null;
 combatSelectedTargetId=id||null;renderCombat()
}
function combatTokenInitials(name){let a=String(name||'?').trim().split(/\s+/).filter(Boolean);return(a.length>1?(a[0][0]+a[a.length-1][0]):a[0]?.slice(0,2)||'?').toUpperCase()}
function combatHexNeighbors(q,r){
 return [[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]]
}
function combatSelectedCombatant(){
 return combatants.find(row=>String(row.id)===String(combatSelectedTargetId))||null
}
function combatActiveActor(){
 return combatants.find(row=>String(row.id)===String(activeCombat?.active_actor_id||''))||null
}
function combatMovementPlanningActor(){
 const actor=combatActiveActor();
 return actor&&String(combatMovementPlan?.combatantId||'')===String(actor.id)?actor:null
}
function combatIsMovementPlanning(combatant){
 return !!combatant&&String(combatMovementPlan?.combatantId||'')===String(combatant.id)
}
function combatCanPlanMovement(combatant){
 return !!combatant&&combatCanManage()&&combatIsActiveTurn(combatant)&&activeCombat?.status==='active'&&activeCombat?.phase==='movement'&&combatMovementBudget(combatant)>0
}
function combatMovementOccupied(combatant,q,r){
 return combatants.some(row=>row.status!=='removed'&&String(row.id)!==String(combatant?.id||'')&&Number(row.q)===Number(q)&&Number(row.r)===Number(r))
}
function combatSetMovementPreview(q,r,{render=true}={}){
 const actor=combatMovementPlanningActor();if(!actor)return false;
 q=Number(q);r=Number(r);
 const key=q+','+r,reachable=combatReachableHexes(actor),cost=reachable.get(key);
 if(cost==null||combatMovementOccupied(actor,q,r))return false;
 combatMovementPlan={...combatMovementPlan,q,r,cost:Number(cost)||0};
 if(render)renderCombat();
 return true
}
function previewCombatMovementToHex(event,q,r){
 event?.stopPropagation?.();
 return combatSetMovementPreview(q,r)
}
function combatMovementButton(event,combatantId){
 event?.stopPropagation?.();
 combatActionMenuId=null;
 const actor=combatActiveActor();
 if(!actor||String(actor.id)!==String(combatantId)||!combatCanPlanMovement(actor))return;
 if(!combatIsMovementPlanning(actor)){
  combatMovementPlan={
   combatantId:String(actor.id),
   startQ:Number(actor.q)||0,startR:Number(actor.r)||0,
   q:Number(actor.q)||0,r:Number(actor.r)||0,cost:0
  };
  combatSelectedTargetId=actor.id;
  renderCombat();
  return
 }
 if((Number(combatMovementPlan.cost)||0)<=0){
  combatMovementPlan=null;
  renderCombat();
  return
 }
 return commitCombatMovementPlan()
}
function combatSvgPoint(event,svg){
 if(!svg?.createSVGPoint)return null;
 const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 return point.matrixTransform(matrix.inverse())
}
function combatNearestRuntimeCell(point){
 if(!point)return null;
 let best=null,bestDistance=Infinity;
 for(const cell of combatRuntimeHexCells()){
  const dx=cell.x-point.x,dy=cell.y-point.y,d=dx*dx+dy*dy;
  if(d<bestDistance){best=cell;bestDistance=d}
 }
 return best
}
function combatMovementDragStart(event,combatantId){
 const actor=combatMovementPlanningActor();
 if(!actor||String(actor.id)!==String(combatantId))return;
 event.stopPropagation();event.preventDefault();
 const token=event.currentTarget,svg=token?.ownerSVGElement,point=combatSvgPoint(event,svg);
 if(!svg||!point)return;
 combatMovementDrag={
  pointerId:event.pointerId,combatantId:String(actor.id),token,svg,
  startPoint:point,moved:false
 };
 try{token.setPointerCapture?.(event.pointerId)}catch(_error){}
}
function combatMovementDragMove(event){
 const drag=combatMovementDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 event.preventDefault();
 const point=combatSvgPoint(event,drag.svg);if(!point)return;
 const dx=point.x-drag.startPoint.x,dy=point.y-drag.startPoint.y;
 if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;
 drag.token?.setAttribute('transform','translate('+dx+' '+dy+')')
}
function combatMovementDragEnd(event){
 const drag=combatMovementDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 event.preventDefault();event.stopPropagation();
 const point=combatSvgPoint(event,drag.svg);
 try{drag.token?.releasePointerCapture?.(event.pointerId)}catch(_error){}
 drag.token?.removeAttribute('transform');
 combatMovementDrag=null;
 if(!drag.moved)return;
 combatMovementSuppressClickUntil=Date.now()+350;
 const cell=combatNearestRuntimeCell(point);
 if(cell)combatSetMovementPreview(cell.q,cell.r)
}
function combatTokenClick(event,combatantId){
 if(Date.now()<combatMovementSuppressClickUntil){event?.stopPropagation?.();return}
 selectCombatTarget(combatantId)
}
function combatMovementHasUsedMoreThanHalf(combatant){
 return combatMovementSpent(combatant)>combatHalfMoveLimit(combatant)
}
function combatMovementAllowance(combatant){
 const remaining=combatMovementBudget(combatant);
 if(!combatant)return 0;
 if(combatMovementHasUsedMoreThanHalf(combatant))return remaining;
 const action=combatChosenAction(combatant);
 if(!action)return remaining;
 const def=combatActionDefinition(action);
 if(def?.key==='move_full')return remaining;
 const halfLeft=Math.max(0,combatHalfMoveLimit(combatant)-combatMovementSpent(combatant));
 return Math.min(remaining,halfLeft)
}
function combatAxialDistance(a,b){
 const aq=Number(a?.q)||0,ar=Number(a?.r)||0,bq=Number(b?.q)||0,br=Number(b?.r)||0;
 const dq=aq-bq,dr=ar-br;
 return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2
}
function combatCubeRound(x,y,z){
 let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
 const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);
 if(dx>dy&&dx>dz)rx=-ry-rz;
 else if(dy>dz)ry=-rx-rz;
 else rz=-rx-ry;
 return{q:rx,r:rz}
}
function combatHexLine(a,b){
 const aq=Number(a?.q)||0,ar=Number(a?.r)||0,bq=Number(b?.q)||0,br=Number(b?.r)||0;
 const ax=aq,az=ar,ay=-ax-az,bx=bq,bz=br,by=-bx-bz;
 const n=Math.max(0,combatAxialDistance(a,b)),out=[];
 if(!n)return[{q:aq,r:ar}];
 for(let i=0;i<=n;i++){
  const t=i/n;
  out.push(combatCubeRound(ax+(bx-ax)*t,ay+(by-ay)*t,az+(bz-az)*t))
 }
 return out
}
function combatHasLineOfSight(actor,target){
 const terrain=new Map(combatRuntimeHexCells().map(cell=>[cell.key,cell]));
 const line=combatHexLine(actor,target);
 for(let i=1;i<line.length-1;i++){
  const cell=terrain.get(line[i].q+','+line[i].r);
  if(cell?.sight_mode==='blocked')return false
 }
 return true
}
function combatAttackProfile(combatant){
 const stored=combatant?.state?.attack_profile;
 if(stored&&typeof stored==='object')return stored;
 let src=null;
 if(combatant?.source_type==='character'&&typeof chars!=='undefined')src=(chars||[]).find(c=>String(c._dbId||c.id)===String(combatant.source_id));
 else if(combatant?.source_type==='npc'&&typeof campaignNpcs!=='undefined')src=(campaignNpcs||[]).find(c=>String(c.id)===String(combatant.source_id));
 else if(combatant?.source_type==='monster'&&typeof campaignMonsters!=='undefined')src=(campaignMonsters||[]).find(c=>String(c.id)===String(combatant.source_id));
 if(!src)return{weapons:[],currentEquipment:null,sty:combatNumber(combatant?.state?.sty,10),smi:combatNumber(combatant?.state?.smi,10)};
 const data=src.data&&typeof src.data==='object'?src.data:src;
 const base=data.base&&typeof data.base==='object'?data.base:{};
 const attrs=src.attributes&&typeof src.attributes==='object'?src.attributes:{};
 const sty=combatNumber(base.Styrka?.v??base.STY,combatNumber(attrs.STY,combatNumber(combatant?.state?.sty,10)));
 const smi=combatNumber(base.Smidighet?.v??base.SMI,combatNumber(attrs.SMI,combatNumber(combatant?.state?.smi,10)));
 return{weapons:Array.isArray(data.weapons)?data.weapons:(Array.isArray(src.weapons)?src.weapons:[]),currentEquipment:data.currentEquipment||null,sty,smi}
}
function combatAvailableWeapons(combatant,mode){
 const profile=combatAttackProfile(combatant),weapons=Array.isArray(profile.weapons)?profile.weapons:[];
 let available=weapons;
 if(combatant?.source_type==='character'&&profile.currentEquipment){
  const refs=[profile.currentEquipment.leftHand,profile.currentEquipment.rightHand].filter(ref=>ref?.kind==='weapon'&&ref.itemId);
  const ids=new Set(refs.map(ref=>String(ref.itemId)));
  available=weapons.filter(weapon=>ids.has(String(weapon.equipId)))
 }
 const disabled=new Set([
  ...(Array.isArray(combatant?.state?.broken_weapon_keys)?combatant.state.broken_weapon_keys:[]),
  ...(Array.isArray(combatant?.state?.dropped_weapon_keys)?combatant.state.dropped_weapon_keys:[])
 ].map(String));
 if(disabled.size)available=available.filter(weapon=>!disabled.has(combatWeaponKey(weapon)));
 if(mode==='melee')return available.filter(weapon=>(weapon.weaponCategory||weapon.category||'melee')==='melee');
 return available.filter(weapon=>['projectile','thrown'].includes(weapon.weaponCategory||weapon.category))
}
function combatWeaponKey(weapon){
 return String(weapon?.equipId||weapon?.weapon_id||weapon?.weaponTypeId||weapon?.id||weapon?.name||'')
}
function combatAttackWeaponOptions(combatant,mode){
 const weapons=combatAvailableWeapons(combatant,mode),seen=new Set();
 return weapons.filter(weapon=>{
  const key=combatWeaponKey(weapon);
  if(!key||seen.has(key))return false;
  seen.add(key);return true
 })
}
function combatActionWeapon(combatant,action,mode){
 const options=combatAttackWeaponOptions(combatant,mode);
 if(!options.length)return mode==='melee'?{name:'Obeväpnad',_unarmed:true}:null;
 const selectedKey=String(action?.source_data?.weapon_key||'');
 if(selectedKey==='unarmed')return {name:'Obeväpnad',_unarmed:true};
 if(selectedKey)return options.find(weapon=>combatWeaponKey(weapon)===selectedKey)||null;
 return options.length===1?options[0]:null
}
function combatMeleeReachHexesForWeapon(weapon){
 const length=combatNumber(weapon?.weapon_length??weapon?.length,null);
 if(length==null)return 1;
 if(length<=1)return 1;
 if(length<=3)return 2;
 return 3
}
function combatMeleeRangeHexes(combatant,weapon=null){
 if(weapon?._unarmed)return 1;
 if(weapon)return combatMeleeReachHexesForWeapon(weapon);
 const weapons=combatAttackWeaponOptions(combatant,'melee');
 if(!weapons.length)return 1;
 return weapons.length===1?combatMeleeReachHexesForWeapon(weapons[0]):0
}
function combatWeaponRangeHexes(weapon,combatant){
 const raw=String(weapon?.range??weapon?.range_text??'').trim();
 if(!raw)return 0;
 const profile=combatAttackProfile(combatant),hexM=Math.max(.1,combatNumber(activeCombat?.settings?.hex_m,1.5));
 let match=raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*m\b/i);
 if(match)return Math.max(0,Math.floor(Number(match[1].replace(',','.'))/hexM));
 match=raw.match(/(STY|SMI)\s*[×x*]\s*([0-9]+(?:[.,][0-9]+)?)\s*rutor?/i);
 if(match){
  const base=match[1].toUpperCase()==='STY'?profile.sty:profile.smi;
  return Math.max(0,Math.floor(combatNumber(base,0)*Number(match[2].replace(',','.'))))
 }
 match=raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*rutor?/i);
 if(match)return Math.max(0,Math.floor(Number(match[1].replace(',','.'))));
 return 0
}
function combatAttackRangeHexes(combatant,mode,weapon=null){
 if(mode==='melee')return combatMeleeRangeHexes(combatant,weapon);
 if(weapon)return combatWeaponRangeHexes(weapon,combatant);
 const weapons=combatAttackWeaponOptions(combatant,'ranged');
 return weapons.length===1?combatWeaponRangeHexes(weapons[0],combatant):0
}
function combatPossibleAttackTargets(actor,mode,weapon=null){
 const out=new Map();
 if(!actor||!['melee','ranged'].includes(mode))return out;
 const maxRange=combatAttackRangeHexes(actor,mode,weapon);
 if(maxRange<=0)return out;
 for(const target of combatants){
  if(String(target.id)===String(actor.id)||target.visible_to_players===false)continue;
  if(target.side===actor.side)continue;
  if(['dead','removed'].includes(target.status))continue;
  const distance=combatAxialDistance(actor,target);
  if(distance<1||distance>maxRange)continue;
  if(!combatHasLineOfSight(actor,target))continue;
  out.set(String(target.id),{distance,maxRange})
 }
 return out
}
function combatCurrentAttackTargets(){
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||def?.type!=='attack'||!['melee','ranged'].includes(def.mode))return new Map();
 const weapon=combatActionWeapon(actor,action,def.mode);
 if(!weapon)return new Map();
 return combatPossibleAttackTargets(actor,def.mode,weapon)
}
function combatMovementBudget(combatant){
 if(!combatant)return 0;
 const remaining=combatNumber(combatant.movement_remaining,null);
 const maximum=combatNumber(combatant.movement_max,0);
 return Math.max(0,remaining==null?maximum:remaining)
}
function combatMovementMaximum(combatant){
 return Math.max(0,combatNumber(combatant?.movement_max,0))
}
function combatMovementSpent(combatant){
 const maximum=combatMovementMaximum(combatant);
 return Math.max(0,maximum-combatMovementBudget(combatant))
}
function combatHalfMoveLimit(combatant){
 return Math.floor(combatMovementMaximum(combatant)/2)
}
function combatDestinationKeepsAction(combatant,pathCost){
 if(!combatant||pathCost==null)return false;
 return combatMovementSpent(combatant)+Number(pathCost)<=combatHalfMoveLimit(combatant)
}
function combatReachableHexes(combatant){
 const cells=combatRuntimeHexCells();
 const cellByKey=new Map(cells.map(cell=>[cell.key,cell]));
 const out=new Map();
 if(!combatant||activeCombat?.phase!=='movement')return out;
 const startQ=Number(combatant.q)||0,startR=Number(combatant.r)||0,startKey=startQ+','+startR;
 const budget=combatMovementAllowance(combatant);
 if(!cellByKey.has(startKey))return out;
 const frontier=[{key:startKey,cost:0}];
 out.set(startKey,0);

 while(frontier.length){
  frontier.sort((a,b)=>a.cost-b.cost);
  const current=frontier.shift();
  if(current.cost!==out.get(current.key))continue;
  const [q,r]=current.key.split(',').map(Number);
  for(const [nq,nr] of combatHexNeighbors(q,r)){
   const key=nq+','+nr,cell=cellByKey.get(key);
   if(!cell||cell.movement_mode==='blocked')continue;
   const stepCost=cell.movement_mode==='difficult'?2:1;
   const nextCost=current.cost+stepCost;
   if(nextCost>budget)continue;
   const known=out.get(key);
   if(known==null||nextCost<known){
    out.set(key,nextCost);
    frontier.push({key,cost:nextCost})
   }
  }
 }
 return out
}
async function combatRecordFullMoveAction(combatant){
 if(!combatant||!activeCombat)return;
 const existing=combatChosenAction(combatant),def=COMBAT_PRIMARY_ACTIONS.find(item=>item.key==='move_full');
 if(!def)return;
 const round=Number(activeCombat.round_number)||1;
 const payload={
  phase:activeCombat.phase||'movement',action_type:'move',slot_key:'primary',
  source_data:{action_key:'move_full',label:'Full förflyttning',mode:'full',auto_wait:true},
  target_combatant_id:null,status:'resolved',
  sequence:Math.max(0,(combatNumber(combatant.state?.initiative_rank,1)||1)-1),
  result:{movement_spent:combatMovementSpent(combatant),wait_rest_of_turn:true},
  player_visible:true
 };
 if(existing){
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(existing.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({...payload,updated_at:new Date().toISOString()})
  })
 }else{
  await dbJson('combat_actions',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
   combat_id:activeCombat.id,campaign_id:centralCampaignId,combatant_id:combatant.id,
   round_number:round,...payload,created_by:activeUser()?.id||null
  })})
 }
}
async function commitCombatMovementPlan(){
 const actor=combatMovementPlanningActor(),plan=combatMovementPlan;
 if(!actor||!plan||!combatCanPlanMovement(actor))return;
 const q=Number(plan.q),r=Number(plan.r),cost=Number(plan.cost)||0;
 if(cost<=0||combatMovementOccupied(actor,q,r))return;
 const remaining=Math.max(0,combatMovementBudget(actor)-cost);
 const fromQ=Number(actor.q)||0,fromR=Number(actor.r)||0;
 try{
  await dbJson('combatants?id=eq.'+encodeURIComponent(actor.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({q,r,movement_remaining:remaining,updated_at:new Date().toISOString()})
  });
  actor.q=q;actor.r=r;actor.movement_remaining=remaining;
  if(combatMovementHasUsedMoreThanHalf(actor))await combatRecordFullMoveAction(actor);
  combatMovementAnimation={combatantId:String(actor.id),fromQ,fromR,toQ:q,toR:r};
  combatMovementPlan=null;
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte låsa förflyttning',error);
  alert('Kunde inte låsa förflyttningen: '+(error?.message||error))
 }
}
async function moveActiveCombatantToHex(q,r){
 const actor=combatActiveActor();if(!actor)return;
 if(!combatIsMovementPlanning(actor)){
  combatMovementPlan={combatantId:String(actor.id),startQ:Number(actor.q)||0,startR:Number(actor.r)||0,q:Number(actor.q)||0,r:Number(actor.r)||0,cost:0}
 }
 if(!combatSetMovementPreview(q,r,{render:false}))return;
 return commitCombatMovementPlan()
}
function combatAnimateCommittedMovement(){
 const move=combatMovementAnimation;if(!move)return;
 const g=combatRuntimeGeometry();if(!g)return;
 const token=document.querySelector('#combatPage .combat-token-group[data-token-id="'+CSS.escape(String(move.combatantId))+'"]');
 if(!token)return;
 combatMovementAnimation=null;
 const fromX=g.xPitch*(Number(move.fromQ)+Number(move.fromR)/2)+g.offsetX;
 const fromY=g.rowPitch*Number(move.fromR)+g.offsetY;
 const toX=g.xPitch*(Number(move.toQ)+Number(move.toR)/2)+g.offsetX;
 const toY=g.rowPitch*Number(move.toR)+g.offsetY;
 const dx=fromX-toX,dy=fromY-toY;
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 token.animate([
  {transform:'translate('+dx+'px,'+dy+'px)',filter:'brightness(1.22)',offset:0},
  {transform:'translate('+(dx*.28)+'px,'+(dy*.28)+'px)',filter:'brightness(1.12)',offset:.58},
  {transform:'translate('+(dx*.09)+'px,'+(dy*.09)+'px)',filter:'brightness(1.05)',offset:.82},
  {transform:'translate('+(dx*.025)+'px,'+(dy*.025)+'px)',filter:'brightness(1.02)',offset:.94},
  {transform:'translate(0,0)',filter:'brightness(1)',offset:1}
 ],{duration:780,easing:'linear',fill:'both'})
}
function combatHexPoints(x,y,size){
 let pts=[];for(let i=0;i<6;i++){let a=(Math.PI/180)*(60*i-30);pts.push((x+size*Math.cos(a)).toFixed(1)+','+(y+size*Math.sin(a)).toFixed(1))}return pts.join(' ')
}
function renderCombatMap(){
 const g=combatRuntimeGeometry();
 if(!g){
  const note=combatRuntimeMapError
   ?'Kunde inte ladda kartbilden: '+escAttr(combatRuntimeMapError)
   :'Stridsscenen saknar en tillgänglig kartbild.';
  return '<div class="combat-map-missing">'+note+'</div>'
 }
 const cells=combatRuntimeHexCells(),byCoord=new Map(cells.map(cell=>[cell.key,cell]));
 const actor=combatActiveActor(),planningActor=combatMovementPlanningActor();
 const reachable=planningActor?combatReachableHexes(planningActor):new Map();
 const originKey=planningActor?((Number(planningActor.q)||0)+','+(Number(planningActor.r)||0)):'';
 const previewKey=planningActor&&combatMovementPlan?Number(combatMovementPlan.q)+','+Number(combatMovementPlan.r):'';
 const attackTargets=combatCurrentAttackTargets();
 const terrain=cells.map(cell=>{
  const cls=['combat-hex'];
  const moveCost=reachable.get(cell.key);
  if(cell.movement_mode==='difficult')cls.push('difficult');
  if(cell.movement_mode==='blocked')cls.push('move-blocked');
  if(cell.sight_mode==='obscuring')cls.push('sight-obscuring');
  if(cell.sight_mode==='blocked')cls.push('sight-blocked');
  if(moveCost!=null&&cell.key!==originKey){
   cls.push('move-reachable');
   cls.push(combatDestinationKeepsAction(actor,moveCost)?'move-action-kept':'move-action-spent')
  }
  if(cell.key===originKey)cls.push('move-origin');
  const reachText=moveCost!=null
   ?' · kostnad '+moveCost+(combatDestinationKeepsAction(actor,moveCost)?' · handling kvar':' · full rörelse')
   :'';
  const occupied=combatants.some(row=>row.status!=='removed'&&String(row.id)!==String(planningActor?.id||'')&&Number(row.q)===cell.q&&Number(row.r)===cell.r);
  if(occupied)cls.push('move-occupied');
  if(previewKey&&cell.key===previewKey&&cell.key!==originKey)cls.push('move-preview');
  const clickable=!!planningActor&&moveCost!=null&&moveCost>0&&!occupied;
  return '<polygon class="'+cls.join(' ')+'" data-q="'+cell.q+'" data-r="'+cell.r+'" data-move-cost="'+(moveCost==null?'':moveCost)+'" '+(clickable?'onclick="previewCombatMovementToHex(event,'+cell.q+','+cell.r+')"':'')+' points="'+combatHexPoints(cell.x,cell.y,g.size*.97)+'"><title>Hex '+cell.q+','+cell.r+' · rörelse '+cell.movement_mode+' · sikt '+cell.sight_mode+reachText+(occupied?' · upptagen':'')+'</title></polygon>'
 }).join('');
 const tokens=combatants.filter(c=>c.status!=='removed').map(c=>{
  const isPlanning=combatIsMovementPlanning(c);
  const displayQ=isPlanning&&combatMovementPlan?Number(combatMovementPlan.q):Number(c.q)||0;
  const displayR=isPlanning&&combatMovementPlan?Number(combatMovementPlan.r):Number(c.r)||0;
  const key=displayQ+','+displayR;
  let cell=byCoord.get(key);
  if(!cell)cell={x:g.xPitch*(displayQ+displayR/2)+g.offsetX,y:g.rowPitch*displayR+g.offsetY};
  const side=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'',turn=combatIsActiveTurn(c)?' active-turn':'';
  const attack=attackTargets.get(String(c.id)),targetClass=attack?' attack-target':'',planningClass=isPlanning?' movement-planning':'';
  const targetTitle=attack?' · möjligt mål · '+attack.distance+' hex':'';
  return '<g class="combat-token-group'+planningClass+'" data-token-id="'+escAttr(c.id)+'" onclick="combatTokenClick(event,\''+c.id+'\')" '+(isPlanning?'onpointerdown="combatMovementDragStart(event,\''+c.id+'\')"':'')+'><circle class="combat-token '+side+selected+turn+targetClass+planningClass+'" cx="'+cell.x+'" cy="'+cell.y+'" r="'+(g.size*.48)+'"><title>'+escAttr(c.name_snapshot)+targetTitle+(isPlanning?' · dra för att planera förflyttning':'')+'</title></circle><text class="combat-token-label" x="'+cell.x+'" y="'+cell.y+'">'+escAttr(combatTokenInitials(c.name_snapshot))+'</text></g>'
 }).join('');
 const image=combatRuntimeMapUrl
  ?'<image class="combat-map-background" href="'+escAttr(combatRuntimeMapUrl)+'" x="0" y="0" width="'+g.width+'" height="'+g.height+'" preserveAspectRatio="none"/>'
  :'';
 return '<svg class="combat-map-svg" viewBox="0 0 '+g.width+' '+g.height+'" preserveAspectRatio="xMidYMid meet" aria-label="Hexkarta med bakgrund" onpointermove="combatMovementDragMove(event)" onpointerup="combatMovementDragEnd(event)" onpointercancel="combatMovementDragEnd(event)">'+image+terrain+tokens+'</svg>'
}

function combatantCard(c,index=0){
 const roleClass=c.source_type==='character'?'player-row':c.source_type==='npc'?'npc-row':'enemy-row';
 const selected=combatSelectedTargetId===c.id?' selected':'',turn=combatIsActiveTurn(c)?' active-turn':'',attack=combatCurrentAttackTargets().has(String(c.id))?' attack-target':'';
 const kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':'/'+c.max_kp);
 const psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':'/'+c.max_psy);
 const remaining=combatMovementBudget(c),maximum=combatMovementMaximum(c),half=combatHalfMoveLimit(c);
 const rank=combatNumber(c.state?.initiative_rank,null),total=combatNumber(c.state?.initiative_total,null),die=combatNumber(c.state?.initiative_roll,null),smi=combatNumber(c.state?.smi,null);
 const order=rank!=null?rank:index+1;
 const roleLabel=c.source_type==='character'?'Spelare':c.source_type==='npc'?'SLP':c.source_type==='monster'?'Monster':'Fiende';
 const planning=combatIsMovementPlanning(c),previewCost=planning?(Number(combatMovementPlan?.cost)||0):0;
 const canMove=combatCanPlanMovement(c),canAction=combatCanUseActionMenu(c),canEnd=combatCanEndTurn(c);
 const actionOpen=String(combatActionMenuId||'')===String(c.id),chosenDef=combatActionDefinition(combatChosenAction(c));
 const moveTitle=planning?(previewCost>0?'Lås förflyttning':'Avbryt förflyttning'):'Planera förflyttning';
 return'<div role="button" tabindex="0" data-combatant-id="'+escAttr(c.id)+'" class="combatant-card '+roleClass+selected+turn+attack+(planning?' movement-planning':'')+'" onclick="selectCombatTarget(\''+c.id+'\')">'+
  '<span class="combat-order-number"><b>'+order+'</b>'+(total!=null?'<small>Init '+total+'</small>':'<small>Init —</small>')+(smi!=null&&die!=null?'<em>(SMI'+smi+'+'+die+')</em>':'<em>—</em>')+'</span>'+
  '<div class="combatant-card-copy"><div class="name">'+escAttr(c.name_snapshot)+'</div><div class="meta">'+roleLabel+' · Förfl. '+remaining+'/'+maximum+(c.flying?' · Flyger':'')+'</div></div>'+
  '<div class="combat-row-controls">'+
   '<div class="combat-row-tool move-tool"><button type="button" class="combat-row-tool-btn combat-row-move'+(planning?' active':'')+'" title="'+moveTitle+'" aria-label="'+moveTitle+'" onclick="combatMovementButton(event,\''+c.id+'\')" '+(!canMove?'disabled':'')+'>'+(planning&&previewCost>0?'✓':'↔')+'</button><small><span>Hel '+maximum+'</span><span>Halv '+half+'</span></small></div>'+
   '<div class="combat-row-tool action-tool"><button type="button" class="combat-row-tool-btn combat-row-action'+(actionOpen?' active':'')+(chosenDef?' chosen':'')+'" title="Action" aria-label="Action" aria-haspopup="menu" aria-expanded="'+(actionOpen?'true':'false')+'" onclick="toggleCombatActionMenu(event,\''+c.id+'\')" '+(!canAction?'disabled':'')+'>'+(chosenDef?.icon||'⚡')+'</button>'+combatRowActionMenuHtml(c)+'</div>'+
   '<div class="combat-row-tool end-tool"><button type="button" class="combat-row-tool-btn combat-row-end" title="Avsluta drag" aria-label="Avsluta drag" onclick="endCombatTurn(event,\''+c.id+'\')" '+(!canEnd?'disabled':'')+'>⏭</button></div>'+
  '</div>'+
  '<div class="combat-row-vitals"><span>KP <b>'+kp+'</b></span><span>PSY <b>'+psy+'</b></span></div>'+
 '</div>'
}
function combatAttackTargetSummaryHtml(combatant){
 if(!combatant||!combatIsActiveTurn(combatant))return '';
 const action=combatChosenAction(combatant),def=combatActionDefinition(action);
 if(def?.type!=='attack'||!['melee','ranged'].includes(def.mode))return '';
 const options=combatAttackWeaponOptions(combatant,def.mode);
 const weapon=combatActionWeapon(combatant,action,def.mode);
 if(options.length>1&&!weapon)return '<div class="combat-attack-summary empty"><b>Välj vapen</b><span>Mål markeras först när du valt vilket vapen attacken görs med.</span></div>';
 if(def.mode==='ranged'&&!weapon)return '<div class="combat-attack-summary empty"><b>Inga möjliga mål</b><span>Inget aktivt avståndsvapen finns i handen.</span></div>';
 const targets=combatPossibleAttackTargets(combatant,def.mode,weapon);
 const range=combatAttackRangeHexes(combatant,def.mode,weapon);
 const weaponName=weapon?.name||'Obeväpnad';
 return '<div class="combat-attack-summary"><b>'+targets.size+' möjliga mål</b><span>'+escAttr(weaponName)+' · '+(def.mode==='melee'?'max '+range+' hex enligt vapenlängd':'max '+range+' hex')+' · fri LoS krävs</span></div>'
}
function combatTargetHtml(){
 let c=combatants.find(x=>x.id===combatSelectedTargetId);if(!c)return'<div class="combat-target-body"><div class="combat-target-note">Klicka på en pjäs eller deltagare för att markera mål. Tillgängliga attacker kommer senare att räknas fram från avstånd, sikt, utrustning och kvarvarande handlingar.</div></div>';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':' / '+c.max_kp),psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':' / '+c.max_psy);
 return'<div class="combat-target-body"><div class="combat-target-name">'+escAttr(c.name_snapshot)+'</div><div class="combat-target-stat"><span>Sida</span><b>'+combatSideLabel(c.side)+'</b></div><div class="combat-target-stat"><span>Initiativ</span><b>'+(c.state?.initiative_total!=null?('#'+c.state.initiative_rank+' · '+c.state.initiative_total+' (SMI '+c.state.smi+' + T10 '+c.state.initiative_roll+')'):'—')+'</b></div><div class="combat-target-stat"><span>KP</span><b>'+kp+'</b></div><div class="combat-target-stat"><span>PSY</span><b>'+psy+'</b></div><div class="combat-target-stat"><span>Position</span><b>'+c.q+', '+c.r+'</b></div><div class="combat-target-stat"><span>Rörelse</span><b>'+(c.flying?'Flygande':'Mark')+'</b></div><div class="combat-target-stat"><span>Förflyttning kvar</span><b>'+combatMovementBudget(c)+' / '+combatMovementMaximum(c)+'</b></div><div class="combat-target-stat"><span>Halv förflyttning</span><b>'+combatHalfMoveLimit(c)+' poäng</b></div><div class="combat-target-note"><b>Tydlig markering:</b> målet nås inom högst halva förflyttningsförmågan och handlingen finns kvar. <b>Diffus markering:</b> målet kräver mer än halva förflyttningen och förbrukar handlingen. När en action valts kan högst halva förflyttningen användas totalt denna SR.</div>'+combatAttackExecutionHtml(c)+combatAttackTargetSummaryHtml(c)+'</div>'
}
function renderCombat(){
 let body=$('combatBody'),sub=$('combatSubtitle');if(!body)return;
 if(!activeCombat){
  if(sub)sub.textContent='Ingen aktiv strid';
  body.innerHTML='<div class="combat-empty"><h3>Ingen aktiv strid</h3><div class="combat-foundation-note">Välj en stridsscen i SL-raden ovan och tryck <b>Play</b>. Alea skapar då striden och slår initiativ för samtliga kombatanter.</div><div class="combat-quick-note"><b>Reset</b> återställer den aktiva striden till stridsscenens sparade startpositioner, terräng och grundvärden.</div></div>';return
 }
 if(sub)sub.textContent=activeCombat.name||'Aktiv strid';
 let first=combatants.find(row=>String(row.id)===String(activeCombat.active_actor_id)),initiativeLead=first?(' · Initiativetta: '+first.name_snapshot):'';
 let participantHtml=combatants.length?combatants.map((c,index)=>combatantCard(c,index)).join(''):'<div class="combat-target-body"><div class="combat-target-note">Inga synliga deltagare ännu.</div></div>';
 let logHtml=combatLogRows.length?combatLogRows.map(x=>'<div class="combat-log-row"><span class="combat-log-phase">'+escAttr(combatPhaseLabel(x.phase))+'</span>'+escAttr(x.message)+'</div>').join(''):'<div class="combat-log-row">Ingen stridshändelse loggad ännu.</div>';
 body.innerHTML='<div class="combat-shell"><div class="combat-topbar"><span class="combat-round">Runda '+activeCombat.round_number+'</span><span class="combat-phase">'+escAttr(combatPhaseLabel(activeCombat.phase))+'</span><span class="combat-status">'+escAttr(combatStatusLabel(activeCombat.status))+escAttr(initiativeLead)+'</span><span class="combat-status">· Sparad strid</span>'+(combatCanManage()?'<span class="combat-status">· SL-läge</span>':'')+'</div>'+combatReactionPromptHtml()+'<aside class="combat-panel combat-participants"><h3>Turordning</h3><div class="combat-participant-list">'+participantHtml+'</div></aside><div class="combat-board-wrap"><div class="combat-board-head"><span>Hexkarta</span><div class="combat-board-legends"><div class="combat-move-legend"><span class="keep-action">Handling kvar</span><span class="spend-action">Full rörelse</span></div><div class="combat-legend"><span>Fri</span><span>Svår</span><span>Blockerad</span></div></div></div><div class="combat-board">'+renderCombatMap()+'</div></div><aside class="combat-panel combat-target"><h3>Markerat mål</h3>'+combatTargetHtml()+'</aside><section class="combat-log"><h3>Stridslogg</h3><div class="combat-log-list">'+logHtml+'</div></section></div>';
 requestAnimationFrame(()=>requestAnimationFrame(()=>{combatPositionDiceLayer();combatAnimateCommittedMovement()}))
}

window.addEventListener('resize',()=>{if(!$('combatPage')?.classList.contains('hidden'))combatPositionDiceLayer()});
window.addEventListener('scroll',()=>{if(!$('combatPage')?.classList.contains('hidden'))combatPositionDiceLayer()},{passive:true});
