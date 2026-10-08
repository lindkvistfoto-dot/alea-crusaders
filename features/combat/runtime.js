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
let combatActionMenuId=null,combatActionMenuKind=null;
let combatMapView={zoom:1,x:0,y:0},combatMapPan=null,combatMapPointers=new Map(),combatMapPinch=null,combatMapSuppressClickUntil=0,combatMapViewKey='';

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
 const sizeRaw=base.Storlek&&typeof base.Storlek==='object'?base.Storlek.v:(base.STO??base.Storlek);
 const smidighetRaw=base.Smidighet&&typeof base.Smidighet==='object'?base.Smidighet.v:(base.SMI??base.Smidighet);
 let smi=combatNumber(combatStateValue(state,'smi','SMI','smidighet'),combatNumber(smidighetRaw,combatNumber(attributes.SMI,10)));
 let sty=combatNumber(combatStateValue(state,'sty','STY','styrka'),combatNumber(strengthRaw,combatNumber(attributes.STY,10)));
 let sto=combatNumber(combatStateValue(state,'sto','STO','storlek'),combatNumber(sizeRaw,combatNumber(attributes.STO,10)));
 const sourceShields=Array.isArray(data.shields)?data.shields:
  Array.isArray(source?.shield)?source.shield:(source?.shield&&typeof source.shield==='object'?[source.shield]:[]);
 const sourceArmor=Array.isArray(data.armor)?data.armor:
  Array.isArray(source?.armor)?source.armor:(source?.armor&&typeof source.armor==='object'?[source.armor]:[]);
 const attackProfile={
  weapons:Array.isArray(data.weapons)?data.weapons:(Array.isArray(source?.weapons)?source.weapons:[]),
  currentEquipment:data.currentEquipment&&typeof data.currentEquipment==='object'?data.currentEquipment:null,
  shields:sourceShields,armor:sourceArmor,projectiles:Array.isArray(data.projectiles)?data.projectiles:[],
  damage_bonus:derived.Skadebonus??derived.skadebonus??null,
  spells:(Array.isArray(data.spells)?data.spells:[]).map(spell=>{
   const rule=(Array.isArray(ruleSpells)?ruleSpells:[]).find(row=>(row.name||'').localeCompare(spell?.name||'','sv',{sensitivity:'base'})===0);
   return {...spell,rule_id:rule?.id||null,attack_magic:rule?.attack_magic===true,damage_text:rule?.damage_text||'',range_text:rule?.range_text||'',school_id:rule?.school_id||null}
  }),
  sty,sto,smi
 };
 let maxKp=combatNumber(combatStateValue(state,'max_kp','kp_max'),combatNumber(live.KPmax,null));
 if(maxKp==null&&attributes.FYS!=null&&attributes.STO!=null)maxKp=Math.ceil((Number(attributes.FYS)+Number(attributes.STO))/2);
 let currentKp=combatNumber(combatStateValue(state,'current_kp','kp'),combatNumber(live.KP,maxKp));
 let maxPsy=combatNumber(combatStateValue(state,'max_psy','psy_max'),combatNumber(live.PSYmax,combatNumber(attributes.PSY,null)));
 let currentPsy=combatNumber(combatStateValue(state,'current_psy','psy'),combatNumber(live.PSY,maxPsy));
 let move=combatNumber(combatStateValue(state,'movement_max','movement','move'),combatNumber(derived['Förflyttning'],combatNumber(attributes.SMI,10)));
 return{
  current_kp:currentKp,max_kp:maxKp,current_psy:currentPsy,max_psy:maxPsy,
  movement_max:move,movement_remaining:move,smi,sty,sto,attack_profile:attackProfile,
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
  dbJson('campaign_npcs?campaign_id=eq.'+campaignId+'&select=id,name,attributes,weapons,shield,armor'),
  dbJson('campaign_monsters?campaign_id=eq.'+campaignId+'&select=id,name,attributes,weapons,shield,armor')
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
function combatMapFrameStyle(){
 const g=combatRuntimeGeometry();
 const width=Math.max(1,Number(g?.width)||1600),height=Math.max(1,Number(g?.height)||1000);
 return 'aspect-ratio:'+width+' / '+height
}
function combatMapFooterHtml(){
 const name=combatRuntimeMapMeta?.name||activeCombat?.name||'Stridskarta';
 return '<div class="combat-board-footer">'+
  '<div class="combat-board-description"><span>Hexkarta</span><small>'+escAttr(name)+'</small></div>'+
  '<div class="combat-map-zoom-controls">'+
   '<button type="button" title="Zooma ut" aria-label="Zooma ut" onclick="combatMapZoomStep(-1)">−</button>'+
   '<button id="combatMapZoomLabel" type="button" title="Återställ kartvy" onclick="combatMapResetView()">'+Math.round((combatMapView.zoom||1)*100)+'%</button>'+
   '<button type="button" title="Zooma in" aria-label="Zooma in" onclick="combatMapZoomStep(1)">+</button>'+
   '<button type="button" class="combat-map-fit-btn" title="Fokusera alla kombatanter" aria-label="Fokusera alla kombatanter" onclick="combatMapFitCombatants()">◎</button>'+
   '<button type="button" title="Återställ kartvy" aria-label="Återställ kartvy" onclick="combatMapResetView()">⌂</button>'+
  '</div>'+
  '<div class="combat-board-legends">'+
   '<div class="combat-move-legend"><span class="keep-action">Handling kvar</span><span class="spend-action">Full rörelse</span></div>'+
   '<div class="combat-legend"><span>Fri</span><span>Svår</span><span>Blockerad</span></div>'+
  '</div>'+
 '</div>'
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
 {key:'attack',type:'attack',label:'Attack',icon:'⚔',mode:'auto'},
 {key:'parry',type:'parry',label:'Parera',icon:'🛡',mode:'reaction',reactive:true},
 {key:'spell_cast',type:'spell',label:'Magi',icon:'✦',mode:'cast'},
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
 await window.combatUndoBeforeActorAction?.();
 const round=Number(activeCombat.round_number)||1;
 const existing=combatChosenAction(combatant);
 const weaponOptions=def.type==='attack'?combatAttackWeaponOptions(combatant,def.mode):[];
 const autoWeapon=weaponOptions.length===1?weaponOptions[0]:null;
 const sourceData={action_key:def.key,label:def.label,mode:def.mode};
 if(autoWeapon){
  sourceData.weapon_key=combatWeaponKey(autoWeapon);
  sourceData.weapon_name=autoWeapon.name||'Vapen';
  sourceData.weapon_id=autoWeapon.weapon_id||autoWeapon.weaponTypeId||null
 }else if(def.type==='attack'&&def.mode!=='ranged'&&!weaponOptions.length){
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
  await loadActiveCombat(null,{preserveSelectedTarget:def.type==='attack'})
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
 const mode=action?.result?.attack_mode||action?.source_data?.mode;
 return !!action&&action.action_type==='attack'&&mode==='melee'&&
  action.result?.success===true&&action.status!=='cancelled'
}
function combatPendingParryOpportunity(){
 const round=Number(activeCombat?.round_number)||1;
 for(let i=(combatActions||[]).length-1;i>=0;i--){
  const attack=combatActions[i];
  if(Number(attack.round_number)!==round||!combatSuccessfulMeleeAttack(attack))continue;
  if(!attack.target_combatant_id||attack.result?.hit_resolved===true||attack.result?.parry_decision)return null;
  const defender=combatants.find(row=>String(row.id)===String(attack.target_combatant_id));
  const attacker=combatants.find(row=>String(row.id)===String(attack.combatant_id));
  if(!defender||!attacker||['dead','removed'].includes(defender.status))return null;
  if(!combatCanParryAttack(defender))return null;
  return{attack,defender,attacker,options:combatParryOptions(defender)}
 }
 return null
}
async function chooseCombatParry(defenderId,attackActionId,parryKey=''){
 const opportunity=combatPendingParryOpportunity();
 if(!opportunity||String(opportunity.defender.id)!==String(defenderId)||String(opportunity.attack.id)!==String(attackActionId))return;
 const defender=opportunity.defender,attack=opportunity.attack,attacker=opportunity.attacker;
 if(!combatHasUnusedAction(defender)||!combatCanManage())return;
 const option=combatParryOption(defender,parryKey);
 if(!option)return;
 const existing=combatChosenAction(defender),parryId=existing?.id||crypto.randomUUID();
 const sourceData={
  action_key:'parry',label:'Parera',mode:'reaction',
  reaction_to_action_id:attack.id,attacker_id:attack.combatant_id,
  parry_key:option.key,parry_name:option.name,parry_kind:option.kind
 };
 const payload={
  phase:'reaction',action_type:'parry',slot_key:'primary',source_data:sourceData,
  target_combatant_id:attack.combatant_id,status:'resolving',
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
  const rolled=await combatExpertRoll('Parering · '+defender.name_snapshot+' med '+option.name,option.fv);
  const parryResult={
   success:rolled.success,outcome:rolled.outcome,roll:rolled.roll,confirmation_roll:rolled.confirmation_roll,
   fv:option.fv,item_key:option.key,item_name:option.name,item_kind:option.kind
  };
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(parryId),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({status:'resolved',result:{...parryResult,reaction_to_action_id:attack.id},updated_at:new Date().toISOString()})
  });
  const attackResult={
   ...(attack.result||{}),
   awaiting_parry:false,
   hit_resolved:true,
   parry_decision:rolled.success?'parried':'failed',
   parry:parryResult,
   parry_action_id:parryId
  };
  if(!rolled.success){
   const attackMode=attack.result?.attack_mode||attack.source_data?.mode||'melee';
   const weapon=combatActionWeapon(attacker,attack,attackMode);
   attackResult.hit_location=await combatResolveHitLocation(attacker,defender,attackMode,'parry_failed');
   if(weapon)attackResult.damage=await combatResolveDamage(attacker,defender,weapon,attack.result?.full_damage===true,attackResult.hit_location)
  }
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(attack.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({result:attackResult,updated_at:new Date().toISOString()})
  });
  await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
   combat_id:activeCombat.id,campaign_id:centralCampaignId,round_number:Number(activeCombat.round_number)||1,
   phase:'reaction',actor_id:defender.id,target_id:attacker.id,event_type:'parry',
   message:defender.name_snapshot+' parerar med '+option.name+' · '+combatOutcomeLabel(rolled.outcome)+
    (rolled.success?' · attacken stoppas':' · pareringen misslyckas'+(attackResult.hit_location?' · träff '+attackResult.hit_location.label:'')),
   details:parryResult,player_visible:true
  })});
  combatShowOutcomeOverlay(rolled.outcome,'Parering · '+option.name+' · T20 '+rolled.roll+' mot FV '+option.fv);
  await loadActiveCombat()
 }catch(error){
  console.error('Kunde inte genomföra parering',error);
  alert('Kunde inte genomföra parering: '+(error?.message||error))
 }
}
async function declineCombatParry(defenderId,attackActionId){
 const opportunity=combatPendingParryOpportunity();
 if(!opportunity||String(opportunity.defender.id)!==String(defenderId)||String(opportunity.attack.id)!==String(attackActionId)||!combatCanManage())return;
 try{
  const attackMode=opportunity.attack.result?.attack_mode||opportunity.attack.source_data?.mode||'melee';
  const weapon=combatActionWeapon(opportunity.attacker,opportunity.attack,attackMode);
  const attackResult={
   ...(opportunity.attack.result||{}),
   parry_decision:'declined',awaiting_parry:false,hit_resolved:true
  };
  attackResult.hit_location=await combatResolveHitLocation(
   opportunity.attacker,opportunity.defender,attackMode,'declined'
  );
  if(weapon)attackResult.damage=await combatResolveDamage(
   opportunity.attacker,opportunity.defender,weapon,opportunity.attack.result?.full_damage===true,attackResult.hit_location
  );
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
 return ''
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
function combatCharacterSource(combatant){
 if(combatant?.source_type!=='character'||typeof chars==='undefined')return null;
 return (chars||[]).find(c=>String(c._dbId||c.id)===String(combatant.source_id))||null
}
function combatWeaponSkillTarget(combatant,weapon){
 const character=combatCharacterSource(combatant);
 if(!character||typeof characterWeaponSkillTarget!=='function')return null;
 return characterWeaponSkillTarget(weapon,character)
}
function combatAttackFv(weapon,combatant=null){
 const skillTarget=combatWeaponSkillTarget(combatant,weapon);
 if(skillTarget?.linked){
  const linkedFv=combatNumber(skillTarget.fv,null);
  return linkedFv!=null&&linkedFv>0?Math.floor(linkedFv):null
 }
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
const COMBAT_HIT_LOCATION_TABLES={
 humanoid:{
  A:{die:8,label:'Projektil / oförsvarad närstrid',rows:[
   {min:1,max:1,key:'right_leg',label:'Höger ben'},
   {min:2,max:2,key:'left_leg',label:'Vänster ben'},
   {min:3,max:3,key:'abdomen',label:'Mage'},
   {min:4,max:5,key:'chest',label:'Bröstkorg'},
   {min:6,max:6,key:'right_arm',label:'Höger arm'},
   {min:7,max:7,key:'left_arm',label:'Vänster arm'},
   {min:8,max:8,key:'head',label:'Huvud'}
  ]},
  B:{die:10,label:'Försvarad närstrid',rows:[
   {min:1,max:1,key:'right_leg',label:'Höger ben'},
   {min:2,max:2,key:'left_leg',label:'Vänster ben'},
   {min:3,max:3,key:'abdomen',label:'Mage'},
   {min:4,max:4,key:'chest',label:'Bröstkorg'},
   {min:5,max:6,key:'right_arm',label:'Höger arm'},
   {min:7,max:8,key:'left_arm',label:'Vänster arm'},
   {min:9,max:10,key:'head',label:'Huvud'}
  ]}
 }
};
function combatHitLocationProfile(combatant){
 const profile=String(combatant?.state?.hit_location_profile||combatant?.state?.anatomy_profile||'humanoid').trim();
 return COMBAT_HIT_LOCATION_TABLES[profile]?profile:'humanoid'
}
function combatHitLocationTableKey(attackMode='melee',defenseMode='none'){
 return attackMode==='melee'&&defenseMode==='parry_failed'?'B':'A'
}
function combatHitLocationRule(profile,tableKey,roll){
 const table=COMBAT_HIT_LOCATION_TABLES[profile]?.[tableKey]||COMBAT_HIT_LOCATION_TABLES.humanoid?.[tableKey];
 if(!table)return null;
 const row=table.rows.find(entry=>roll>=entry.min&&roll<=entry.max);
 return row?{table,row}:null
}
async function combatResolveHitLocation(actor,target,attackMode='melee',defenseMode='none'){
 const profile=combatHitLocationProfile(target),tableKey=combatHitLocationTableKey(attackMode,defenseMode);
 const table=COMBAT_HIT_LOCATION_TABLES[profile]?.[tableKey];
 if(!table)return null;
 const rolled=await combatRollDice([{qty:1,sides:table.die}],'Träffområde · '+actor.name_snapshot+' → '+target.name_snapshot);
 const roll=Number(rolled?.rolls?.[0]?.value);
 if(!Number.isInteger(roll))throw new Error('Träffområdesslaget gav inget giltigt resultat.');
 const resolved=combatHitLocationRule(profile,tableKey,roll);
 if(!resolved)return null;
 return{profile,table:tableKey,table_label:table.label,die:'1T'+table.die,roll,key:resolved.row.key,label:resolved.row.label,defense_mode:defenseMode}
}
let combatHitMaskSeq=0;
const COMBAT_HIT_CAMERA={
 head:{scale:2.5,tx:-75,ty:19},
 chest:{scale:2.05,tx:-52.5,ty:-11.5},
 abdomen:{scale:2.0,tx:-50,ty:-40},
 right_arm:{scale:1.9,tx:-5,ty:-20},
 left_arm:{scale:1.9,tx:-85,ty:-20},
 right_leg:{scale:1.55,tx:-12,ty:-59},
 left_leg:{scale:1.55,tx:-43,ty:-59}
};
function combatHitLocationFigureHtml(hitLocation){
 const active=String(hitLocation?.key||''),model=window.ALEA_HIT_BODY_MODEL?.src||'',data=window.ALEA_HIT_BODY_ZONES||null;
 const zone=data?.zones?.[active],outline=String(data?.outline||''),viewBox=String(data?.viewBox||'0 0 1024 1536');
 const camera=COMBAT_HIT_CAMERA[active]||{scale:1,tx:0,ty:0};
 if(!model||!zone||!outline){
  return '<div class="combat-hit-model-stage"><div class="combat-hit-model-missing">Kroppsmodell eller träffzon saknas</div></div>'
 }
 const uid='combatHit_'+(++combatHitMaskSeq),clipId=uid+'_clip';
 const zonePaths=(zone.paths||[]).map(d=>'<path d="'+d+'"/>').join('');
 const cameraStyle='--hit-scale:'+camera.scale+';--hit-tx:'+camera.tx+'%;--hit-ty:'+camera.ty+'%';
 return '<div class="combat-hit-model-stage">'+
  '<div class="combat-hit-camera" style="'+cameraStyle+'">'+
   '<img class="combat-hit-model-image" src="'+model+'" alt="" aria-hidden="true">'+
   '<svg class="combat-hit-model-overlay" viewBox="'+escAttr(viewBox)+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Träffområde '+escAttr(hitLocation?.label||'')+'">'+
    '<defs><clipPath id="'+clipId+'"><path d="'+outline+'"/></clipPath></defs>'+
    '<g class="combat-hit-zone-fill" clip-path="url(#'+clipId+')">'+zonePaths+'</g>'+
   '</svg>'+
  '</div>'+
 '</div>'
}
function combatHitLocationResultHtml(hitLocation){
 if(!hitLocation?.label)return '';
 return '<div class="combat-hit-location-result">'+
  '<div class="combat-hit-location-head"><span>🎯 Träffområde</span><b>'+escAttr(hitLocation.label)+'</b></div>'+
  '<div class="combat-hit-location-copy">'+
   '<small>'+escAttr(hitLocation.die||'')+' → '+escAttr(hitLocation.roll)+' · Expert tabell '+escAttr(hitLocation.table||'')+'</small>'+
  '</div>'+
 '</div>'
}
function combatHitLocationCameraHtml(hitLocation){
 if(!hitLocation?.label)return '';
 return '<aside class="combat-attack-hit-camera" aria-label="Träffkamera">'+
  '<div class="combat-hit-figure-wrap">'+combatHitLocationFigureHtml(hitLocation)+'</div>'+
 '</aside>'
}

function combatAttackResultHtml(action){
 if(!action||action.action_type!=='attack'||!action.result?.outcome)return '';
 const result=action.result,outcome=result.outcome,full=result.full_damage===true,meta=combatOutcomeMeta(outcome),hasHit=!!result.hit_location?.label;
 return '<div class="combat-attack-result '+escAttr(outcome)+(hasHit?' has-hit-camera':'')+'">'+
  '<div class="combat-attack-result-main">'+
   '<div class="combat-attack-result-heading"><span>Attackslag</span><b><i class="combat-result-icon" aria-hidden="true">'+meta.icon+'</i>'+escAttr(meta.label)+'</b></div>'+
   '<div class="combat-attack-result-rolls"><span>T20 <b>'+result.roll+'</b> mot FV <b>'+result.fv+'</b></span>'+
    (result.confirmation_roll!=null?'<span>Kontrollslag <b>'+result.confirmation_roll+'</b></span>':'')+
   '</div>'+
   (full?'<strong>FULL SKADA</strong>':'')+
   combatHitLocationResultHtml(result.hit_location)+
   (result.erf&&(result.erf.awarded>0||!result.erf.locked)
    ?'<div class="combat-erf-result '+(result.erf.awarded>0?'gained':'locked')+'">'+
      (result.erf.awarded>0
       ?'<b>+'+result.erf.awarded+' ERF</b>'+(result.erf.erf_roll!=null?' · 1T3 '+result.erf.erf_roll+' + 1':'')
       :escAttr(result.erf.message||'Ingen ny ERF'))+
     '</div>'
    :'')+
   combatFumbleResultHtml(result)+
   combatParryResultHtml(result)+
   combatDamageResultHtml(result.damage)+
  '</div>'+
  combatHitLocationCameraHtml(result.hit_location)+
 '</div>'
}
function combatOutcomeEarnsErf(outcome){
 return ['success','special','perfect'].includes(outcome)
}
function combatAttackErfTarget(actor,weapon){
 const character=combatCharacterSource(actor),skillTarget=combatWeaponSkillTarget(actor,weapon);
 if(character&&skillTarget?.linked&&skillTarget.skillId&&skillTarget.skill){
  return{item_group:'skills',item_key:String(skillTarget.skillId),item:skillTarget.skill}
 }
 const data=character?(character.data&&typeof character.data==='object'?character.data:character):null;
 const key=String(weapon?.equipId||weapon?.name||'');
 const item=(data?.weapons||[]).find(entry=>String(entry.equipId||entry.name)===key)||null;
 return{item_group:'weapons',item_key:key,item}
}
function combatSyncAttackErfLocal(actor,weapon,newErf){
 if(actor?.source_type!=='character'||newErf==null||typeof chars==='undefined')return;
 const target=combatAttackErfTarget(actor,weapon);
 if(target.item)target.item.erf=Number(newErf)||0;
 try{localStorage.setItem('dod_chars_v03a',JSON.stringify(chars))}catch(_error){}
}
async function combatAwardAttackErf(actor,weapon,outcome){
 if(actor?.source_type!=='character'||!combatOutcomeEarnsErf(outcome))return null;
 const erfTarget=combatAttackErfTarget(actor,weapon),itemKey=erfTarget.item_key,itemGroup=erfTarget.item_group;
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
  const awarded=await awardCharacterErfItem(actor.source_id,itemGroup,itemKey,outcome,{amount});
  combatSyncAttackErfLocal(actor,weapon,awarded?.new_erf);
  return {
   awarded:Number(awarded?.awarded)||amount||1,
   new_erf:Number(awarded?.new_erf),
   erf_roll:erfRoll,
   item_group:itemGroup,item_key:itemKey,reason:outcome
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
async function combatResolveAttackAction(actor,target,action,weapon,attackMode='melee'){
 const fv=combatAttackFv(weapon,actor);
 if(fv==null)throw new Error((weapon?.name||'Vapnet')+' saknar ett giltigt FV.');
 const label=(weapon?.name||'Vapen')+' · '+actor.name_snapshot+' → '+target.name_snapshot;
 const rolled=await combatExpertRoll(label,fv);
 const outcome=rolled.outcome,success=rolled.success,fullDamage=outcome==='special'||outcome==='perfect';
 const result={
  success,outcome,roll:rolled.roll,confirmation_roll:rolled.confirmation_roll,fv,
  weapon_key:combatWeaponKey(weapon),weapon_name:weapon?.name||'Vapen',attack_mode:attackMode,
  full_damage:fullDamage,damage_mode:fullDamage?'full':'roll',
  rule_engine:'expert_skill',
  hit_resolved:!success,
  awaiting_parry:false
 };
 const erf=await combatAwardAttackErf(actor,weapon,outcome);
 if(erf)result.erf=erf;
 if(outcome==='fumble'){
  combatShowOutcomeOverlay(outcome,(weapon?.name||'Vapen')+' · T20 '+rolled.roll+' mot FV '+fv);
  await new Promise(resolve=>setTimeout(resolve,700));
  result.fumble=await combatResolveFumbleChain(actor,action,attackMode,weapon)
 }else{
  combatShowOutcomeOverlay(outcome,(weapon?.name||'Vapen')+' · T20 '+rolled.roll+' mot FV '+fv)
 }
 if(success){
  if(attackMode==='melee'&&combatCanParryAttack(target)){
   result.awaiting_parry=true;
   result.hit_resolved=false
  }else{
   result.parry_decision=attackMode==='melee'?'unavailable':'not_applicable';
   const defenseMode=attackMode==='melee'?'undefended':'ranged';
   result.hit_location=await combatResolveHitLocation(actor,target,attackMode,defenseMode);
   result.damage=await combatResolveDamage(actor,target,weapon,fullDamage,result.hit_location);
   result.hit_resolved=true
  }
 }
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
   ' · '+(attackMode==='melee'?'närstrid':'avstånd')+
   ' · T20 '+rolled.roll+(rolled.confirmation_roll!=null?' / kontroll '+rolled.confirmation_roll:'')+
   ' mot FV '+fv+' · '+combatOutcomeLabel(outcome)+(fullDamage?' · FULL SKADA':'')+
   (result.hit_location?' · träff '+result.hit_location.label:'')+
   (result.awaiting_parry?' · inväntar parering':''),
  details:result,player_visible:true
 })});
 return result
}
async function rollCombatAttack(actorId,targetId){
 if(combatDiceBusy||!combatCanManage())return;
 const actor=combatants.find(row=>String(row.id)===String(actorId));
 const target=combatants.find(row=>String(row.id)===String(targetId));
 const action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||!target||!action||def?.type!=='attack'||!combatIsActiveTurn(actor)||action.status!=='planned')return;
 const mode=def.mode||action?.source_data?.mode||'auto';
 const weapon=combatActionWeapon(actor,action,mode);
 if(!weapon)return;
 const possible=combatPossibleAttackTargets(actor,mode,weapon),info=possible.get(String(target.id));
 if(!info)return;
 try{
  await combatResolveAttackAction(actor,target,action,weapon,info.mode);
  await loadActiveCombat(null,{preserveSelectedTarget:true})
 }catch(error){
  console.error('Kunde inte slå attack',error);
  alert('Attackslaget kunde inte genomföras: '+(error?.message||error))
 }
}
function combatAttackExecutionHtml(target){
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||!target||!action||def?.type!=='attack')return '';
 if(action.result?.outcome&&String(action.target_combatant_id||'')===String(target.id))return combatAttackResultHtml(action);
 if(action.status!=='planned')return '';
 const mode=def.mode||action?.source_data?.mode||'auto';
 const weapon=combatActionWeapon(actor,action,mode);
 if(!weapon)return '';
 const possible=combatPossibleAttackTargets(actor,mode,weapon),info=possible.get(String(target.id));
 if(!info)return '';
 const fv=combatAttackFv(weapon,actor);
 if(fv==null)return '<div class="combat-attack-execute disabled"><b>'+escAttr(weapon.name||'Vapen')+'</b><span>Vapnet saknar FV och kan inte slås ännu.</span></div>';
 return '<div class="combat-attack-execute">'+
  '<div><span>Valt mål · '+(info.mode==='melee'?'Närstrid':'Avstånd')+'</span><b>'+escAttr(target.name_snapshot)+'</b><small>'+escAttr(weapon.name||'Vapen')+' · FV '+fv+' · '+info.distance+' hex</small></div>'+
  '<button type="button" class="btn combat-attack-roll-btn" onclick="rollCombatAttack(\''+actor.id+'\',\''+target.id+'\')">🎲 Slå attack 1T20</button>'+
 '</div>'
}
async function chooseCombatAttackWeapon(combatantId,weaponKey){
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 const action=combatChosenAction(combatant),def=combatActionDefinition(action);
 if(!combatant||!action||def?.type!=='attack'||!combatCanChoosePrimaryAction(combatant))return;
 const mode=def.mode||action?.source_data?.mode||'auto';
 const weapon=combatAttackWeaponOptions(combatant,mode).find(item=>combatWeaponKey(item)===String(weaponKey));
 if(!weapon)return;
 const sourceData={...(action.source_data||{}),weapon_key:combatWeaponKey(weapon),weapon_name:weapon.name||'Vapen',weapon_id:weapon.weapon_id||weapon.weaponTypeId||null};
 try{
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({source_data:sourceData,target_combatant_id:null,updated_at:new Date().toISOString()})
  });
  if(combatActionMenuKind==='attack')combatCloseRowActionMenu();
  await loadActiveCombat(null,{preserveSelectedTarget:true})
 }catch(error){
  console.error('Kunde inte välja attackvapen',error);
  alert('Kunde inte välja vapen: '+(error?.message||error))
 }
}
function combatWeaponAttackHint(weapon,combatant){
 const category=combatWeaponCategory(weapon),fv=combatAttackFv(weapon,combatant),fvText=fv==null?'FV — · ':'FV '+fv+' · ';
 if(category==='thrown')return fvText+'Närkontakt = närstrid · annars avstånd '+combatWeaponRangeHexes(weapon,combatant)+' hex';
 if(category==='projectile')return fvText+'Avstånd · '+combatWeaponRangeHexes(weapon,combatant)+' hex';
 return fvText+'Närstrid · '+combatMeleeReachHexesForWeapon(weapon)+' hex'
}
function combatAttackWeaponChooserHtml(combatant,action,def){
 if(def?.type!=='attack')return '';
 const mode=def.mode||action?.source_data?.mode||'auto';
 const options=combatAttackWeaponOptions(combatant,mode);
 if(!options.length)return '<div class="combat-weapon-choice single"><span>Vapen</span><b>👊 Obeväpnad</b><small>Närstrid · 1 hex</small></div>';
 const selected=combatActionWeapon(combatant,action,mode);
 if(options.length===1){
  return '<div class="combat-weapon-choice single"><span>Vapen</span><b>⚔ '+escAttr(options[0].name||'Vapen')+'</b><small>'+escAttr(combatWeaponAttackHint(options[0],combatant))+'</small></div>'
 }
 return '<div class="combat-weapon-choice"><span>Välj aktivt vapen</span><div class="combat-weapon-choice-grid">'+
  options.map(weapon=>{
   const key=combatWeaponKey(weapon),active=selected&&combatWeaponKey(selected)===key;
   return '<button type="button" class="combat-weapon-choice-btn'+(active?' active':'')+'" onclick="chooseCombatAttackWeapon(\''+combatant.id+'\',\''+escAttr(key)+'\')"><b>'+escAttr(weapon.name||'Vapen')+'</b><small>'+escAttr(combatWeaponAttackHint(weapon,combatant))+'</small></button>'
  }).join('')+
 '</div></div>'
}
function combatSpellOptions(combatant){
 return (combatant?.attack_profile?.spells||[]).filter(spell=>spell?.name)
}
function combatSpellKey(spell){return String(spell?.rule_id||spell?.name||'spell')}
function combatSpellChooserHtml(combatant,action){
 const options=combatSpellOptions(combatant),selectedKey=String(action?.source_data?.spell_key||''),effect=Math.max(1,Number(action?.source_data?.effect_grade)||1);
 if(!options.length)return '<div class="combat-spell-choice"><span>Förbered besvärjelse</span><small>Rollfiguren har inga besvärjelser.</small></div>';
 return '<div class="combat-spell-choice"><span>Förbered besvärjelse</span><div class="combat-weapon-choice-grid">'+options.map(spell=>{
  const key=combatSpellKey(spell),active=selectedKey===key;
  return '<button type="button" class="combat-weapon-choice-btn'+(active?' active':'')+'" onclick="chooseCombatPreparedSpell(\''+combatant.id+'\',\''+escAttr(key)+'\')"><b>'+escAttr(spell.name||'Besvärjelse')+'</b><small>FV '+escAttr(spell.fv??'—')+(spell.range_text?' · '+escAttr(spell.range_text):'')+'</small></button>'
 }).join('')+'</div><div class="combat-spell-effect"><span>Effektgrad</span><button type="button" onclick="stepCombatSpellEffect(\''+combatant.id+'\',-1)">−</button><b>'+effect+'</b><button type="button" onclick="stepCombatSpellEffect(\''+combatant.id+'\',1)">+</button></div><small>Välj besvärjelse och effektgrad. Tryck sedan ✦ för att slunga den.</small></div>'
}
async function combatMagicButton(event,combatantId){
 event?.stopPropagation?.();
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));if(!combatCanUseActionMenu(combatant))return;
 combatMovementPlan=null;
 const action=combatChosenAction(combatant),data=action?.source_data||{};
 if(combatActionDefinition(action)?.key==='spell_cast'&&action?.status==='planned'&&data.spell_prepared){
  if(data.casting_spell){
   const targetId=String(combatSelectedTargetId||''),targets=combatFireballTargets();
   if(targetId&&targets.has(targetId)){await rollCombatTestFireball(combatant.id,targetId);return}
   combatSelectedTargetId=null;renderCombat();return
  }
  const sourceData={...data,casting_spell:true,test_fireball:String(data.spell_name||'').toUpperCase().startsWith('ELD')};
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({source_data:sourceData,updated_at:new Date().toISOString()})});
  action.source_data=sourceData;combatCloseRowActionMenu();combatSelectedTargetId=null;renderCombat();return
 }
 if(!action||combatActionDefinition(action)?.key!=='spell_cast'||action.status!=='planned'){
  await chooseCombatPrimaryAction(combatantId,'spell_cast')
 }
 combatActionMenuId=String(combatantId);combatActionMenuKind='magic';combatSelectedTargetId=null;renderCombat()
}
async function chooseCombatPreparedSpell(combatantId,spellKey){
 const combatant=combatants.find(row=>String(row.id)===String(combatantId)),action=combatChosenAction(combatant);
 if(!combatant||!action||combatActionDefinition(action)?.key!=='spell_cast')return;
 const spell=combatSpellOptions(combatant).find(row=>combatSpellKey(row)===String(spellKey));if(!spell)return;
 const sourceData={...(action.source_data||{}),spell_key:combatSpellKey(spell),spell_id:spell.rule_id||null,spell_name:spell.name,spell_fv:Number(spell.fv)||0,damage_text:spell.damage_text||'',range_text:spell.range_text||'',attack_magic:spell.attack_magic===true,effect_grade:Math.max(1,Number(action.source_data?.effect_grade)||1),spell_prepared:true,casting_spell:false,test_fireball:false};
 await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({source_data:sourceData,updated_at:new Date().toISOString()})});
 action.source_data=sourceData;renderCombat()
}
async function stepCombatSpellEffect(combatantId,delta){
 const combatant=combatants.find(row=>String(row.id)===String(combatantId)),action=combatChosenAction(combatant);if(!action)return;
 const effect=Math.max(1,(Number(action.source_data?.effect_grade)||1)+Number(delta||0));
 const sourceData={...(action.source_data||{}),effect_grade:effect};
 await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({source_data:sourceData,updated_at:new Date().toISOString()})});
 action.source_data=sourceData;renderCombat()
}
function combatRowMagicMenuHtml(combatant){
 if(!combatant||String(combatActionMenuId||'')!==String(combatant.id)||combatActionMenuKind!=='magic')return '';
 const action=combatChosenAction(combatant);
 return '<div class="combat-row-action-menu combat-row-magic-menu" role="menu" onclick="event.stopPropagation()"><div class="combat-row-action-menu-title">Förbered besvärjelse</div>'+combatSpellChooserHtml(combatant,action)+'</div>'
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
function combatCloseRowActionMenu(){
 combatActionMenuId=null;combatActionMenuKind=null
}
async function combatCancelPlannedAttack(combatant,action){
 if(!combatant||!action||action.status!=='planned')return;
 combatSelectedTargetId=null;
 combatCloseRowActionMenu();
 try{
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{
   method:'DELETE',headers:{'Prefer':'return=minimal'}
  });
  await loadActiveCombat(null,{preserveSelectedTarget:true})
 }catch(error){
  console.error('Kunde inte avbryta attackläge',error);
  alert('Kunde inte avbryta attackläget: '+(error?.message||error))
 }
}
async function combatAttackButton(event,combatantId){
 event?.stopPropagation?.();
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 if(!combatCanUseActionMenu(combatant))return;
 combatMovementPlan=null;
 combatCloseRowActionMenu();
 const chosen=combatChosenAction(combatant),chosenDef=combatActionDefinition(chosen);
 if(chosenDef?.key==='attack'&&chosen?.status==='planned'){
  const selectedTargetId=String(combatSelectedTargetId||'');
  const validTargets=combatCurrentAttackTargets();
  const target=selectedTargetId&&validTargets.has(selectedTargetId)
   ?combatants.find(row=>String(row.id)===selectedTargetId)
   :null;
  if(!target){
   await combatCancelPlannedAttack(combatant,chosen);
   return
  }
  const mode=chosenDef.mode||chosen?.source_data?.mode||'auto';
  let weapon=combatActionWeapon(combatant,chosen,mode);
  let info=weapon?combatAttackTargetInfo(combatant,target,weapon,mode):null;
  if(!info){
   const valid=combatAttackWeaponOptions(combatant,mode).filter(item=>combatAttackTargetInfo(combatant,target,item,mode));
   if(valid.length!==1){renderCombat();return}
   weapon=valid[0];
   const sourceData={...(chosen.source_data||{}),weapon_key:combatWeaponKey(weapon),weapon_name:weapon.name||'Vapen',weapon_id:weapon.weapon_id||weapon.weaponTypeId||null};
   await dbJson('combat_actions?id=eq.'+encodeURIComponent(chosen.id),{
    method:'PATCH',headers:{'Prefer':'return=minimal'},
    body:JSON.stringify({source_data:sourceData,updated_at:new Date().toISOString()})
   });
   chosen.source_data=sourceData;
   info=combatAttackTargetInfo(combatant,target,weapon,mode)
  }
  if(info)await rollCombatAttack(combatant.id,target.id);
  return
 }
 combatSelectedTargetId=null;
 await chooseCombatPrimaryAction(combatantId,'attack')
}
function toggleCombatOtherActionsMenu(event,combatantId){
 event?.stopPropagation?.();
 const combatant=combatants.find(row=>String(row.id)===String(combatantId));
 if(!combatCanUseActionMenu(combatant))return;
 combatMovementPlan=null;
 const open=String(combatActionMenuId||'')===String(combatantId)&&combatActionMenuKind==='other';
 combatActionMenuId=open?null:String(combatant.id);
 combatActionMenuKind=open?null:'other';
 combatSelectedTargetId=combatant.id;
 renderCombat()
}
function toggleCombatActionMenu(event,combatantId){
 return toggleCombatOtherActionsMenu(event,combatantId)
}
async function chooseCombatRowAction(event,combatantId,actionKey){
 event?.stopPropagation?.();
 combatCloseRowActionMenu();
 await chooseCombatPrimaryAction(combatantId,actionKey)
}
function combatRowAttackMenuHtml(combatant){
 if(!combatant||String(combatActionMenuId||'')!==String(combatant.id)||combatActionMenuKind!=='attack')return '';
 const chosen=combatChosenAction(combatant),chosenDef=combatActionDefinition(chosen);
 if(chosenDef?.key!=='attack')return '';
 return '<div class="combat-row-action-menu combat-row-attack-menu" role="menu" onclick="event.stopPropagation()">'+
  '<div class="combat-row-action-menu-title">Attack · välj vapen</div>'+
  combatAttackWeaponChooserHtml(combatant,chosen,chosenDef)+
 '</div>'
}
function combatRowActionMenuHtml(combatant){
 if(!combatant||String(combatActionMenuId||'')!==String(combatant.id)||combatActionMenuKind!=='other')return '';
 const chosen=combatChosenAction(combatant),chosenDef=combatActionDefinition(chosen);
 const options=COMBAT_PRIMARY_ACTIONS.filter(def=>!def.automatic&&!def.reactive&&def.key!=='attack'&&def.type!=='spell');
 return '<div class="combat-row-action-menu combat-row-other-menu" role="menu" onclick="event.stopPropagation()">'+
  '<div class="combat-row-action-menu-title">Andra actions</div>'+
  '<div class="combat-row-action-menu-grid">'+options.map(def=>{
   const active=chosenDef?.key===def.key;
   return '<button type="button" role="menuitem" class="combat-row-action-option'+(active?' active':'')+'" onclick="chooseCombatRowAction(event,\''+combatant.id+'\',\''+def.key+'\')">'+
    '<span>'+def.icon+'</span><b>'+escAttr(def.label)+'</b>'+
   '</button>'
  }).join('')+'</div>'+
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
 combatCloseRowActionMenu();combatMovementPlan=null;
 const order=combatTurnOrderIds();
 if(!order.length)return;
 const currentIndex=Math.max(0,order.indexOf(String(actor.id)));
 const nextIndex=currentIndex+1;
 const newRound=nextIndex>=order.length;
 const currentRound=Number(activeCombat.round_number)||1;
 const nextActorId=newRound?null:order[nextIndex];
 const round=currentRound+(newRound?1:0);
 const combatId=activeCombat.id;
 const undoSnapshot=await window.combatUndoBeforeActorAction?.();
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
   try{await window.combatUndoAfterTurnAdvanced?.(undoSnapshot)}catch(undoError){console.warn('Kunde inte uppdatera ångra-checkpoint efter turbyte',undoError)}
   return
  }
  await dbJson('combat_instances?id=eq.'+encodeURIComponent(combatId),{
   method:'PATCH',headers:{'Prefer':'return=minimal'},
   body:JSON.stringify({active_actor_id:nextActorId,active_responder_id:null,round_number:round,phase:'movement',updated_at:new Date().toISOString()})
  });
  await loadActiveCombat(combatId);
  try{await window.combatUndoAfterTurnAdvanced?.(undoSnapshot)}catch(undoError){console.warn('Kunde inte uppdatera ångra-checkpoint efter turbyte',undoError)}
 }catch(error){
  console.error('Kunde inte avsluta draget',error);
  alert('Kunde inte avsluta draget: '+(error?.message||error))
 }
}
async function loadActiveCombat(combatId=null,{preserveSelectedTarget=false}={}){
 const selectedTargetBeforeLoad=combatSelectedTargetId;
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
   const selectedTargetStillExists=selectedTargetBeforeLoad==null||combatants.some(row=>String(row.id)===String(selectedTargetBeforeLoad));
   combatSelectedTargetId=preserveSelectedTarget&&selectedTargetStillExists?selectedTargetBeforeLoad:(activeCombat.active_actor_id||null);
   if(combatMovementPlan&&String(combatMovementPlan.combatantId)!==String(activeCombat.active_actor_id||''))combatMovementPlan=null;
   if(combatActionMenuId&&String(combatActionMenuId)!==String(activeCombat.active_actor_id||''))combatCloseRowActionMenu();
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
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(actor&&(def?.type==='attack'||action?.source_data?.test_fireball===true)&&action?.status==='planned'){
  if(id&&String(id)===String(actor.id)){
   combatSelectedTargetId=null;
   renderCombat();
   return
  }
  if(id){
   const targets=combatCurrentAttackTargets();
   if(!targets.has(String(id))){
    combatSelectedTargetId=null;
    renderCombat();
    return
   }
   if(String(combatSelectedTargetId||'')===String(id)){
    combatSelectedTargetId=null;
    renderCombat();
    return
   }
  }
 }
 combatSelectedTargetId=id||null;renderCombat()
}
function combatTokenInitials(name){let a=String(name||'?').trim().split(/\s+/).filter(Boolean);return(a.length>1?(a[0][0]+a[a.length-1][0]):a[0]?.slice(0,2)||'?').toUpperCase()}
function combatPlayerMiniatureKind(combatant){
 if(combatant?.source_type!=='character')return null;
 const explicit=String(combatant?.state?.miniature_kind||'').toLowerCase();
 if(['warrior','wizard','duck'].includes(explicit))return explicit;
 const name=String(combatant?.name_snapshot||'').toLowerCase();
 if(name.includes('astrid'))return 'warrior';
 if(name.includes('lyra'))return 'wizard';
 if(name.includes('evalin'))return 'duck';
 return null
}
function combatMiniatureDefs(){
 return '<defs>'+
  '<linearGradient id="miniMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0f2f3"/><stop offset=".45" stop-color="#8e989e"/><stop offset="1" stop-color="#444d52"/></linearGradient>'+
  '<linearGradient id="miniBlue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#315c8e"/><stop offset="1" stop-color="#142e50"/></linearGradient>'+
  '<linearGradient id="miniGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#557c43"/><stop offset="1" stop-color="#223a25"/></linearGradient>'+
  '<linearGradient id="miniLeather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9d6d3e"/><stop offset="1" stop-color="#4f301f"/></linearGradient>'+
  '<radialGradient id="miniMagic"><stop offset="0" stop-color="#d8fbff"/><stop offset=".35" stop-color="#59d9ff"/><stop offset="1" stop-color="#2775d8" stop-opacity=".15"/></radialGradient>'+
  '<filter id="miniDrop" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#000" flood-opacity=".55"/></filter>'+
  '<linearGradient id="portraitHexFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7b56f"/><stop offset=".22" stop-color="#7b633d"/><stop offset=".58" stop-color="#30271d"/><stop offset="1" stop-color="#0f0d0a"/></linearGradient>'+
  '<linearGradient id="portraitHexGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dff8d"/><stop offset=".42" stop-color="#1fd04a"/><stop offset="1" stop-color="#087926"/></linearGradient>'+
  '<filter id="portraitHexShadow" x="-60%" y="-60%" width="220%" height="240%"><feDropShadow dx="0" dy="4" stdDeviation="2.4" flood-color="#000" flood-opacity=".72"/></filter>'+
 '</defs>'
}
function combatMiniatureWarrior(){
 return '<g class="mini-figure mini-warrior" filter="url(#miniDrop)">'+
  '<path d="M-10 5 L-8 -13 L-2 -17 L0 6 Z" fill="#5b3928"/><path d="M10 5 L8 -13 L2 -17 L0 6 Z" fill="#5b3928"/>'+
  '<path d="M-12 -12 L-9 -31 Q0 -38 9 -31 L12 -12 L7 -2 L-7 -2 Z" fill="url(#miniMetal)" stroke="#d9b25b" stroke-width="1.5"/>'+
  '<path d="M-9 -29 Q0 -35 9 -29 L7 -19 L-7 -19 Z" fill="#6e3030" opacity=".75"/>'+
  '<circle cx="0" cy="-39" r="7" fill="#e7b18c" stroke="#5b3427" stroke-width="1.5"/>'+
  '<path d="M-7 -42 Q0 -51 8 -42 Q3 -45 -1 -43 Q-4 -38 -8 -36 Z" fill="#8a3f27"/>'+
  '<path d="M-11 -28 L-23 -20" stroke="url(#miniMetal)" stroke-width="6" stroke-linecap="round"/>'+
  '<path d="M-23 -20 L-34 -34" stroke="#d8dfe2" stroke-width="3.2" stroke-linecap="round"/><path d="M-29 -29 L-35 -26" stroke="#d1a247" stroke-width="2"/>'+
  '<path d="M11 -28 L23 -23" stroke="url(#miniMetal)" stroke-width="6" stroke-linecap="round"/>'+
  '<path d="M20 -32 Q31 -29 30 -13 Q22 -8 16 -17 Z" fill="#68727a" stroke="#d0a84f" stroke-width="2"/><path d="M21 -25 L28 -20 M25 -29 L22 -14" stroke="#d0a84f" stroke-width="1.5"/>'+
 '</g>'
}
function combatMiniatureWizard(){
 return '<g class="mini-figure mini-wizard" filter="url(#miniDrop)">'+
  '<path d="M0 -3 L-17 -6 L-11 -31 Q0 -38 11 -31 L17 -6 Z" fill="url(#miniBlue)" stroke="#c7a45b" stroke-width="1.4"/>'+
  '<path d="M-7 -33 Q0 -45 7 -33 L4 -27 L-4 -27 Z" fill="#152b4c" stroke="#c7a45b" stroke-width="1.3"/>'+
  '<circle cx="0" cy="-36" r="5.5" fill="#e5b38e"/>'+
  '<path d="M-4 -38 Q0 -44 6 -37" stroke="#d7d1c8" stroke-width="3" fill="none"/>'+
  '<path d="M-9 -27 L-23 -17" stroke="#e7d7bf" stroke-width="5" stroke-linecap="round"/>'+
  '<path d="M-23 -44 L-23 -7" stroke="#6a4525" stroke-width="3.2" stroke-linecap="round"/><circle cx="-23" cy="-47" r="5" fill="url(#miniMagic)" stroke="#81e4ff" stroke-width="1.5"/>'+
  '<path d="M10 -26 Q20 -23 24 -31" stroke="#e7d7bf" stroke-width="5" fill="none" stroke-linecap="round"/>'+
  '<circle cx="27" cy="-34" r="7" fill="url(#miniMagic)"/><path d="M20 -34 Q27 -43 34 -34 Q27 -25 20 -34 Z" fill="none" stroke="#8de7ff" stroke-width="1.4" opacity=".9"/>'+
 '</g>'
}
function combatMiniatureDuck(){
 return '<g class="mini-figure mini-duck" filter="url(#miniDrop)">'+
  '<path d="M-12 -2 Q-12 -24 -6 -30 Q0 -35 8 -28 Q13 -17 11 -2 Z" fill="url(#miniGreen)" stroke="#263c25" stroke-width="1.4"/>'+
  '<circle cx="0" cy="-36" r="8" fill="#f3efe1" stroke="#b9aa91" stroke-width="1.1"/>'+
  '<path d="M6 -37 L18 -33 L6 -29 Z" fill="#e99b25" stroke="#9c5f16" stroke-width="1"/>'+
  '<circle cx="-2" cy="-38" r="1.7" fill="#2b211b"/>'+
  '<path d="M-7 -42 Q0 -50 9 -42 L11 -37 Q0 -40 -8 -36 Z" fill="#315b35" stroke="#213a25" stroke-width="1.2"/><path d="M4 -48 L12 -54" stroke="#b04d28" stroke-width="2.5" stroke-linecap="round"/>'+
  '<path d="M-7 -25 L-20 -18" stroke="#f3efe1" stroke-width="5" stroke-linecap="round"/><path d="M-20 -18 L-30 -29" stroke="#d9d9d6" stroke-width="2.8" stroke-linecap="round"/>'+
  '<path d="M7 -24 L18 -15" stroke="#f3efe1" stroke-width="5" stroke-linecap="round"/>'+
  '<path d="M-5 0 L-9 8 M5 0 L9 8" stroke="#d98522" stroke-width="5" stroke-linecap="round"/><path d="M-13 9 L-5 9 M5 9 L13 9" stroke="#e99b25" stroke-width="4" stroke-linecap="round"/>'+
 '</g>'
}
function combatPlayerPortraitSource(combatant){
 if(combatant?.source_type!=='character'||typeof chars==='undefined')return null;
 const source=(chars||[]).find(c=>String(c?._dbId||c?.id||'')===String(combatant.source_id||''));
 if(!source)return null;
 let portrait='';
 try{portrait=typeof getPortraitSrc==='function'?getPortraitSrc(source):(source.portrait||'')}catch(_error){portrait=source.portrait||''}
 return portrait?{source,url:String(portrait)}:null
}
function combatPortraitHexPoints(size){
 return combatHexPoints(0,0,size)
}
function combatPlayerMiniatureSvg(combatant,cell,g,stateClasses=''){
 if(combatant?.source_type!=='character')return '';
 const portrait=combatPlayerPortraitSource(combatant);
 const scale=Math.max(.55,g.size/42);
 if(!portrait){
  const kind=combatPlayerMiniatureKind(combatant);if(!kind)return '';
  const figure=kind==='warrior'?combatMiniatureWarrior():kind==='wizard'?combatMiniatureWizard():combatMiniatureDuck();
  return '<g class="combat-miniature '+kind+stateClasses+'" transform="translate('+cell.x+' '+cell.y+') scale('+scale.toFixed(3)+')">'+
   '<ellipse class="combat-mini-shadow" cx="0" cy="9" rx="23" ry="8"/>'+
   '<ellipse class="combat-mini-base" cx="0" cy="7" rx="21" ry="7"/>'+
   '<ellipse class="combat-mini-base-ring" cx="0" cy="7" rx="21" ry="7"/>'+
   figure+
   '<rect class="combat-mini-hit" x="-31" y="-64" width="62" height="78" rx="8"/>'+
  '</g>'
 }
 const safeId=String(combatant.id||combatant.source_id||'player').replace(/[^a-zA-Z0-9_-]/g,'_');
 const clipId='combatPortraitClip_'+safeId;
 const outer=combatPortraitHexPoints(34),inner=combatPortraitHexPoints(28.7);
 const depthOffset=2.5;
 return '<g class="combat-miniature combat-portrait-hex'+stateClasses+'" transform="translate('+cell.x+' '+cell.y+') scale('+scale.toFixed(3)+')">'+
  '<defs><clipPath id="'+clipId+'"><polygon points="'+inner+'"/></clipPath></defs>'+
  '<g class="combat-portrait-visual" transform="translate(0 -'+depthOffset+')">'+
   '<polygon class="combat-portrait-depth" points="'+outer+'" transform="translate(0 5)"/>'+
   '<polygon class="combat-portrait-frame-back" points="'+outer+'"/>'+
   '<polygon class="combat-portrait-green-ring" points="'+outer+'"/>'+
   '<polygon class="combat-portrait-inner-frame" points="'+combatPortraitHexPoints(30.7)+'"/>'+
   '<image class="combat-portrait-image" href="'+escAttr(portrait.url)+'" x="-31" y="-31" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clipId+')"/>'+
   '<polygon class="combat-portrait-image-edge" points="'+inner+'"/>'+
   '<polyline class="combat-portrait-bevel-light" points="-29.4,-17 0,-34 29.4,-17"/>'+
   '<polyline class="combat-portrait-bevel-dark" points="29.4,17 0,34 -29.4,17"/>'+
  '</g>'+
  '<rect class="combat-mini-hit" x="-35" y="-39" width="70" height="80" rx="8"/>'+
 '</g>'
}
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
 if(Date.now()<combatMapSuppressClickUntil)return false;
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
 if(Date.now()<combatMovementSuppressClickUntil||Date.now()<combatMapSuppressClickUntil){event?.stopPropagation?.();return}
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
 const stored=combatant?.state?.attack_profile&&typeof combatant.state.attack_profile==='object'?combatant.state.attack_profile:{};
 let src=null;
 if(combatant?.source_type==='character'&&typeof chars!=='undefined')src=(chars||[]).find(c=>String(c._dbId||c.id)===String(combatant.source_id));
 else if(combatant?.source_type==='npc'&&typeof campaignNpcs!=='undefined')src=(campaignNpcs||[]).find(c=>String(c.id)===String(combatant.source_id));
 else if(combatant?.source_type==='monster'&&typeof campaignMonsters!=='undefined')src=(campaignMonsters||[]).find(c=>String(c.id)===String(combatant.source_id));
 if(!src)return{
  weapons:Array.isArray(stored.weapons)?stored.weapons:[],
  currentEquipment:stored.currentEquipment||null,
  shields:Array.isArray(stored.shields)?stored.shields:[],
  armor:Array.isArray(stored.armor)?stored.armor:[],projectiles:Array.isArray(stored.projectiles)?stored.projectiles:[],
  damage_bonus:stored.damage_bonus??null,
  sty:combatNumber(stored.sty,combatNumber(combatant?.state?.sty,10)),
  sto:combatNumber(stored.sto,combatNumber(combatant?.state?.sto,10)),
  smi:combatNumber(stored.smi,combatNumber(combatant?.state?.smi,10))
 };
 const data=src.data&&typeof src.data==='object'?src.data:src;
 const base=data.base&&typeof data.base==='object'?data.base:{};
 const derived=data.derived&&typeof data.derived==='object'?data.derived:{};
 const attrs=src.attributes&&typeof src.attributes==='object'?src.attributes:{};
 const sty=combatNumber(base.Styrka?.v??base.STY,combatNumber(attrs.STY,combatNumber(stored.sty,combatNumber(combatant?.state?.sty,10))));
 const sto=combatNumber(base.Storlek?.v??base.STO,combatNumber(attrs.STO,combatNumber(stored.sto,combatNumber(combatant?.state?.sto,10))));
 const smi=combatNumber(base.Smidighet?.v??base.SMI,combatNumber(attrs.SMI,combatNumber(stored.smi,combatNumber(combatant?.state?.smi,10))));
 const shields=Array.isArray(data.shields)?data.shields:
  Array.isArray(src.shield)?src.shield:(src.shield&&typeof src.shield==='object'?[src.shield]:(Array.isArray(stored.shields)?stored.shields:[]));
 const armor=Array.isArray(data.armor)?data.armor:
  Array.isArray(src.armor)?src.armor:(src.armor&&typeof src.armor==='object'?[src.armor]:(Array.isArray(stored.armor)?stored.armor:[]));
 return{
  ...stored,
  weapons:Array.isArray(data.weapons)?data.weapons:(Array.isArray(src.weapons)?src.weapons:(Array.isArray(stored.weapons)?stored.weapons:[])),
  currentEquipment:data.currentEquipment||stored.currentEquipment||null,
  shields,armor,projectiles:Array.isArray(data.projectiles)?data.projectiles:(Array.isArray(stored.projectiles)?stored.projectiles:[]),
  damage_bonus:derived.Skadebonus??derived.skadebonus??stored.damage_bonus??null,
  sty,sto,smi
 }
}
function combatWeaponCategory(weapon){
 if(weapon?._unarmed)return 'melee';
 return String(weapon?.weaponCategory||weapon?.category||'melee').toLowerCase()
}
function combatAvailableWeapons(combatant,mode='auto'){
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
 if(mode==='auto')return available;
 if(mode==='melee')return available.filter(weapon=>combatWeaponCategory(weapon)==='melee');
 return available.filter(weapon=>['projectile','thrown'].includes(combatWeaponCategory(weapon)))
}
function combatWeaponKey(weapon){
 return String(weapon?.equipId||weapon?.weapon_id||weapon?.weaponTypeId||weapon?.id||weapon?.name||'')
}
function combatAttackWeaponOptions(combatant,mode='auto'){
 const weapons=combatAvailableWeapons(combatant,mode),seen=new Set();
 return weapons.filter(weapon=>{
  const key=combatWeaponKey(weapon);
  if(!key||seen.has(key))return false;
  seen.add(key);return true
 })
}
function combatParryOptions(combatant){
 const profile=combatAttackProfile(combatant),out=[],seen=new Set();
 const add=(option)=>{
  if(!option||combatNumber(option.fv,null)==null||combatNumber(option.fv,0)<=0)return;
  const key=String(option.key||'');if(!key||seen.has(key))return;
  seen.add(key);out.push(option)
 };
 const shields=Array.isArray(profile.shields)?profile.shields:[];
 let shieldIds=null;
 if(combatant?.source_type==='character'&&profile.currentEquipment){
  shieldIds=new Set([profile.currentEquipment.leftHand,profile.currentEquipment.rightHand]
   .filter(ref=>ref?.kind==='shield'&&ref.itemId).map(ref=>String(ref.itemId)))
 }
 shields.forEach(shield=>{
  if(shieldIds&&(!shield.equipId||!shieldIds.has(String(shield.equipId))))return;
  add({
   kind:'shield',
   key:'shield:'+(shield.equipId||shield.id||shield.name||'shield'),
   name:shield.name||'Sköld',
   fv:combatNumber(shield.fv,null),
   abs:combatNumber(shield.abs??shield.protection,0),
   item:shield
  })
 });
 combatAvailableWeapons(combatant,'melee').forEach(weapon=>add({
  kind:'weapon',
  key:'weapon:'+combatWeaponKey(weapon),
  name:weapon.name||'Vapen',
  fv:combatAttackFv(weapon,combatant),
  abs:0,
  item:weapon
 }));
 return out
}
function combatParryOption(combatant,key){
 const options=combatParryOptions(combatant);
 if(!key)return options.length===1?options[0]:null;
 return options.find(option=>option.key===String(key))||null
}
function combatCanParryAttack(defender){
 return !!defender&&combatHasUnusedAction(defender)&&combatParryOptions(defender).length>0
}
async function combatExpertRoll(label,fv){
 const first=await combatRollDice([{qty:1,sides:20}],label);
 const roll=Number(first?.rolls?.[0]?.value);
 if(!Number.isInteger(roll))throw new Error('Slaget gav inget giltigt T20-resultat.');
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
 return{
  roll,confirmation_roll:confirmationRoll,outcome,
  success:['success','special','perfect'].includes(outcome)
 }
}
function combatParseDamageFormula(formula,fallback=''){
 const raw=String(formula||fallback||'').trim().toUpperCase().replace(/\s+/g,'');
 if(!raw)return null;
 if(/^[+-]?\d+$/.test(raw))return{qty:0,sides:0,modifier:Number(raw),formula:raw};
 const match=raw.match(/^(\d+)T(\d+)([+-]\d+)?$/);
 if(!match)return null;
 return{
  qty:Math.max(0,Number(match[1])||0),
  sides:Math.max(0,Number(match[2])||0),
  modifier:Number(match[3]||0),
  formula:raw
 }
}
function combatDamageBonusSpec(combatant){
 const profile=combatAttackProfile(combatant),raw=profile.damage_bonus;
 if(raw&&typeof raw==='object'){
  const qty=combatNumber(raw.dice??raw.qty,0),sides=combatNumber(raw.sides,0),modifier=combatNumber(raw.modifier,0);
  if(qty>0&&sides>0)return{qty,sides,modifier,formula:qty+'T'+sides+(modifier?(modifier>0?'+':'')+modifier:'')};
  if(modifier)return{qty:0,sides:0,modifier,formula:String(modifier)}
 }
 if(typeof raw==='string'){
  const parsed=combatParseDamageFormula(raw);
  if(parsed)return parsed
 }
 const sty=combatNumber(profile.sty,null),sto=combatNumber(profile.sto,null);
 if(sty==null||sto==null)return{qty:0,sides:0,modifier:0,formula:'Ingen'};
 const avg=Math.ceil((sty+sto)/2);
 if(avg<=16)return{qty:0,sides:0,modifier:0,formula:'Ingen'};
 if(avg<=20)return{qty:1,sides:4,modifier:0,formula:'1T4'};
 if(avg<=25)return{qty:1,sides:6,modifier:0,formula:'1T6'};
 if(avg<=30)return{qty:1,sides:10,modifier:0,formula:'1T10'};
 const qty=avg<=40?2:avg<=50?3:avg<=70?4:avg<=90?5:5+Math.ceil((avg-90)/20);
 return{qty,sides:6,modifier:0,formula:qty+'T6'}
}
function combatArmorAbsorption(combatant){
 const profile=combatAttackProfile(combatant),all=Array.isArray(profile.armor)?profile.armor:[];
 let items=all;
 if(combatant?.source_type==='character'&&profile.currentEquipment){
  const refs=['head','torso','arms','legs'].map(slot=>profile.currentEquipment?.[slot])
   .filter(ref=>ref?.kind==='armor'&&ref.itemId);
  const ids=new Set(refs.map(ref=>String(ref.itemId)));
  items=ids.size?all.filter(item=>item?.equipId&&ids.has(String(item.equipId))):[]
 }
 let absorption=0,names=[];
 items.forEach(item=>{
  const value=Math.max(0,combatNumber(item?.absorption??item?.protection??item?.abs,0));
  if(value>absorption)absorption=value;
  if(item?.name)names.push(item.name)
 });
 return{absorption,names:[...new Set(names)]}
}
async function combatResolveDamage(actor,target,weapon,fullDamage=false,hitLocation=null){
 const weaponSpec=combatParseDamageFormula(weapon?.damage,weapon?._unarmed?'1T3':'');
 if(!weaponSpec)throw new Error((weapon?.name||'Vapnet')+' saknar giltig skadetärning.');
 const bonusSpec=combatDamageBonusSpec(actor);
 let weaponValue=Number(weaponSpec.modifier)||0,bonusValue=Number(bonusSpec.modifier)||0;
 if(fullDamage){
  weaponValue+=weaponSpec.qty*weaponSpec.sides;
  bonusValue+=bonusSpec.qty*bonusSpec.sides
 }else{
  const specs=[];
  if(weaponSpec.qty>0&&weaponSpec.sides>0)specs.push({kind:'weapon',qty:weaponSpec.qty,sides:weaponSpec.sides});
  if(bonusSpec.qty>0&&bonusSpec.sides>0)specs.push({kind:'bonus',qty:bonusSpec.qty,sides:bonusSpec.sides});
  if(specs.length){
   const rolled=await combatRollDice(specs.map(({qty,sides})=>({qty,sides})),'Skada · '+actor.name_snapshot+' → '+target.name_snapshot);
   let rollIndex=0;
   for(const spec of specs){
    let subtotal=0;
    for(let i=0;i<spec.qty;i++)subtotal+=Number(rolled?.rolls?.[rollIndex++]?.value)||0;
    if(spec.kind==='weapon')weaponValue+=subtotal;
    else bonusValue+=subtotal
   }
  }
 }
 weaponValue=Math.max(0,Math.floor(weaponValue));
 bonusValue=Math.floor(bonusValue);
 const gross=Math.max(0,weaponValue+bonusValue);
 const armor=combatArmorAbsorption(target),net=Math.max(0,gross-armor.absorption);
 const before=Math.max(0,combatNumber(target.current_kp,0)),after=Math.max(0,before-net),defeated=after<=0;
 const patch={current_kp:after,updated_at:new Date().toISOString()};
 if(defeated)patch.status='dead';
 await dbJson('combatants?id=eq.'+encodeURIComponent(target.id),{
  method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(patch)
 });
 target.current_kp=after;if(defeated)target.status='dead';
 const result={
  weapon_formula:weaponSpec.formula,
  weapon_damage_value:weaponValue,
  damage_bonus:bonusSpec.formula||'Ingen',
  damage_bonus_value:bonusValue,
  gross_damage:gross,
  armor_absorption:armor.absorption,
  armor_names:armor.names,
  net_damage:net,
  kp_before:before,kp_after:after,
  full_damage:fullDamage===true,
  hit_location:hitLocation||null,
  defeated
 };
 await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
  combat_id:activeCombat.id,campaign_id:centralCampaignId,round_number:Number(activeCombat.round_number)||1,
  phase:'damage',actor_id:actor.id,target_id:target.id,event_type:defeated?'defeated':'damage',
  message:actor.name_snapshot+' träffar '+(hitLocation?.label||'målet')+' och gör '+net+' KP skada på '+target.name_snapshot+
   ' ('+weaponValue+' + '+bonusValue+' − ABS '+armor.absorption+' = '+net+') · KP '+before+' → '+after+(defeated?' · NEDKÄMPAD':''),
  details:result,player_visible:true
 })});
 return result
}
function combatDamageResultHtml(damage){
 if(!damage)return '';
 const weaponFormula=String(damage.weapon_formula||'—');
 const bonusRaw=String(damage.damage_bonus||'').trim();
 const bonusFormula=!bonusRaw||bonusRaw.toLowerCase()==='ingen'?'—':bonusRaw;
 let weaponValue=Number(damage.weapon_damage_value),bonusValue=Number(damage.damage_bonus_value);
 if(!Number.isFinite(weaponValue)||!Number.isFinite(bonusValue)){
  if(damage.full_damage===true){
   const weaponSpec=combatParseDamageFormula(weaponFormula),bonusSpec=combatParseDamageFormula(bonusRaw);
   weaponValue=weaponSpec?Math.max(0,weaponSpec.qty*weaponSpec.sides+weaponSpec.modifier):Number(damage.gross_damage)||0;
   bonusValue=bonusSpec?bonusSpec.qty*bonusSpec.sides+bonusSpec.modifier:0
  }else{
   weaponValue=Number(damage.gross_damage)||0;
   bonusValue=0
  }
 }
 const armor=Math.max(0,Number(damage.armor_absorption)||0),net=Math.max(0,Number(damage.net_damage)||0);
 const armorText=Array.isArray(damage.armor_names)&&damage.armor_names.length?damage.armor_names.join(', '):'ABS';
 return '<div class="combat-damage-result'+(damage.defeated?' defeated':'')+'">'+
  '<div class="combat-damage-grid">'+
   '<div class="combat-damage-col"><span>Skada</span><b>'+weaponValue+'</b><small>'+escAttr(weaponFormula)+'</small></div>'+
   '<i class="combat-damage-op">+</i>'+
   '<div class="combat-damage-col"><span>SB</span><b>'+bonusValue+'</b><small>'+escAttr(bonusFormula)+'</small></div>'+
   '<i class="combat-damage-op">−</i>'+
   '<div class="combat-damage-col"><span>Rustning</span><b>'+armor+'</b><small>'+escAttr(armorText)+'</small></div>'+
   '<i class="combat-damage-op">=</i>'+
   '<div class="combat-damage-col total"><span>Totalt</span><b>'+net+'</b><small>KP skada</small></div>'+
  '</div>'+
  '<div class="combat-damage-kp"><span>KP</span><b>'+damage.kp_before+' − '+net+' = '+damage.kp_after+(damage.defeated?' · NEDKÄMPAD':'')+'</b></div>'+
 '</div>'
}
function combatParryResultHtml(result){
 const parry=result?.parry;if(!parry)return '';
 const meta=combatOutcomeMeta(parry.outcome);
 return '<div class="combat-parry-result '+(parry.success?'success':'fail')+'">'+
  '<span>Parering · '+escAttr(parry.item_name||'Försvar')+'</span>'+
  '<b><i class="combat-result-icon" aria-hidden="true">'+meta.icon+'</i>'+escAttr(meta.label)+'</b>'+
  '<small>T20 '+parry.roll+(parry.confirmation_roll!=null?' / kontroll '+parry.confirmation_roll:'')+' mot FV '+parry.fv+'</small>'+
 '</div>'
}

