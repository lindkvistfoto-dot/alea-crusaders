import {figureTravel,landFigure} from './living-hex.js';
// Each embedded fight has its own document. Legacy event handlers, selected
// targets and pending dice animations belong to that document for its lifetime.
const clientInfo='alea-adventure-combat';
const headers={'x-client-info':clientInfo};
const scope=v=>'campaign_id=eq.'+v.campaign+'&map_id=eq.'+v.map.id+'&session_id=eq.'+v.session;
export async function currentEncounter(v){
  const rows=await dbJson('combat_instances?'+scope(v)+'&settings->>origin=eq.adventure&status=in.(active,paused)&select=id,status&limit=1',{headers});
  return rows[0]||null;
}

export async function startEncounter(v){
  if(!v.gm)throw Error('Endast SL kan starta striden.');
  let sceneId=v.rows.length?null:v.seedScene;
  let priorActors=[];
  if(v.rows.length){
    const previous=await dbJson('combat_instances?'+scope(v)+'&settings->>origin=eq.adventure&status=eq.completed&select=id,settings&order=updated_at.desc&limit=1',{headers});
    sceneId=previous[0]?.settings?.adventure_scene||null;
    if(sceneId)priorActors=await dbJson('combatants?combat_id=eq.'+previous[0].id+'&select=source_instance_key,state->scene_actor_id',{headers});
  }
  if(!v.rows.length&&!sceneId)throw Error('Välj en stridsscen eller placera figurer på kartan.');
  const runtime=sceneId?await combatLoadSceneRuntimeData({id:sceneId}):null;
  const sourceMap=rows=>new Map(rows.map(row=>[row.id,row]));
  const sources=runtime?.sources||{
    characters:sourceMap(await dbJson('characters?campaign_id=eq.'+v.campaign+'&select=id,name,owner_id,combat_icon_path,round_background_path,data')),
    npcs:sourceMap(campaignNpcs),monsters:sourceMap(campaignMonsters)
  };
  const figures=!v.rows.length?runtime.sceneCombatants.filter(row=>row.start_q!=null&&row.start_r!=null).map(row=>({
    id:crypto.randomUUID(),scene_actor:row,name:row.name,q:row.start_q,r:row.start_r,
    [row.source_type+'_id']:row.source_id,player_visible:row.visible_to_players!==false
  })):v.rows.map(figure=>{
    const old=priorActors.find(actor=>actor.source_instance_key===figure.id);
    return {...figure,scene_actor:old&&runtime?.sceneCombatants.find(row=>row.id===old.scene_actor_id)};
  });
  const pool=await window.aleaRoundGallery?.getActivePool?.()||[];
  const actors=figures.map((figure,index)=>{
    const type=figure.monster_id?'monster':figure.npc_id?'npc':'character';
    const source=figure.monster_id||figure.npc_id||figure.character_id||figure.npc_character_id;
    const identity={source_type:type,source_id:source,state:figure.scene_actor?.state||{}};
    const stats=combatSourceStats(identity,sources);
    const art=stats.round_background_path?null:pool[Math.floor(Math.random()*pool.length)];
    const sourceState=identity.state;
    return {...identity,id:crypto.randomUUID(),figure_id:figure.id,scene_actor_id:figure.scene_actor?.id,name_snapshot:figure.name,
      q:figure.q,r:figure.r,status:'active',visible_to_players:figure.player_visible,
      side:sourceState.side||(figure.monster_id?'enemies':figure.character_id?'heroes':'neutral'),sort_order:index,
      current_kp:stats.current_kp,max_kp:stats.max_kp,current_psy:stats.current_psy,max_psy:stats.max_psy,
      movement_max:stats.movement_max,movement_remaining:stats.movement_max,
      flying:stats.flying,controller_user_id:stats.controller_user_id,
      state:{...sourceState,smi:stats.smi,sty:stats.sty,attributes:stats.attributes,attack_profile:stats.attack_profile,
        scene_actor_id:figure.scene_actor?.id,scene_combatant_id:figure.scene_actor?.id,scene_start_q:figure.q,scene_start_r:figure.r,
        race_name:stats.race_name,gender:stats.gender,portrait_image_path:stats.portrait_image_path,combat_icon_path:stats.combat_icon_path,
        round_background_source:stats.round_background_path?'character':'library',round_background_focus:stats.round_background_focus,
        round_background_path:stats.round_background_path||art?.image_path||'assets/combat/round-hero-battle-pilot.avif',
        round_background_id:art?.id||null,footprint:{shape:combatFootprintShape({name:figure.name,state:sourceState}),facing:combatFootprintFacing({state:sourceState})}}};
  });
  if(!actors.length)throw Error('Placera stridens figurer på kartan före start.');
  const initiative=combatBuildInitiative(actors);
  if(!initiative.order.length)throw Error('Minst en synlig kombattant behövs för initiativ.');
  return dbJson('rpc/start_adventure_encounter',{method:'POST',headers,body:JSON.stringify({
    p_map:v.map.id,p_session:v.session,p_scene:sceneId,p_actors:actors,p_initiative:initiative
  })});
}

