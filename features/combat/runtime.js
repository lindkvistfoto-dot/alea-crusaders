const COMBAT_PHASE_LABELS={initiative:'Initiativ',declaration:'Deklaration',movement:'Rörelse',magic:'Magi',quick:'Snabba handlingar',normal:'Normal slagväxling',new_contact:'Ny närstridskontakt',late:'Sena handlingar',effects:'Besvärjelseeffekter',round_end:'Rundslut',reaction:'Reaktion'};
function combatPhaseLabel(p){return COMBAT_PHASE_LABELS[p]||String(p||'—')}
function combatSideLabel(s){return s==='heroes'?'Hjältar':s==='enemies'?'Fiender':'Neutral'}
function combatStatusLabel(s){return s==='setup'?'Förberedelse':s==='active'?'Pågår':s==='paused'?'Pausad':s==='completed'?'Avslutad':String(s||'—')}
function combatCanManage(){return !!activeUser()?.admin||centralCampaignRole==='gm'}
let combatSelectedSceneId='',combatSceneBusy=false;

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
 if(activeSceneId&&scenes.some(scene=>String(scene.id)===activeSceneId))combatSelectedSceneId=activeSceneId;
 else if(!scenes.some(scene=>String(scene.id)===String(combatSelectedSceneId)))combatSelectedSceneId=scenes.length===1?String(scenes[0].id):'';
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
 host.innerHTML='<div class="combat-gm-control-copy"><span>SL · STRIDSSCEN</span><small>Under utveckling · startar direkt i Rörelse</small></div>'+
  '<select id="combatScenePicker" onchange="selectCombatScene(this.value)" '+(combatSceneBusy?'disabled':'')+'>'+
    (scenes.length?scenes.map(row=>'<option value="'+escAttr(row.id)+'" '+(String(row.id)===String(combatSelectedSceneId)?'selected':'')+'>'+escAttr(row.name||'Stridsscen')+'</option>').join(''):'<option value="">Ingen stridsscen</option>')+
  '</select>'+
  '<button id="combatPlayBtn" class="btn combat-play-btn" type="button" onclick="playCombatScene()" '+(combatSceneBusy||!scene||!!activeCombat?'disabled':'')+'>▶ Play</button>'+
  '<button id="combatResetBtn" class="btn combat-reset-btn" type="button" onclick="resetCombatScene()" '+(combatSceneBusy||!activeCombat?'disabled':'')+'>↻ Reset</button>'+
  (activeCombat?'<span class="combat-gm-active">Aktiv: '+escAttr(activeCombat.name||combatSceneFromId(activeSceneId)?.name||'Strid')+'</span>':'<span class="combat-gm-active idle">Ingen aktiv strid</span>')
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
 let maxKp=combatNumber(combatStateValue(state,'max_kp','kp_max'),combatNumber(live.KPmax,null));
 if(maxKp==null&&attributes.FYS!=null&&attributes.STO!=null)maxKp=Math.ceil((Number(attributes.FYS)+Number(attributes.STO))/2);
 let currentKp=combatNumber(combatStateValue(state,'current_kp','kp'),combatNumber(live.KP,maxKp));
 let maxPsy=combatNumber(combatStateValue(state,'max_psy','psy_max'),combatNumber(live.PSYmax,combatNumber(attributes.PSY,null)));
 let currentPsy=combatNumber(combatStateValue(state,'current_psy','psy'),combatNumber(live.PSY,maxPsy));
 let move=combatNumber(combatStateValue(state,'movement_max','movement','move'),combatNumber(derived['Förflyttning'],combatNumber(attributes.SMI,10)));
 return{
  current_kp:currentKp,max_kp:maxKp,current_psy:currentPsy,max_psy:maxPsy,
  movement_max:move,movement_remaining:move,
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
  dbJson('campaign_npcs?campaign_id=eq.'+campaignId+'&select=id,name,attributes'),
  dbJson('campaign_monsters?campaign_id=eq.'+campaignId+'&select=id,name,attributes')
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
async function combatCreateRuntimeFromScene(scene){
 const runtime=await combatLoadSceneRuntimeData(scene);
 const instanceId=crypto.randomUUID();
 const settings={
  ...(scene.settings&&typeof scene.settings==='object'?scene.settings:{}),
  scene_id:scene.id,
  source:'campaign_combat_scene',
  development_mode:'movement',
  background_image_path:scene.background_image_path||null,
  background_width:scene.background_width||null,
  background_height:scene.background_height||null
 };
 await dbJson('combat_instances',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({
  id:instanceId,campaign_id:centralCampaignId,event_id:scene.source_event_id||null,map_id:scene.map_id||null,
  name:scene.name||'Strid',status:'active',round_number:1,phase:'movement',winning_side:null,
  initiative:{},settings,started_by:activeUser()?.id||null,started_at:new Date().toISOString(),completed_at:null
 })});
 const combatantRows=runtime.sceneCombatants.map((row,index)=>{
  const stats=combatSourceStats(row,runtime.sources);
  const side=(row.state?.side&&['heroes','enemies','neutral'].includes(row.state.side))
    ?row.state.side
    :(row.combatant_type==='enemy'||row.combatant_type==='monster'?'enemies':'heroes');
  const sourceType=['character','npc','monster'].includes(row.source_type)?row.source_type:null;
  if(!sourceType||!row.source_id)return null;
  return{
   combat_id:instanceId,campaign_id:centralCampaignId,source_type:sourceType,source_id:row.source_id,
   source_instance_key:sourceType+':'+row.source_id+':'+Math.max(1,Number(row.instance_no)||1),
   name_snapshot:row.name||'Kombatant',side,controller_user_id:stats.controller_user_id,
   q:row.start_q==null?0:Number(row.start_q),r:row.start_r==null?0:Number(row.start_r),
   flying:stats.flying,visible_to_players:row.visible_to_players!==false,
   current_kp:stats.current_kp,max_kp:stats.max_kp,current_psy:stats.current_psy,max_psy:stats.max_psy,
   movement_max:stats.movement_max,movement_remaining:stats.movement_remaining,status:'active',action_plan:[],
   state:{...(row.state||{}),scene_combatant_id:row.id,scene_start_q:row.start_q,scene_start_r:row.start_r},
   sort_order:Number(row.sort_order)||index
  }
 }).filter(Boolean);
 if(combatantRows.length)await dbJson('combatants',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(combatantRows)});
 const hexRows=runtime.sceneHexes.map(row=>({
  combat_id:instanceId,campaign_id:centralCampaignId,q:Number(row.q),r:Number(row.r),
  movement_mode:row.movement_mode||'free',sight_mode:row.sight_mode||'clear',
  movement_cost:Number(row.movement_cost)||1,notes:row.notes||''
 }));
 if(hexRows.length)await dbJson('combat_hexes',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(hexRows)});
 return instanceId
}
async function combatStartScene(sceneId,{reset=false}={}){
 if(!combatCanManage()||combatSceneBusy)return;
 const scene=combatSceneFromId(sceneId);if(!scene){alert('Välj en stridsscen.');return}
 combatSceneBusy=true;renderCombatGmControls();
 try{
  if(reset&&activeCombat?.id)await combatDeleteRuntime(activeCombat.id);
  else if(!reset&&activeCombat?.id)return;
  await combatCreateRuntimeFromScene(scene);
  combatSelectedSceneId=String(scene.id);
  await loadActiveCombat();
 }catch(e){
  console.error('Kunde inte starta stridsscen',e);
  alert((reset?'Reset':'Play')+' kunde inte genomföras: '+(e?.message||e))
 }finally{
  combatSceneBusy=false;
  renderCombatGmControls()
 }
}
async function playCombatScene(){
 await loadCombatSceneChoices();
 return combatStartScene(combatSelectedSceneId,{reset:false})
}
async function resetCombatScene(){
 const sceneId=combatActiveSceneId()||combatSelectedSceneId;
 if(!sceneId)return;
 combatSelectedSceneId=sceneId;
 return combatStartScene(sceneId,{reset:true})
}
async function loadActiveCombat(){
 activeCombat=null;combatants=[];combatHexes=[];combatActions=[];combatLogRows=[];combatSelectedTargetId=null;
 if(!centralCampaignId){renderCombat();return null}
 try{
  let rows=await dbJson('combat_instances?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&status=in.(setup,active,paused)&select=*&order=updated_at.desc&limit=1');
  activeCombat=rows?.[0]||null;
  if(activeCombat){
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
   combatLogRows=(Array.isArray(data[3])?data[3]:[]).reverse()
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
function selectCombatTarget(id){combatSelectedTargetId=id||null;renderCombat()}
function combatTokenInitials(name){let a=String(name||'?').trim().split(/\s+/).filter(Boolean);return(a.length>1?(a[0][0]+a[a.length-1][0]):a[0]?.slice(0,2)||'?').toUpperCase()}
function combatGeneratedHexes(){
 if(combatHexes.length)return combatHexes;
 let out=[];for(let r=0;r<7;r++)for(let q=0;q<10;q++)out.push({q,r,movement_mode:'free',sight_mode:'clear',movement_cost:1,_generated:true});return out
}
function combatHexGeometry(hexes,size=38){
 let raw=hexes.map(h=>{let q=Number(h.q)||0,r=Number(h.r)||0,x=Math.sqrt(3)*size*(q+r/2),y=1.5*size*r;return{h,x,y}});
 let minX=Math.min(...raw.map(p=>p.x))-size-12,maxX=Math.max(...raw.map(p=>p.x))+size+12,minY=Math.min(...raw.map(p=>p.y))-size-12,maxY=Math.max(...raw.map(p=>p.y))+size+12;
 let dx=-minX,dy=-minY,width=Math.max(520,maxX-minX),height=Math.max(420,maxY-minY);
 return{points:raw.map(p=>({...p,x:p.x+dx,y:p.y+dy})),dx,dy,width,height,size}
}
function combatHexPoints(x,y,size){
 let pts=[];for(let i=0;i<6;i++){let a=(Math.PI/180)*(60*i-30);pts.push((x+size*Math.cos(a)).toFixed(1)+','+(y+size*Math.sin(a)).toFixed(1))}return pts.join(' ')
}
function renderCombatMap(){
 let hexes=combatGeneratedHexes(),g=combatHexGeometry(hexes),byCoord=new Map(g.points.map(p=>[(Number(p.h.q)||0)+','+(Number(p.h.r)||0),p]));
 let terrain=g.points.map(p=>{let h=p.h,cls=['combat-hex'];if(h.movement_mode==='difficult')cls.push('difficult');if(h.movement_mode==='blocked')cls.push('move-blocked');if(h.sight_mode==='obscuring')cls.push('sight-obscuring');if(h.sight_mode==='blocked')cls.push('sight-blocked');return'<polygon class="'+cls.join(' ')+'" points="'+combatHexPoints(p.x,p.y,g.size-1.5)+'"><title>Hex '+h.q+','+h.r+' · rörelse '+(h.movement_mode||'free')+' · sikt '+(h.sight_mode||'clear')+'</title></polygon>'}).join('');
 let tokens=combatants.filter(c=>c.status!=='removed').map(c=>{let p=byCoord.get((Number(c.q)||0)+','+(Number(c.r)||0));if(!p){let x=Math.sqrt(3)*g.size*((Number(c.q)||0)+(Number(c.r)||0)/2)+g.dx,y=1.5*g.size*(Number(c.r)||0)+g.dy;p={x,y}}let side=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'';return'<g onclick="selectCombatTarget(\''+c.id+'\')"><circle class="combat-token '+side+selected+'" cx="'+p.x+'" cy="'+p.y+'" r="'+(g.size*.48)+'"><title>'+escAttr(c.name_snapshot)+'</title></circle><text class="combat-token-label" x="'+p.x+'" y="'+p.y+'">'+escAttr(combatTokenInitials(c.name_snapshot))+'</text></g>'}).join('');
 return'<svg viewBox="0 0 '+g.width+' '+g.height+'" preserveAspectRatio="xMidYMid meet" aria-label="Hexkarta">'+terrain+tokens+'</svg>'
}
function combatantCard(c){
 let cls=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':'/'+c.max_kp),move=c.movement_remaining==null?'—':c.movement_remaining;
 return'<button type="button" class="combatant-card '+cls+selected+'" onclick="selectCombatTarget(\''+c.id+'\')"><div class="name">'+escAttr(c.name_snapshot)+'</div><div class="meta">'+combatSideLabel(c.side)+' · KP '+kp+' · Förfl. '+move+(c.flying?' · Flyger':'')+'</div></button>'
}
function combatTargetHtml(){
 let c=combatants.find(x=>x.id===combatSelectedTargetId);if(!c)return'<div class="combat-target-body"><div class="combat-target-note">Klicka på en pjäs eller deltagare för att markera mål. Tillgängliga attacker kommer senare att räknas fram från avstånd, sikt, utrustning och kvarvarande handlingar.</div></div>';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':' / '+c.max_kp),psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':' / '+c.max_psy);
 return'<div class="combat-target-body"><div class="combat-target-name">'+escAttr(c.name_snapshot)+'</div><div class="combat-target-stat"><span>Sida</span><b>'+combatSideLabel(c.side)+'</b></div><div class="combat-target-stat"><span>KP</span><b>'+kp+'</b></div><div class="combat-target-stat"><span>PSY</span><b>'+psy+'</b></div><div class="combat-target-stat"><span>Position</span><b>'+c.q+', '+c.r+'</b></div><div class="combat-target-stat"><span>Rörelse</span><b>'+(c.flying?'Flygande':'Mark')+'</b></div><div class="combat-target-note">Nästa steg är att koppla målvalet till line of sight, räckvidd och handlingsknappar för aktuell utrustning.</div></div>'
}
function renderCombat(){
 let body=$('combatBody'),sub=$('combatSubtitle');if(!body)return;
 if(!activeCombat){
  if(sub)sub.textContent='Ingen aktiv strid';
  body.innerHTML='<div class="combat-empty"><h3>Ingen aktiv strid</h3><div class="combat-foundation-note">Välj en stridsscen i SL-raden ovan och tryck <b>Play</b>. Under utvecklingen startar striden direkt i <b>Rörelse</b> så att förflyttning kan testas först.</div><div class="combat-quick-note"><b>Reset</b> återställer runtime-striden till stridsscenens sparade startpositioner, terräng och grundvärden utan att ändra själva scenen.</div></div>';return
 }
 if(sub)sub.textContent=activeCombat.name||'Aktiv strid';
 let winner=activeCombat.winning_side?(' · Initiativ: '+combatSideLabel(activeCombat.winning_side)):'';
 let participantHtml=combatants.length?combatants.map(combatantCard).join(''):'<div class="combat-target-body"><div class="combat-target-note">Inga synliga deltagare ännu.</div></div>';
 let logHtml=combatLogRows.length?combatLogRows.map(x=>'<div class="combat-log-row"><span class="combat-log-phase">'+escAttr(combatPhaseLabel(x.phase))+'</span>'+escAttr(x.message)+'</div>').join(''):'<div class="combat-log-row">Ingen stridshändelse loggad ännu.</div>';
 body.innerHTML='<div class="combat-shell"><div class="combat-topbar"><span class="combat-round">Runda '+activeCombat.round_number+'</span><span class="combat-phase">'+escAttr(combatPhaseLabel(activeCombat.phase))+'</span><span class="combat-status">'+escAttr(combatStatusLabel(activeCombat.status))+winner+'</span>'+(combatCanManage()?'<span class="combat-status">· SL-läge</span>':'')+'</div><aside class="combat-panel combat-participants"><h3>Deltagare</h3><div class="combat-participant-list">'+participantHtml+'</div></aside><div class="combat-board-wrap"><div class="combat-board-head"><span>Hexkarta</span><div class="combat-legend"><span>Fri</span><span>Svår</span><span>Blockerad</span></div></div><div class="combat-board">'+renderCombatMap()+'</div></div><aside class="combat-panel combat-target"><h3>Markerat mål</h3>'+combatTargetHtml()+'</aside><section class="combat-log"><h3>Stridslogg</h3><div class="combat-log-list">'+logHtml+'</div></section></div>'
}