function combatActionWeapon(combatant,action,mode='auto'){
 const selectedKey=String(action?.source_data?.weapon_key||action?.result?.weapon_key||'');
 if(selectedKey==='unarmed')return {name:'Obeväpnad',_unarmed:true};
 if(selectedKey){
  const selected=combatAttackWeaponOptions(combatant,'auto').find(weapon=>combatWeaponKey(weapon)===selectedKey);
  if(selected)return selected
 }
 const options=combatAttackWeaponOptions(combatant,mode);
 if(!options.length)return mode==='ranged'?null:{name:'Obeväpnad',_unarmed:true};
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
function combatAttackModeForTarget(actor,target,weapon,preferredMode='auto'){
 if(!actor||!target||!weapon)return null;
 if(preferredMode==='melee'||preferredMode==='ranged')return preferredMode;
 const category=combatWeaponCategory(weapon),distance=combatAxialDistance(actor,target);
 if(category==='thrown')return distance===1?'melee':'ranged';
 if(category==='projectile')return 'ranged';
 return 'melee'
}
function combatAttackRangeHexes(combatant,mode,weapon=null){
 if(mode==='melee')return combatMeleeRangeHexes(combatant,weapon);
 if(mode==='ranged'){
  if(weapon)return combatWeaponRangeHexes(weapon,combatant);
  const weapons=combatAttackWeaponOptions(combatant,'ranged');
  return weapons.length===1?combatWeaponRangeHexes(weapons[0],combatant):0
 }
 if(weapon){
  const category=combatWeaponCategory(weapon);
  if(category==='melee'||weapon?._unarmed)return combatMeleeRangeHexes(combatant,weapon);
  return combatWeaponRangeHexes(weapon,combatant)
 }
 return 0
}
function combatAttackTargetInfo(actor,target,weapon,preferredMode='auto'){
 if(!actor||!target||!weapon)return null;
 if(String(target.id)===String(actor.id)||target.visible_to_players===false)return null;
 if(target.side===actor.side||['dead','removed'].includes(target.status))return null;
 const distance=combatAxialDistance(actor,target);
 if(distance<1||!combatHasLineOfSight(actor,target))return null;
 const mode=combatAttackModeForTarget(actor,target,weapon,preferredMode);
 if(!mode)return null;
 let maxRange;
 if(mode==='melee'){
  maxRange=preferredMode==='auto'&&combatWeaponCategory(weapon)==='thrown'?1:combatMeleeRangeHexes(actor,weapon)
 }else{
  maxRange=combatWeaponRangeHexes(weapon,actor)
 }
 if(maxRange<=0||distance>maxRange)return null;
 return{distance,maxRange,mode}
}
function combatPossibleAttackTargets(actor,mode='auto',weapon=null){
 const out=new Map();
 if(!actor||!weapon)return out;
 for(const target of combatants){
  const info=combatAttackTargetInfo(actor,target,weapon,mode);
  if(info)out.set(String(target.id),info)
 }
 return out
}
function combatFireballTargets(){
 const actor=combatActiveActor(),action=combatChosenAction(actor);
 if(!actor||action?.status!=='planned'||action?.source_data?.casting_spell!==true||!String(action?.source_data?.spell_name||'').toUpperCase().startsWith('ELD'))return new Map();
 const out=new Map(),range=Math.max(1,combatWeaponRangeHexes({range:action.source_data.range_text||'30 m'},actor)||20);
 for(const target of combatants){
  if(String(target.id)===String(actor.id)||target.visible_to_players===false||target.side===actor.side||['dead','removed'].includes(target.status))continue;
  const distance=combatAxialDistance(actor,target);
  if(distance>=1&&distance<=range&&combatHasLineOfSight(actor,target))out.set(String(target.id),{distance,maxRange:range,mode:'ranged'})
 }
 return out
}
async function combatTestFireballButton(event,combatantId){
 event?.stopPropagation?.();
 const actor=combatants.find(row=>String(row.id)===String(combatantId));if(!actor||!combatCanUseActionMenu(actor))return;
 const action=combatChosenAction(actor);
 if(action?.source_data?.test_fireball===true&&action.status==='planned'){
  const targetId=String(combatSelectedTargetId||''),targets=combatFireballTargets();
  if(targetId&&targets.has(targetId)){await rollCombatTestFireball(actor.id,targetId);return}
  await combatCancelPlannedAttack(actor,action);return
 }
 await chooseCombatPrimaryAction(actor.id,'spell_cast');
 const fresh=combatChosenAction(actor)||combatActions.find(row=>String(row.combatant_id)===String(actor.id)&&row.slot_key==='primary');
 if(!fresh)return;
 const spell=(actor.attack_profile?.spells||[]).find(row=>String(row.name||'').toUpperCase().includes('ELD'));
 const sourceData={...(fresh.source_data||{}),test_fireball:true,spell_name:spellName,school_value:2,spell_fv:10,effect_grade:2,damage_text:'2T6',range_text:spell?.range_text||'30 m',attack_magic:true};
 await dbJson('combat_actions?id=eq.'+encodeURIComponent(fresh.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({source_data:sourceData,target_combatant_id:null,status:'planned',updated_at:new Date().toISOString()})});
 fresh.source_data=sourceData;combatSelectedTargetId=null;renderCombat()
}
async function combatResolveTestFireball(actor,target,action){
 const spellName=action.source_data?.spell_name||'Eld',fv=Math.max(1,Number(action.source_data?.spell_fv)||10),rolled=await combatExpertRoll(spellName+' · '+actor.name_snapshot+' → '+target.name_snapshot,fv);
 const outcome=rolled.outcome,success=rolled.success,fullDamage=outcome==='special'||outcome==='perfect';
 const result={success,outcome,roll:rolled.roll,confirmation_roll:rolled.confirmation_roll,fv,spell_name:'Eldklot',attack_mode:'ranged',full_damage:fullDamage,damage_mode:fullDamage?'full':'roll',rule_engine:'expert_skill',hit_resolved:!success};
 combatShowOutcomeOverlay(outcome,spellName+' · T20 '+rolled.roll+' mot FV '+fv);
 if(success){
  const pseudoWeapon={name:spellName,damage:action.source_data?.damage_text||'1T6'};
  result.damage=await combatResolveDamage(actor,target,pseudoWeapon,fullDamage,null);
  result.hit_resolved=true
 }
 await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({target_combatant_id:target.id,status:'resolved',result,updated_at:new Date().toISOString()})});
 await dbJson('combat_log',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({combat_id:activeCombat.id,campaign_id:centralCampaignId,round_number:Number(activeCombat.round_number)||1,phase:'magic',actor_id:actor.id,target_id:target.id,event_type:'spell_attack',message:actor.name_snapshot+' slungar '+spellName+' mot '+target.name_snapshot+' · T20 '+rolled.roll+' mot FV '+fv+' · '+combatOutcomeLabel(outcome),details:result,player_visible:true})})
}
async function rollCombatTestFireball(actorId,targetId){
 if(combatDiceBusy||!combatCanManage())return;
 const actor=combatants.find(row=>String(row.id)===String(actorId)),target=combatants.find(row=>String(row.id)===String(targetId)),action=combatChosenAction(actor);
 if(!actor||!target||action?.source_data?.casting_spell!==true||action.status!=='planned'||!combatFireballTargets().has(String(target.id)))return;
 try{await combatResolveTestFireball(actor,target,action);await loadActiveCombat(null,{preserveSelectedTarget:true})}catch(error){console.error('Eldklot misslyckades',error);alert('Eldklot kunde inte genomföras: '+(error?.message||error))}
}
function combatCurrentAttackTargets(){
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(action?.source_data?.casting_spell===true&&String(action?.source_data?.spell_name||'').toUpperCase().startsWith('ELD'))return combatFireballTargets();
 if(!actor||def?.type!=='attack'||action?.status!=='planned')return new Map();
 const mode=def.mode||action?.source_data?.mode||'auto';
 const selected=combatActionWeapon(actor,action,mode);
 const weapons=selected?[selected]:combatAttackWeaponOptions(actor,mode);
 const out=new Map();
 weapons.forEach(weapon=>{
  const targets=combatPossibleAttackTargets(actor,mode,weapon);
  targets.forEach((info,id)=>{
   const current=out.get(id),entry={
    ...info,
    weapon_keys:[...(current?.weapon_keys||[]),combatWeaponKey(weapon)],
    weapon_names:[...(current?.weapon_names||[]),weapon.name||'Vapen']
   };
   if(!current||info.maxRange>current.maxRange)out.set(id,entry);
   else out.set(id,{...current,weapon_keys:entry.weapon_keys,weapon_names:entry.weapon_names})
  })
 });
 return out
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
 await window.combatUndoBeforeActorAction?.();
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
const COMBAT_MAP_MIN_ZOOM=1,COMBAT_MAP_MAX_ZOOM=8;
function combatMapViewGeometry(){
 return combatRuntimeGeometry()
}
function combatMapEnsureView(g){
 if(!g)return;
 const key=String(activeCombat?.id||'')+'|'+String(combatActiveSceneId()||'')+'|'+g.width+'x'+g.height;
 if(combatMapViewKey!==key){
  combatMapViewKey=key;
  combatMapView={zoom:1,x:0,y:0};
  combatMapPan=null;combatMapPointers.clear();combatMapPinch=null
 }
 const zoom=Math.max(1,Math.min(COMBAT_MAP_MAX_ZOOM,Number(combatMapView.zoom)||1));
 const width=g.width/zoom,height=g.height/zoom;
 combatMapView.zoom=zoom;
 combatMapView.x=Math.max(0,Math.min(g.width-width,Number(combatMapView.x)||0));
 combatMapView.y=Math.max(0,Math.min(g.height-height,Number(combatMapView.y)||0))
}
function combatMapViewBox(g=combatMapViewGeometry()){
 if(!g)return{x:0,y:0,width:1,height:1};
 combatMapEnsureView(g);
 return{x:combatMapView.x,y:combatMapView.y,width:g.width/combatMapView.zoom,height:g.height/combatMapView.zoom}
}
function combatMapApplyView(){
 const svg=document.querySelector('#combatPage .combat-map-svg'),g=combatMapViewGeometry();
 if(!svg||!g)return;
 const view=combatMapViewBox(g);
 svg.setAttribute('viewBox',view.x+' '+view.y+' '+view.width+' '+view.height);
 const label=$('combatMapZoomLabel');if(label)label.textContent=Math.round(combatMapView.zoom*100)+'%';
 svg.classList.toggle('zoomed',combatMapView.zoom>1.001)
}
function combatMapZoomAt(clientX,clientY,nextZoom){
 const svg=document.querySelector('#combatPage .combat-map-svg'),g=combatMapViewGeometry();
 if(!svg||!g)return;
 combatMapEnsureView(g);
 const old=combatMapViewBox(g),rect=svg.getBoundingClientRect();
 if(rect.width<=0||rect.height<=0)return;
 const px=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
 const py=Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));
 const anchorX=old.x+px*old.width,anchorY=old.y+py*old.height;
 const zoom=Math.max(1,Math.min(COMBAT_MAP_MAX_ZOOM,Number(nextZoom)||1));
 const width=g.width/zoom,height=g.height/zoom;
 combatMapView.zoom=zoom;
 combatMapView.x=anchorX-px*width;
 combatMapView.y=anchorY-py*height;
 combatMapEnsureView(g);
 combatMapApplyView()
}
function combatMapZoomStep(direction){
 const svg=document.querySelector('#combatPage .combat-map-svg');if(!svg)return;
 const rect=svg.getBoundingClientRect();
 const factor=direction>0?1.25:0.8;
 combatMapZoomAt(rect.left+rect.width/2,rect.top+rect.height/2,combatMapView.zoom*factor)
}
function combatMapResetView(){
 combatMapView={zoom:1,x:0,y:0};combatMapPan=null;combatMapPointers.clear();combatMapPinch=null;
 combatMapApplyView()
}
function combatMapCombatantCenters(g=combatMapViewGeometry()){
 if(!g)return[];
 return (combatants||[]).filter(c=>c&&c.status!=='removed').map(c=>{
  const isPlanning=combatIsMovementPlanning(c);
  const q=isPlanning&&combatMovementPlan?Number(combatMovementPlan.q):Number(c.q);
  const r=isPlanning&&combatMovementPlan?Number(combatMovementPlan.r):Number(c.r);
  if(!Number.isFinite(q)||!Number.isFinite(r))return null;
  return{
   x:g.xPitch*(q+r/2)+g.offsetX,
   y:g.rowPitch*r+g.offsetY
  }
 }).filter(Boolean)
}
function combatMapFitCombatants(){
 const svg=document.querySelector('#combatPage .combat-map-svg'),g=combatMapViewGeometry();
 if(!svg||!g)return;
 const points=combatMapCombatantCenters(g);
 if(!points.length){combatMapResetView();return}
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const marginX=g.xPitch,marginY=g.rowPitch;
 const minX=Math.min(...xs)-marginX,maxX=Math.max(...xs)+marginX;
 const minY=Math.min(...ys)-marginY,maxY=Math.max(...ys)+marginY;
 const boundsWidth=Math.max(g.xPitch*2,maxX-minX);
 const boundsHeight=Math.max(g.rowPitch*2,maxY-minY);
 const zoomX=g.width/boundsWidth,zoomY=g.height/boundsHeight;
 const zoom=Math.max(COMBAT_MAP_MIN_ZOOM,Math.min(COMBAT_MAP_MAX_ZOOM,zoomX,zoomY));
 const viewWidth=g.width/zoom,viewHeight=g.height/zoom;
 const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
 combatMapView.zoom=zoom;
 combatMapView.x=centerX-viewWidth/2;
 combatMapView.y=centerY-viewHeight/2;
 combatMapPan=null;combatMapPointers.clear();combatMapPinch=null;
 combatMapEnsureView(g);
 combatMapApplyView()
}