let mounted;
export function displayEncounter(view){
  if(mounted?.finishing && mounted.view===view && view.ready)return;
  if(mounted && (mounted.view!==view || mounted.id!==view?.encounter || !view?.ready)){
    mounted.frame.remove();
    mounted.work.hidden=false;
    mounted=null;
  }
  if(mounted || !view?.ready || !view.encounter)return;
  const work=document.querySelector('#mapPage .mapworkarea');
  const frame=document.createElement('iframe');
  frame.className='adventure-encounter-frame';
  frame.title='Strid på '+view.map.name;
  frame.src='?view=adventure-encounter';
  mounted={view,id:view.encounter,frame,work};
  work.before(frame);work.hidden=true;
}

// The child can only attach to the frame created for this map and session.
window.aleaAdventureEncounterContext=child=>{
  if(!mounted || mounted.frame.contentWindow!==child)return null;
  const {view,id}=mounted;
  return {id,get motion(){return view.hex?.prefs?.motion;},drawFigure(combatant,width){
    const row=view.rows.find(row=>row.id===combatant.source_instance_key);
    if(!row)return '';
    return window.aleaCombatPaperDollMap.renderAdventureToken({...combatant,
      side:row.character_id?'heroes':row.monster_id?'enemies':'neutral',
      race:row.race,gender:row.gender},width);
  },get map(){return view.map;},gm:view.gm,scope:scope(view),visibleFigures:()=>view.rows.map(f=>f.id),finishing:value=>{if(mounted?.id===id)mounted.finishing=value;},refresh:()=>window.aleaAdventureFigures.refresh()};
};