function combatMapWheel(event){
 event.preventDefault();
 const factor=Math.exp(-event.deltaY*.0014);
 combatMapZoomAt(event.clientX,event.clientY,combatMapView.zoom*factor)
}
function combatMapTouchGate(event){
 if((event.touches?.length||0)>=2&&event.cancelable)event.preventDefault()
}
function combatMapPointerDown(event){
 if(event.button!=null&&event.button!==0&&event.pointerType!=='touch')return;
 if(combatMovementDrag)return;
 if(event.target?.closest?.('.combat-token-group'))return;
 combatMapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pointerType:event.pointerType||'mouse'});
 const svg=event.currentTarget;
 if(event.pointerType==='touch'){
  combatMapPan=null;
  if(combatMapPointers.size<2)return;
  if(combatMapPointers.size===2){
   for(const pointerId of combatMapPointers.keys()){
    try{svg.setPointerCapture?.(pointerId)}catch(_error){}
   }
   const pts=[...combatMapPointers.values()];
   const dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y;
   const centerX=(pts[0].x+pts[1].x)/2,centerY=(pts[0].y+pts[1].y)/2;
   combatMapPinch={distance:Math.max(1,Math.hypot(dx,dy)),zoom:combatMapView.zoom,centerX,centerY,lastCenterX:centerX,lastCenterY:centerY};
   if(event.cancelable)event.preventDefault()
  }
  return
 }
 try{svg.setPointerCapture?.(event.pointerId)}catch(_error){}
 combatMapPan={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false}
}
function combatMapPointerMove(event){
 if(combatMovementDrag){combatMovementDragMove(event);return}
 const tracked=combatMapPointers.get(event.pointerId);
 if(!tracked)return;
 combatMapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pointerType:tracked.pointerType||event.pointerType||'mouse'});
 const svg=event.currentTarget,g=combatMapViewGeometry();if(!g)return;
 if(combatMapPointers.size>=2){
  event.preventDefault();
  const pts=[...combatMapPointers.values()].slice(0,2);
  const dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y,distance=Math.max(1,Math.hypot(dx,dy));
  const centerX=(pts[0].x+pts[1].x)/2,centerY=(pts[0].y+pts[1].y)/2;
  if(!combatMapPinch)combatMapPinch={distance,zoom:combatMapView.zoom,centerX,centerY,lastCenterX:centerX,lastCenterY:centerY};
  const rect=svg.getBoundingClientRect(),view=combatMapViewBox(g);
  if(rect.width>0&&rect.height>0){
   const panDx=centerX-(combatMapPinch.lastCenterX??centerX),panDy=centerY-(combatMapPinch.lastCenterY??centerY);
   combatMapView.x-=panDx*(view.width/rect.width);
   combatMapView.y-=panDy*(view.height/rect.height);
   combatMapEnsureView(g)
  }
  combatMapPinch.lastCenterX=centerX;combatMapPinch.lastCenterY=centerY;
  combatMapZoomAt(centerX,centerY,combatMapPinch.zoom*(distance/combatMapPinch.distance));
  combatMapSuppressClickUntil=Date.now()+450;
  return
 }
 if((tracked.pointerType||event.pointerType)==='touch')return;
 const pan=combatMapPan;
 if(!pan||pan.pointerId!==event.pointerId)return;
 const dx=event.clientX-pan.lastX,dy=event.clientY-pan.lastY;
 if(Math.abs(event.clientX-pan.startX)+Math.abs(event.clientY-pan.startY)>5)pan.moved=true;
 pan.lastX=event.clientX;pan.lastY=event.clientY;
 if(!pan.moved)return;
 event.preventDefault();
 const rect=svg.getBoundingClientRect(),view=combatMapViewBox(g);
 if(rect.width<=0||rect.height<=0)return;
 combatMapView.x-=dx*(view.width/rect.width);
 combatMapView.y-=dy*(view.height/rect.height);
 combatMapEnsureView(g);
 combatMapApplyView();
 combatMapSuppressClickUntil=Date.now()+350
}
function combatMapPointerEnd(event){
 if(combatMovementDrag){combatMovementDragEnd(event);return}
 const svg=event.currentTarget;
 combatMapPointers.delete(event.pointerId);
 try{svg.releasePointerCapture?.(event.pointerId)}catch(_error){}
 if(combatMapPan?.pointerId===event.pointerId){
  if(combatMapPan.moved)combatMapSuppressClickUntil=Date.now()+350;
  combatMapPan=null
 }
 if(combatMapPointers.size<2)combatMapPinch=null;
 if(combatMapPointers.size===1){
  const [id,pt]=[...combatMapPointers.entries()][0];
  combatMapPan=pt.pointerType==='touch'
   ?null
   :{pointerId:id,startX:pt.x,startY:pt.y,lastX:pt.x,lastY:pt.y,moved:false}
 }
}
function renderCombatMap(){
 const g=combatRuntimeGeometry();
 if(!g){
  const note=combatRuntimeMapError
   ?'Kunde inte ladda kartbilden: '+escAttr(combatRuntimeMapError)
   :'Stridsscenen saknar en tillgänglig kartbild.';
  return '<div class="combat-map-missing">'+note+'</div>'
 }
 combatMapEnsureView(g);
 const mapView=combatMapViewBox(g);
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
 const tokenRows=combatants.filter(c=>c.status!=='removed').map(c=>{
  const isPlanning=combatIsMovementPlanning(c);
  const displayQ=isPlanning&&combatMovementPlan?Number(combatMovementPlan.q):Number(c.q)||0;
  const displayR=isPlanning&&combatMovementPlan?Number(combatMovementPlan.r):Number(c.r)||0;
  const key=displayQ+','+displayR;
  let cell=byCoord.get(key);
  if(!cell)cell={x:g.xPitch*(displayQ+displayR/2)+g.offsetX,y:g.rowPitch*displayR+g.offsetY};
  return{c,isPlanning,cell}
 }).sort((a,b)=>a.cell.y-b.cell.y);
 const tokens=tokenRows.map(({c,isPlanning,cell})=>{
  const side=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'',turn=combatIsActiveTurn(c)?' active-turn':'';
  const attack=attackTargets.get(String(c.id)),targetClass=attack?' attack-target':'',planningClass=isPlanning?' movement-planning':'',defeated=c.status==='dead';
  const targetTitle=attack?' · möjligt mål · '+attack.distance+' hex':'';
  let visual='';
  if(defeated){
   visual='<circle class="combat-token defeated'+selected+'" cx="'+cell.x+'" cy="'+cell.y+'" r="'+(g.size*.48)+'"></circle>'+
    '<text class="combat-token-skull" x="'+cell.x+'" y="'+cell.y+'">☠</text>'
  }else{
   const miniature=combatPlayerMiniatureSvg(c,cell,g,selected+turn+targetClass+planningClass);
   visual=miniature||('<circle class="combat-token '+side+selected+turn+targetClass+planningClass+'" cx="'+cell.x+'" cy="'+cell.y+'" r="'+(g.size*.48)+'"><title>'+escAttr(c.name_snapshot)+targetTitle+(isPlanning?' · dra för att planera förflyttning':'')+'</title></circle><text class="combat-token-label" x="'+cell.x+'" y="'+cell.y+'">'+escAttr(combatTokenInitials(c.name_snapshot))+'</text>')
  }
  return '<g class="combat-token-group'+planningClass+(defeated?' defeated':'')+'" data-token-id="'+escAttr(c.id)+'" onclick="combatTokenClick(event,\''+c.id+'\')" '+(isPlanning&&!defeated?'onpointerdown="combatMovementDragStart(event,\''+c.id+'\')"':'')+'>'+visual+'<title>'+escAttr(c.name_snapshot)+targetTitle+(defeated?' · nedkämpad':'')+(isPlanning?' · dra för att planera förflyttning':'')+'</title></g>'
 }).join('');
 const image=combatRuntimeMapUrl
  ?'<image class="combat-map-background" href="'+escAttr(combatRuntimeMapUrl)+'" x="0" y="0" width="'+g.width+'" height="'+g.height+'" preserveAspectRatio="none"/>'
  :'';
 return '<svg class="combat-map-svg'+(combatMapView.zoom>1.001?' zoomed':'')+'" viewBox="'+mapView.x+' '+mapView.y+' '+mapView.width+' '+mapView.height+'" preserveAspectRatio="xMidYMid meet" aria-label="Hexkarta med bakgrund" onwheel="combatMapWheel(event)" ontouchstart="combatMapTouchGate(event)" ontouchmove="combatMapTouchGate(event)" onpointerdown="combatMapPointerDown(event)" onpointermove="combatMapPointerMove(event)" onpointerup="combatMapPointerEnd(event)" onpointercancel="combatMapPointerEnd(event)" ondblclick="combatMapResetView()">'+combatMiniatureDefs()+image+terrain+tokens+'</svg>'
}

function combatRowPortraitUrl(combatant){
 if(!combatant)return '';
 if(combatant.source_type==='character'){
  const portrait=combatPlayerPortraitSource(combatant);
  return portrait?.url||''
 }
 let source=null;
 if(combatant.source_type==='npc'&&typeof campaignNpcs!=='undefined')source=(campaignNpcs||[]).find(row=>String(row.id)===String(combatant.source_id));
 else if(combatant.source_type==='monster'&&typeof campaignMonsters!=='undefined')source=(campaignMonsters||[]).find(row=>String(row.id)===String(combatant.source_id));
 if(!source)return '';
 const data=source.data&&typeof source.data==='object'?source.data:source;
 const direct=data.portrait||data.portrait_url||data.image_url||source.portrait_url||source.image_url||'';
 if(direct)return String(direct);
 const iconPath=source.combat_icon_path||data.combatIconPath||data.combat_icon_path||'';
 if(iconPath&&typeof combatIconCachedUrl==='function'){
  try{return combatIconCachedUrl(iconPath)||''}catch(_error){}
 }
 return ''
}
function combatRowPortraitHtml(combatant,roleClass){
 const url=combatRowPortraitUrl(combatant),initials=combatTokenInitials(combatant?.name_snapshot||'?');
 return '<span class="combat-row-portrait '+roleClass+'">'+
  (url?'<img src="'+escAttr(url)+'" alt="'+escAttr(combatant?.name_snapshot||'Kombatant')+'">':'<b>'+escAttr(initials)+'</b>')+
 '</span>'
}
function combatantCard(c,index=0){
 const roleClass=c.source_type==='character'?'player-row':c.source_type==='npc'?'npc-row':'enemy-row';
 const selected=combatSelectedTargetId===c.id?' selected':'',turn=combatIsActiveTurn(c)?' active-turn':'',attack=combatCurrentAttackTargets().has(String(c.id))?' attack-target':'';
 const defeated=c.status==='dead',kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':'/'+c.max_kp);
 const psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':'/'+c.max_psy);
 const remaining=combatMovementBudget(c),maximum=combatMovementMaximum(c);
 const rank=combatNumber(c.state?.initiative_rank,null),total=combatNumber(c.state?.initiative_total,null),die=combatNumber(c.state?.initiative_roll,null),smi=combatNumber(c.state?.smi,null);
 const order=rank!=null?rank:index+1;
 const roleLabel=c.source_type==='character'?'Spelare':c.source_type==='npc'?'SLP':c.source_type==='monster'?'Monster':'Fiende';
 const planning=combatIsMovementPlanning(c);
 return'<div role="button" tabindex="0" data-combatant-id="'+escAttr(c.id)+'" class="combatant-card '+roleClass+selected+turn+attack+(planning?' movement-planning':'')+(defeated?' defeated':'')+'" onclick="selectCombatTarget(\''+c.id+'\')">'+
  '<span class="combat-order-number"><b>'+order+'</b></span>'+
  combatRowPortraitHtml(c,roleClass)+
  '<div class="combatant-card-copy">'+
   '<div class="name">'+(defeated?'💀 ':'')+escAttr(c.name_snapshot)+'</div>'+
   '<div class="meta">'+roleLabel+' · Förfl. '+remaining+'/'+maximum+(c.flying?' · Flyger':'')+(defeated?' · Nedkämpad':'')+'</div>'+
   '<div class="combat-row-inline-vitals"><span>KP <b>'+kp+'</b></span><i></i><span>PSY <b>'+psy+'</b></span></div>'+
  '</div>'+
  '<div class="combat-row-init"><b>'+(total!=null?total:'—')+'</b>'+(smi!=null&&die!=null?'<small>SMI '+smi+' + '+die+'</small>':'<small>Initiativ</small>')+'</div>'+
 '</div>'
}