let attachedEncounter;
export async function enterEmbeddedEncounter(){
  if(window.parent===window)return;
  const context=window.parent.aleaAdventureEncounterContext?.(window);
  if(!context||attachedEncounter===context.id)return;
  attachedEncounter=context.id;
  const art=window.aleaCombatPaperDollMap;
  let committedRoute;
  window.aleaCombatPaperDollMap={...art,render(classic,actor,cell,grid){
    if(actor.status==='dead')return classic;
    const w=grid.xPitch;
    const figure=context.drawFigure?context.drawFigure(actor,w):art.renderAdventureToken(actor,w);
    return '<g transform="translate('+cell.x+' '+cell.y+')"><rect x="'+(-.47*w)+'" y="'+(-.85*w)+'" width="'+(.94*w)+'" height="'+w+'" fill="transparent"/><g data-face="">'+figure+'</g></g>';
  }};
  window.combatAnimateCommittedMovement=()=>{
    const move=combatMovementAnimation;
    if(!move)return;
    const grid=combatRuntimeGeometry();
    const token=document.querySelector('[data-token-id="'+CSS.escape(move.combatantId)+'"]');
    if(!grid||!token)return;
    combatMovementAnimation=null;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const route=committedRoute?.id===move.combatantId?committedRoute.path:[];
    committedRoute=null;
    const end=route.findIndex(c=>c.q===move.toQ && c.r===move.toR);
    const cells=[{q:move.fromQ,r:move.fromR},...(end<0?[{q:move.toQ,r:move.toR}]:route.slice(0,end+1))];
    const points=cells.map(c=>[grid.xPitch*(c.q-move.toQ+(c.r-move.toR)/2),grid.rowPitch*(c.r-move.toR)]);
    const {keyframes,duration}=figureTravel(points,context.motion);
    token.animate(keyframes,{duration,easing:'linear'}).finished.then(()=>landFigure(token.querySelector('[data-face]')),()=>{});
  };
  const original=dbJson;
  // Every reload, including implicit reloads after movement, stays pinned.
  let allowedKey,allowedIds;
  function visibleActorIds(){
    const key=context.visibleFigures().join(',');
    if(key!==allowedKey){
      allowedKey=key;
      allowedIds=key?original('combatants?combat_id=eq.'+context.id+'&visible_to_players=eq.true&source_instance_key=in.('+key+')&select=id',{headers})
        .then(rows=>rows.map(row=>row.id).join(',')).catch(error=>{allowedKey=null;throw error;}):Promise.resolve('');
    }
    return allowedIds;
  }
  window.dbJson=async(path,options={})=>{
    if(path==='rpc/alea_move_multhex'){
      const moved=await original('rpc/move_adventure_combatant',{...options,headers:{...options.headers,...headers}});
      const args=JSON.parse(options.body);
      committedRoute={id:args.p_combatant_id,path:args.p_path};
      return moved;
    }
    if(path.split('?')[0]==='combat_instances'){
      if(!path.includes('?'))throw Error('En ny scen kan inte skapas inuti striden.');
      path+='&id=eq.'+context.id+'&'+context.scope;
    }
    if(!context.gm && (!options.method||options.method==='GET')){
      if(path.startsWith('combatants?')){
        const visible=context.visibleFigures();
        if(!visible.length)return Promise.resolve([]);
        path+='&visible_to_players=eq.true&source_instance_key=in.('+visible.join(',')+')';
      }
      if(path.startsWith('combat_instances?') && path.includes('select=*')){
        const safeColumns='id,name,map_id,campaign_id,session_id,status,round_number,phase,active_actor_id,active_responder_id,updated_at,rows:settings->rows,hex_scale:settings->hex_scale';
        const rows=await original(path.replace('select=*','select='+safeColumns),{...options,headers:{...options.headers,...headers}});
        return rows.map(row=>({...row,settings:{rows:row.rows,hex_scale:row.hex_scale}}));
      }
      if(path.includes('event_type=eq.gm_hex_trigger'))return [];
      if(path.startsWith('combat_log?') || path.startsWith('combat_actions?')){
        const ids=await visibleActorIds();
        if(!ids)return [];
        const log=path.startsWith('combat_log?');
        const actor=log?'actor_id':'combatant_id',target=log?'target_id':'target_combatant_id';
        path+='&player_visible=eq.true&'+actor+'=in.('+ids+')&or=('+target+'.is.null,'+target+'.in.('+ids+'))';
      }
      if(path.startsWith('combat_battlefield_objects?'))path+='&visible_to_players=eq.true';
    }
    return original(path,{...options,headers:{...options.headers,...headers}});
  };
  window.combatCanManage=()=>context.gm;
  // Scene replacement belongs to the standalone view. The embedded Control
  // Board controls this encounter only, including its normal finish dialog.
  window.renderCombatGmControls=()=>{
    const host=document.getElementById('combatGmControls');
    if(!host||!context.gm)return;
    host.classList.remove('hidden');
    host.replaceChildren();
    const finish=document.createElement('button');
    finish.type='button';finish.className='btn combat-stop-btn';finish.textContent='Avsluta strid';
    finish.disabled=combatStopBusy;
    finish.onclick=()=>window.combatFinishAndRecover();
    host.append(finish);
  };
  combatSelectedSceneId=null;
  window.loadCombatRuntimeBackground=async()=>{
    combatRuntimeMapUrl=context.map.image_url;
    combatRuntimeMapMeta={width:context.map.width,height:context.map.height,name:context.map.name};
    combatRuntimeMapError='';
  };
  document.body.classList.add('adventure-encounter-document');
  document.querySelectorAll('main > section').forEach(el=>el.classList.toggle('hidden',el.id!=='combatPage'));
  const finish=combatFinishAndRecover;
  window.combatFinishAndRecover=async()=>{
    context.finishing(true);
    try {await finish();}
    finally {context.finishing(false);await context.refresh();}
  };
  await loadActiveCombat(context.id);
  if(context.gm)window.aleaReturnToExploration=()=>window.combatFinishAndRecover();
  combatStartPlayerSync();
}
window.aleaEnterEmbeddedEncounter=enterEmbeddedEncounter;