function combatAttackTargetSummaryHtml(combatant){
 if(!combatant||!combatIsActiveTurn(combatant))return '';
 const action=combatChosenAction(combatant),def=combatActionDefinition(action);
 if(def?.type!=='attack')return '';
 const mode=def.mode||action?.source_data?.mode||'auto';
 const options=combatAttackWeaponOptions(combatant,mode);
 const weapon=combatActionWeapon(combatant,action,mode);
 if(options.length>1&&!weapon)return '<div class="combat-attack-summary empty"><b>Välj vapen</b><span>Mål markeras när aktivt vapen är valt.</span></div>';
 if(!weapon)return '<div class="combat-attack-summary empty"><b>Inga möjliga mål</b><span>Inget användbart aktivt vapen.</span></div>';
 const targets=combatPossibleAttackTargets(combatant,mode,weapon);
 return '<div class="combat-attack-summary"><b>'+targets.size+' möjliga mål</b><span>'+escAttr(weapon.name||'Obeväpnad')+' · '+escAttr(combatWeaponAttackHint(weapon,combatant))+' · fri LoS krävs</span></div>'
}
function combatTargetHtml(){
 let c=combatants.find(x=>x.id===combatSelectedTargetId);if(!c)return'<div class="combat-target-body"><div class="combat-target-note">Klicka på en pjäs eller deltagare för att se dess värden. När attackläget är aktivt kan endast markerade, giltiga mål väljas.</div></div>';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':' / '+c.max_kp),psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':' / '+c.max_psy);
 return'<div class="combat-target-body"><div class="combat-target-name">'+(c.status==='dead'?'☠ ':'')+escAttr(c.name_snapshot)+'</div><div class="combat-target-stat"><span>Sida</span><b>'+combatSideLabel(c.side)+'</b></div><div class="combat-target-stat"><span>Initiativ</span><b>'+(c.state?.initiative_total!=null?('#'+c.state.initiative_rank+' · '+c.state.initiative_total+' (SMI '+c.state.smi+' + T10 '+c.state.initiative_roll+')'):'—')+'</b></div><div class="combat-target-stat"><span>KP</span><b>'+kp+'</b></div><div class="combat-target-stat"><span>PSY</span><b>'+psy+'</b></div><div class="combat-target-stat"><span>Position</span><b>'+c.q+', '+c.r+'</b></div><div class="combat-target-stat"><span>Status</span><b>'+(c.status==='dead'?'Nedkämpad':'Aktiv')+'</b></div><div class="combat-target-stat"><span>Förflyttning kvar</span><b>'+combatMovementBudget(c)+' / '+combatMovementMaximum(c)+'</b></div></div>'
}

function combatAttackPanelWeaponHtml(actor,action,target){
 const def=combatActionDefinition(action);if(def?.type!=='attack')return '';
 const mode=def.mode||action?.source_data?.mode||'auto';
 const selected=combatActionWeapon(actor,action,mode);
 let options=combatAttackWeaponOptions(actor,mode);
 if(target)options=options.filter(weapon=>combatAttackTargetInfo(actor,target,weapon,mode));
 if(!options.length)return '<div class="combat-mini-weapons empty">Inget aktuellt vapen når valt mål.</div>';
 if(options.length===1&&selected&&combatWeaponKey(selected)===combatWeaponKey(options[0])){
  return '<div class="combat-mini-weapons single"><span>Vapen</span><b>'+escAttr(selected.name||'Vapen')+'</b><small>'+escAttr(combatWeaponAttackHint(selected,actor))+'</small></div>'
 }
 return '<div class="combat-mini-weapons"><span>Vapen</span><div>'+
  options.map(weapon=>{
   const active=selected&&combatWeaponKey(selected)===combatWeaponKey(weapon);
   return '<button type="button" class="combat-mini-weapon'+(active?' active':'')+'" onclick="chooseCombatAttackWeapon(\''+actor.id+'\',\''+escAttr(combatWeaponKey(weapon))+'\')">'+
    '<b>'+escAttr(weapon.name||'Vapen')+'</b><small>'+escAttr(combatWeaponAttackHint(weapon,actor))+'</small></button>'
  }).join('')+
 '</div></div>'
}
function combatMiniParticipantHtml(label,combatant,itemText=''){
 const kp=(combatant?.current_kp==null?'—':combatant.current_kp)+(combatant?.max_kp==null?'':' / '+combatant.max_kp);
 return '<div class="combat-mini-side"><span>'+label+'</span><b>'+(combatant?.status==='dead'?'☠ ':'')+escAttr(combatant?.name_snapshot||'—')+'</b>'+
  '<small>KP '+kp+(itemText?' · '+escAttr(itemText):'')+'</small></div>'
}
function combatSpellCastPanelHtml(){
 const actor=combatActiveActor(),action=combatChosenAction(actor);if(!actor||combatActionDefinition(action)?.key!=='spell_cast'||!action?.source_data?.spell_prepared)return '';
 const data=action.source_data||{},casting=data.casting_spell===true,targets=casting?combatFireballTargets():new Map(),resolved=action.status==='resolved';
 const targetId=resolved?String(action.target_combatant_id||''):String(combatSelectedTargetId||''),target=combatants.find(row=>String(row.id)===targetId)||null,result=action.result||{};
 const effect=Math.max(1,Number(data.effect_grade)||1),spell=escAttr(data.spell_name||'Besvärjelse');
 let instruction=!casting?'Besvärjelsen är förberedd. Tryck ✦ för att slunga den.':(target?'Målet är valt. Tryck ✦ igen för att slunga '+spell+'.':'Välj mål för '+spell+'. Giltiga mål är markerade ('+targets.size+').');
 return '<section class="combat-mini-attack combat-mini-magic '+(resolved?'resolved':'planning')+'"><div class="combat-mini-title"><span>MAGI · '+spell+'</span><b>'+escAttr(actor.name_snapshot)+(target?' → '+escAttr(target.name_snapshot):'')+'</b></div>'+
  '<div class="combat-magic-prepared"><span>FÖRBEREDD</span><b>'+spell+'</b><small>FV '+escAttr(data.spell_fv??'—')+' · Effektgrad '+effect+(data.range_text?' · '+escAttr(data.range_text):'')+'</small></div>'+
  (!resolved?'<div class="combat-mini-instruction">'+instruction+'</div>':'')+
  (resolved?'<div class="combat-attack-result"><b>'+escAttr(combatOutcomeLabel(result.outcome))+'</b><small>T20 '+(result.roll??'—')+' mot FV '+(result.fv??'—')+'</small></div>'+combatDamageResultHtml(result.damage):'')+'</section>'
}
function combatAttackPanelHtml(){
 const magic=combatSpellCastPanelHtml();if(magic)return magic;
 const pending=combatPendingParryOpportunity();
 if(pending){
  const attack=pending.attack,result=attack.result||{};
  const attackWeapon=result.weapon_name||attack.source_data?.weapon_name||'Vapen';
  const optionText=pending.options.map(option=>option.name).join(' / ');
  return '<section class="combat-mini-attack reaction">'+
   '<div class="combat-mini-title"><span>ANFALL</span><b>Lyckat närstridsanfall · parering möjlig</b></div>'+
   '<div class="combat-mini-duel">'+
    combatMiniParticipantHtml('ATTACKERAR',pending.attacker,attackWeapon)+
    '<div class="combat-mini-arrow">→</div>'+
    combatMiniParticipantHtml('FÖRSVARAR',pending.defender,optionText)+
   '</div>'+
   combatAttackResultHtml(attack)+
   '<div class="combat-mini-parry"><span>'+escAttr(pending.defender.name_snapshot)+' har en handling kvar. Välj parering eller ta träffen.</span><div>'+
    pending.options.map(option=>'<button type="button" class="btn combat-parry-btn" onclick="chooseCombatParry(\''+pending.defender.id+'\',\''+attack.id+'\',\''+escAttr(option.key)+'\')">Parera · '+escAttr(option.name)+'</button>').join('')+
    '<button type="button" class="btn combat-take-hit-btn" onclick="declineCombatParry(\''+pending.defender.id+'\',\''+attack.id+'\')">Ta träffen</button>'+
   '</div></div>'+
  '</section>'
 }
 const actor=combatActiveActor(),action=combatChosenAction(actor),def=combatActionDefinition(action);
 if(!actor||def?.type!=='attack')return '';
 const targets=combatCurrentAttackTargets();
 const resolvedTargetId=action.status==='resolved'&&action.target_combatant_id?String(action.target_combatant_id):'';
 const plannedTargetId=String(combatSelectedTargetId||'');
 const panelTargetId=resolvedTargetId||(plannedTargetId&&targets.has(plannedTargetId)?plannedTargetId:'');
 const target=combatants.find(row=>String(row.id)===String(panelTargetId||''))||null;
 const mode=def.mode||action?.source_data?.mode||'auto',selectedWeapon=combatActionWeapon(actor,action,mode);
 let instruction='';
 if(action.status==='planned'){
  if(!target)instruction=targets.size+' giltiga mål är markerade. Klicka på mål på kartan eller i turordningen. Tryck Attack igen för att avbryta.';
  else if(!selectedWeapon){
   const valid=combatAttackWeaponOptions(actor,mode).filter(weapon=>combatAttackTargetInfo(actor,target,weapon,mode));
   instruction=valid.length>1?'Välj vilket vapen som används mot målet.':'Tryck på attackknappen igen för att slå attacken.'
  }else instruction='Målet är valt. Klicka på målet igen för att avmarkera, eller tryck Attack igen för att slå.'
 }
 const targetInfo=target&&selectedWeapon?combatAttackTargetInfo(actor,target,selectedWeapon,mode):null;
 return '<section class="combat-mini-attack '+(action.status==='resolved'?'resolved':'planning')+'">'+
  '<div class="combat-mini-title"><span>ANFALL</span><b>'+escAttr(actor.name_snapshot)+(target?' → '+escAttr(target.name_snapshot):' · välj mål')+'</b></div>'+
  '<div class="combat-mini-duel">'+
   combatMiniParticipantHtml('ATTACKERAR',actor,selectedWeapon?.name||action.source_data?.weapon_name||'Välj vapen')+
   '<div class="combat-mini-arrow">→</div>'+
   combatMiniParticipantHtml('FÖRSVARAR',target,target?(targetInfo?(targetInfo.mode==='melee'?'Närstrid':'Avstånd')+' · '+targetInfo.distance+' hex':'Valt mål'):'—')+
  '</div>'+
  (action.status==='planned'?combatAttackPanelWeaponHtml(actor,action,target):'')+
  (instruction?'<div class="combat-mini-instruction">'+escAttr(instruction)+'</div>':'')+
  (action.status==='resolved'?combatAttackResultHtml(action):'')+
 '</section>'
}

function combatTurnPortraitHtml(combatant){
 if(!combatant)return '';
 const roleClass=combatant.source_type==='character'?'player-row':combatant.source_type==='npc'?'npc-row':'enemy-row';
 const url=combatRowPortraitUrl(combatant),initials=combatTokenInitials(combatant.name_snapshot||'?');
 return '<span class="combat-turn-portrait '+roleClass+'">'+
  (url?'<img src="'+escAttr(url)+'" alt="'+escAttr(combatant.name_snapshot||'Kombatant')+'">':'<b>'+escAttr(initials)+'</b>')+
 '</span>'
}
function combatTurnActionState(combatant){
 if(!combatant)return{key:'none',label:'Ingen handling'};
 if(combatPendingParryOpportunity())return{key:'reaction',label:'Reaktion'};
 if(combatIsMovementPlanning(combatant))return{key:'move',label:'Förflyttning'};
 const action=combatChosenAction(combatant),def=combatActionDefinition(action);
 if(def?.type==='attack'||def?.key==='attack')return{key:'attack',label:'Attack'};
 if(def?.key==='spell_cast')return{key:'spell',label:action?.source_data?.spell_prepared?'Magi · '+(action.source_data.spell_name||'förberedd'):'Förbered magi'};
 if(def)return{key:'other',label:'Övriga handlingar'};
 return{key:'none',label:'Redo'}
}
function combatTurnEquipmentHtml(combatant){
 const profile=combatAttackProfile(combatant),eq=profile.currentEquipment||{},weapons=Array.isArray(profile.weapons)?profile.weapons:[],shields=Array.isArray(profile.shields)?profile.shields:[],armor=Array.isArray(profile.armor)?profile.armor:[],projectiles=Array.isArray(profile.projectiles)?profile.projectiles:[];
 const itemForRef=ref=>{
  if(!ref?.itemId)return null;
  const list=ref.kind==='weapon'?weapons:ref.kind==='shield'?shields:[];
  return list.find(item=>String(item.equipId||item.id||'')===String(ref.itemId))||null
 };
 const hand=(slot,label)=>{
  const ref=eq[slot],item=itemForRef(ref);
  let name=item?.name||'Tom hand',src='';
  if(ref?.kind==='weapon'&&item){
   const rule=(typeof ruleWeapons!=='undefined'?ruleWeapons:[]).find(r=>String(r.id)===String(item.weaponTypeId||item.weapon_id||''));
   const key=item.iconKey||item.icon_key||rule?.icon_key||'generic';src='./assets/weapon-icons/'+key+'.svg'
  }else if(ref?.kind==='shield'&&item){
   const rule=(typeof ruleShields!=='undefined'?ruleShields:[]).find(r=>String(r.id)===String(item.shieldTypeId||item.shield_id||''));
   const key=item.iconKey||item.icon_key||rule?.icon_key||'shield-medium';src='./assets/armor-icons/'+key+'.svg'
  }
  return '<div class="combat-turn-equip"><span>'+label+'</span>'+(src?'<img src="'+escAttr(src)+'" alt="">':'<b>—</b>')+'<small>'+escAttr(name)+'</small></div>'
 };
 const worn=armor.find(item=>['torso','body'].includes(String(item.slot||'').toLowerCase()))||armor[0]||null;
 const armorRule=worn&&(typeof ruleArmorTypes!=='undefined'?ruleArmorTypes:[]).find(r=>String(r.id)===String(worn.armorTypeId||worn.armor_type_id||''));
 const armorKey=worn?.iconKey||worn?.icon_key||armorRule?.icon_key||'generic';
 const armorHtml='<div class="combat-turn-equip"><span>Rustning</span>'+(worn?'<img src="./assets/armor-icons/'+escAttr(armorKey)+'.svg" alt="">':'<b>—</b>')+'<small>'+escAttr(worn?.name||'Ingen')+'</small></div>';
 const projectileTotal=projectiles.reduce((sum,p)=>sum+Math.max(0,Number(p?.count)||0),0);
 const projectileHtml='<div class="combat-turn-equip projectile"><span>Projektiler</span><b>'+projectileTotal+'</b><small>'+escAttr(projectiles.filter(p=>Number(p?.count)>0).map(p=>p.name).filter(Boolean).join(', ')||'Inga')+'</small></div>';
 return hand('leftHand','Vänster hand')+hand('rightHand','Höger hand')+armorHtml+projectileHtml
}
function combatTurnPanelHtml(){
 const actor=combatActiveActor(),canManage=combatCanManage(),state=combatTurnActionState(actor);
 const lastUndo=activeCombat?.settings?.turn_undo_last;
 const undoButton=canManage
  ?'<button type="button" class="combat-turn-undo-btn" title="Ångra senaste drag" aria-label="Ångra senaste drag" onclick="window.undoLastCombatTurn?.(event)" '+(!lastUndo?'disabled':'')+'>↶</button>'
  :'';
 const head='<div class="combat-turn-head">'+
  '<span class="combat-round">Runda '+activeCombat.round_number+'</span>'+
  '<span class="combat-turn-action-status '+state.key+'">Handling: '+escAttr(state.label)+'</span>'+
  '<span class="combat-status">'+escAttr(combatStatusLabel(activeCombat.status))+' · Sparad strid'+(canManage?' · SL-läge':'')+'</span>'+
  undoButton+
 '</div>';
 if(!actor){
  return '<div class="combat-topbar combat-turn-panel">'+head+
   '<div class="combat-turn-actor empty"><span>Inväntar aktiv kombatant…</span></div>'+
  '</div>'
 }
 const defeated=actor.status==='dead';
 const planning=combatIsMovementPlanning(actor);
 const chosenDef=combatActionDefinition(combatChosenAction(actor));
 const attackChosen=chosenDef?.key==='attack',magicChosen=chosenDef?.key==='spell_cast',otherChosen=!!chosenDef&&!attackChosen&&!magicChosen;
 const actionOpen=String(combatActionMenuId||'')===String(actor.id);
 const otherOpen=actionOpen&&combatActionMenuKind==='other',magicOpen=actionOpen&&combatActionMenuKind==='magic';
 const canMove=!defeated&&combatCanPlanMovement(actor),canAction=!defeated&&combatCanUseActionMenu(actor),canEnd=!defeated&&combatCanEndTurn(actor);
 const moveTitle=planning?((Number(combatMovementPlan?.cost)||0)>0?'Lås förflyttning':'Avbryt förflyttning'):'Planera förflyttning';
 const maximum=combatMovementMaximum(actor),remaining=combatMovementBudget(actor),spent=Math.max(0,maximum-remaining);
 const kpCurrent=actor.current_kp==null?'—':actor.current_kp,kpMax=actor.max_kp==null?'—':actor.max_kp;
 const psyCurrent=actor.current_psy==null?'—':actor.current_psy,psyMax=actor.max_psy==null?'—':actor.max_psy;
 return '<div class="combat-topbar combat-turn-panel">'+head+
  '<div class="combat-turn-actor">'+
   combatTurnPortraitHtml(actor)+
   '<div class="combat-turn-identity"><span>AKTIV KOMBATTANT</span><b>'+escAttr(actor.name_snapshot)+'</b></div>'+
   '<div class="combat-turn-actions">'+
    '<div class="combat-row-tool combat-turn-action-tool move-tool"><button type="button" class="combat-row-tool-btn combat-row-move'+(state.key==='move'?' active':'')+'" title="'+moveTitle+'" aria-label="'+moveTitle+'" onclick="combatMovementButton(event,\''+actor.id+'\')" '+(!canMove?'disabled':'')+'><img class="combat-row-tool-icon" src="./assets/combat-actions/movement.svg?v=0.33.79" alt="" aria-hidden="true"></button></div>'+
    '<div class="combat-row-tool combat-turn-action-tool attack-tool"><button type="button" class="combat-row-tool-btn combat-row-attack'+(state.key==='attack'?' active':'')+(attackChosen?' chosen':'')+'" title="Attack" aria-label="Attack" onclick="combatAttackButton(event,\''+actor.id+'\')" '+(!canAction?'disabled':'')+'><img class="combat-row-tool-icon" src="./assets/combat-actions/attack.svg?v=0.33.79" alt="" aria-hidden="true"></button>'+combatRowAttackMenuHtml(actor)+'</div>'+
    '<div class="combat-row-tool combat-turn-action-tool magic-tool"><button type="button" class="combat-row-tool-btn combat-row-magic'+(state.key==='spell'?' active':'')+(magicChosen?' chosen':'')+'" title="'+(combatChosenAction(actor)?.source_data?.spell_prepared?'Slunga besvärjelse':'Förbered besvärjelse')+'" aria-label="Magi" onclick="combatMagicButton(event,\''+actor.id+'\')" '+(!canAction?'disabled':'')+'><span class="combat-magic-glyph" aria-hidden="true">✦</span></button>'+combatRowMagicMenuHtml(actor)+'</div>'+
    '<div class="combat-row-tool combat-turn-action-tool action-tool"><button type="button" class="combat-row-tool-btn combat-row-action'+(state.key==='other'||otherOpen?' active':'')+(otherChosen?' chosen':'')+'" title="Andra handlingar" aria-label="Andra handlingar" aria-haspopup="menu" aria-expanded="'+(otherOpen?'true':'false')+'" onclick="toggleCombatOtherActionsMenu(event,\''+actor.id+'\')" '+(!canAction?'disabled':'')+'><img class="combat-row-tool-icon" src="./assets/combat-actions/other-actions.svg?v=0.33.79" alt="" aria-hidden="true"></button>'+combatRowActionMenuHtml(actor)+'</div>'+
    '<div class="combat-row-tool combat-turn-action-tool end-tool"><button type="button" class="combat-row-tool-btn combat-row-end" title="Avsluta drag" aria-label="Avsluta drag" onclick="endCombatTurn(event,\''+actor.id+'\')" '+(!canEnd?'disabled':'')+'><img class="combat-row-tool-icon" src="./assets/combat-actions/end-round.svg?v=0.33.79" alt="" aria-hidden="true"></button></div>'+
   '</div>'+
  '</div>'+
  '<div class="combat-turn-stats">'+
   '<div><span>Förflyttning</span><b>'+spent+'/'+maximum+'</b><small>förbrukat / max</small></div>'+
   '<div><span>KP</span><b>'+kpCurrent+'/'+kpMax+'</b></div>'+
   '<div><span>PSY</span><b>'+psyCurrent+'/'+psyMax+'</b></div>'+combatTurnEquipmentHtml(actor)+
  '</div>'+
 '</div>'
}
function renderCombat(){
 let body=$('combatBody'),sub=$('combatSubtitle');if(!body)return;
 if(!activeCombat){
  if(sub)sub.textContent='Ingen aktiv strid';
  body.innerHTML='<div class="combat-empty"><h3>Ingen aktiv strid</h3><div class="combat-foundation-note">Välj en stridsscen i SL-raden ovan och tryck <b>Play</b>. Alea skapar då striden och slår initiativ för samtliga kombatanter.</div><div class="combat-quick-note"><b>Reset</b> återställer den aktiva striden till stridsscenens sparade startpositioner, terräng och grundvärden.</div></div>';return
 }
 if(sub)sub.textContent=activeCombat.name||'Aktiv strid';
 let participantHtml=combatants.length?combatants.map((c,index)=>combatantCard(c,index)).join(''):'<div class="combat-target-body"><div class="combat-target-note">Inga synliga deltagare ännu.</div></div>';
 let logHtml=combatLogRows.length?combatLogRows.map(x=>'<div class="combat-log-row"><span class="combat-log-phase">'+escAttr(combatPhaseLabel(x.phase))+'</span>'+escAttr(x.message)+'</div>').join(''):'<div class="combat-log-row">Ingen stridshändelse loggad ännu.</div>';
 body.innerHTML='<div class="combat-shell">'+combatTurnPanelHtml()+'<aside class="combat-panel combat-participants"><h3>Turordning</h3><div class="combat-participant-list">'+participantHtml+'</div></aside><div class="combat-board-wrap">'+combatAttackPanelHtml()+'<div class="combat-board" style="'+combatMapFrameStyle()+'">'+renderCombatMap()+'</div>'+combatMapFooterHtml()+'</div><aside class="combat-panel combat-target"><h3>Markerat mål</h3>'+combatTargetHtml()+'</aside><section class="combat-log"><h3>Stridslogg</h3><div class="combat-log-list">'+logHtml+'</div></section></div>';
 requestAnimationFrame(()=>requestAnimationFrame(()=>{combatMapApplyView();combatPositionDiceLayer();combatAnimateCommittedMovement()}))
}

window.addEventListener('resize',()=>{if(!$('combatPage')?.classList.contains('hidden'))combatPositionDiceLayer()});
window.addEventListener('scroll',()=>{if(!$('combatPage')?.classList.contains('hidden'))combatPositionDiceLayer()},{passive:true});

/* v0.33.82 — never allow the active combatant to be an attack target */
