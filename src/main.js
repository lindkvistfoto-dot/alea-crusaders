import "./features/dice/dice3d.js";
import "../features/material/library.js?v=0.34.79";

const TRANSPARENT_HIT_CAMERA={
  head:{scale:2.5,tx:-75,ty:19},
  chest:{scale:2.05,tx:-52.5,ty:-11.5},
  abdomen:{scale:2.0,tx:-50,ty:-40},
  right_arm:{scale:1.9,tx:-5,ty:-20},
  left_arm:{scale:1.9,tx:-85,ty:-20},
  right_leg:{scale:1.55,tx:-12,ty:-59},
  left_leg:{scale:1.55,tx:-43,ty:-59}
};
let transparentHitMaskSeq=0;

function transparentHitEscAttr(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

/*
 * v0.33.63
 * The bundled anatomical source is a rectangular WebP. Render it inside the
 * exact SVG body outline so the pale rectangle becomes transparent and the
 * combat HUD background shows directly around the body silhouette.
 */
window.combatHitLocationFigureHtml=function(hitLocation){
  const active=String(hitLocation?.key||"");
  const model=window.ALEA_HIT_BODY_MODEL?.src||"";
  const data=window.ALEA_HIT_BODY_ZONES||null;
  const zone=data?.zones?.[active];
  const outline=String(data?.outline||"");
  const viewBox=String(data?.viewBox||"0 0 1024 1536");
  const camera=TRANSPARENT_HIT_CAMERA[active]||{scale:1,tx:0,ty:0};

  if(!model||!zone||!outline){
    return '<div class="combat-hit-model-stage"><div class="combat-hit-model-missing">Kroppsmodell eller träffzon saknas</div></div>';
  }

  const uid="combatHitTransparent_"+(++transparentHitMaskSeq);
  const clipId=uid+"_clip";
  const zonePaths=(zone.paths||[]).map(d=>'<path d="'+d+'"/>').join("");
  const cameraStyle="--hit-scale:"+camera.scale+";--hit-tx:"+camera.tx+"%;--hit-ty:"+camera.ty+"%";

  return '<div class="combat-hit-model-stage">'+
    '<div class="combat-hit-camera" style="'+cameraStyle+'">'+
      '<svg class="combat-hit-model-overlay" viewBox="'+transparentHitEscAttr(viewBox)+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Träffområde '+transparentHitEscAttr(hitLocation?.label||"")+'">'+
        '<defs><clipPath id="'+clipId+'" clipPathUnits="userSpaceOnUse"><path d="'+outline+'"/></clipPath></defs>'+
        '<image class="combat-hit-model-image-svg" href="'+model+'" x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" clip-path="url(#'+clipId+')" aria-hidden="true"/>'+
        '<g class="combat-hit-zone-fill" clip-path="url(#'+clipId+')">'+zonePaths+'</g>'+
      '</svg>'+
    '</div>'+
  '</div>';
};


/* v0.33.65 — image-only hit location camera */
window.combatHitLocationResultHtml=function(){
  return "";
};

window.combatHitLocationCameraHtml=function(hitLocation){
  if(!hitLocation?.label)return "";
  return '<aside class="combat-attack-hit-camera" aria-label="Träffkamera">'+
    '<div class="combat-hit-figure-wrap">'+window.combatHitLocationFigureHtml(hitLocation)+'</div>'+
    '<div class="combat-hit-location-label">'+transparentHitEscAttr(hitLocation.label)+'</div>'+
  '</aside>';
};

/* v0.33.66 — compact attack result layout */
window.combatHitLocationCameraHtml=function(hitLocation){
  if(!hitLocation?.label)return "";
  return '<aside class="combat-attack-hit-camera" aria-label="Träffkamera">'+
    '<div class="combat-hit-figure-wrap">'+window.combatHitLocationFigureHtml(hitLocation)+'</div>'+
    '<div class="combat-hit-location-label">'+transparentHitEscAttr(hitLocation.label)+'</div>'+
  '</aside>';
};

window.combatAttackResultHtml=function(action){
  if(!action||action.action_type!=="attack"||!action.result?.outcome)return "";
  const result=action.result;
  const outcome=result.outcome;
  const full=result.full_damage===true;
  const meta=window.combatOutcomeMeta(outcome);
  const hasHit=!!result.hit_location?.label;
  return '<div class="combat-attack-result '+transparentHitEscAttr(outcome)+(hasHit?' has-hit-camera':'')+'">'+
    '<div class="combat-attack-result-main">'+
      '<div class="combat-attack-result-heading outcome-only"><b><i class="combat-result-icon" aria-hidden="true">'+meta.icon+'</i>'+transparentHitEscAttr(meta.label)+'</b></div>'+
      (full?'<div class="combat-full-damage-inline">FULL SKADA</div>':'')+
      '<div class="combat-attack-result-rolls"><span>T20 <b>'+result.roll+'</b> mot FV <b>'+result.fv+'</b></span>'+
        (result.confirmation_roll!=null?'<span>Kontrollslag <b>'+result.confirmation_roll+'</b></span>':'')+
      '</div>'+
      window.combatHitLocationResultHtml(result.hit_location)+
      (result.erf&&(result.erf.awarded>0||!result.erf.locked)
        ?'<div class="combat-erf-result '+(result.erf.awarded>0?'gained':'locked')+'">'+
          (result.erf.awarded>0
            ?'<b>+'+result.erf.awarded+' ERF</b>'+(result.erf.erf_roll!=null?' · 1T3 '+result.erf.erf_roll+' + 1':'')
            :transparentHitEscAttr(result.erf.message||'Ingen ny ERF'))+
         '</div>'
        :'')+
      window.combatFumbleResultHtml(result)+
      window.combatParryResultHtml(result)+
      window.combatDamageResultHtml(result.damage)+
    '</div>'+
    window.combatHitLocationCameraHtml(result.hit_location)+
  '</div>';
};

/* v0.33.68 — one-turn GM undo */
const COMBAT_UNDO_CURRENT_KEY="turn_undo_current";
const COMBAT_UNDO_LAST_KEY="turn_undo_last";
let combatUndoCapturePromise=null;
let combatUndoTransitioning=false;
let combatUndoRestoring=false;

function combatUndoClone(value){
  if(value==null)return value;
  try{return structuredClone(value)}catch(_error){}
  return JSON.parse(JSON.stringify(value));
}

function combatUndoSettings(){
  const settings=(typeof activeCombat!=="undefined"&&activeCombat?.settings&&typeof activeCombat.settings==="object")
    ?combatUndoClone(activeCombat.settings):{};
  return settings||{};
}

function combatUndoCombatantSnapshot(row){
  return {
    id:row.id,q:row.q,r:row.r,flying:row.flying,
    visible_to_players:row.visible_to_players,
    current_kp:row.current_kp,current_psy:row.current_psy,
    movement_remaining:row.movement_remaining,status:row.status,
    action_plan:combatUndoClone(row.action_plan||[]),
    state:combatUndoClone(row.state||{})
  };
}

function combatUndoActionSnapshot(row){
  return {
    id:row.id,combat_id:row.combat_id,campaign_id:row.campaign_id,
    combatant_id:row.combatant_id,round_number:row.round_number,
    phase:row.phase,action_type:row.action_type,slot_key:row.slot_key||"",
    source_data:combatUndoClone(row.source_data||{}),
    target_combatant_id:row.target_combatant_id||null,status:row.status,
    sequence:Number(row.sequence)||0,result:combatUndoClone(row.result||{}),
    player_visible:row.player_visible!==false,created_by:row.created_by||null
  };
}

function combatUndoBuildSnapshot(){
  if(typeof activeCombat==="undefined"||!activeCombat?.id||!activeCombat.active_actor_id)return null;
  const actor=(typeof combatants!=="undefined"?combatants:[]).find(row=>String(row.id)===String(activeCombat.active_actor_id));
  const logs=Array.isArray(typeof combatLogRows!=="undefined"?combatLogRows:null)?combatLogRows:[];
  const maxLogId=logs.reduce((max,row)=>Math.max(max,Number(row?.id)||0),0);
  return {
    version:2,turn_start:true,captured_at:new Date().toISOString(),combat_id:activeCombat.id,
    actor_id:activeCombat.active_actor_id,actor_name:actor?.name_snapshot||"Okänd",
    round_number:Number(activeCombat.round_number)||1,phase:activeCombat.phase||"movement",
    active_actor_id:activeCombat.active_actor_id,active_responder_id:activeCombat.active_responder_id||null,
    initiative:combatUndoClone(activeCombat.initiative||{}),
    combatants:(Array.isArray(typeof combatants!=="undefined"?combatants:null)?combatants:[]).map(combatUndoCombatantSnapshot),
    actions:(Array.isArray(typeof combatActions!=="undefined"?combatActions:null)?combatActions:[]).map(combatUndoActionSnapshot),
    area_effects:(Array.isArray(typeof combatAreaEffects!=="undefined"?combatAreaEffects:null)?combatAreaEffects:[]).map(row=>({
      id:row.id,center_q:row.center_q,center_r:row.center_r,radius:row.radius,
      applied_round:row.applied_round,expires_round:row.expires_round,status:row.status,
      parameters:combatUndoClone(row.parameters||{}),source_combatant_id:row.source_combatant_id||null
    })),
    log_max_id:maxLogId
  };
}

async function combatUndoPersistSettings(patch){
  if(typeof activeCombat==="undefined"||!activeCombat?.id)return null;
  const settings={...combatUndoSettings(),...combatUndoClone(patch)};
  activeCombat.settings=settings;
  await dbJson("combat_instances?id=eq."+encodeURIComponent(activeCombat.id),{
    method:"PATCH",headers:{"Prefer":"return=minimal"},
    body:JSON.stringify({settings,updated_at:new Date().toISOString()})
  });
  return settings;
}

function combatUndoSnapshotMatchesActiveTurn(snapshot){
  if(!snapshot||snapshot.turn_start!==true)return false;
  if(typeof activeCombat==="undefined"||!activeCombat?.id||!activeCombat.active_actor_id)return false;
  if(String(snapshot.combat_id)!==String(activeCombat.id))return false;
  if(String(snapshot.actor_id)!==String(activeCombat.active_actor_id))return false;
  if(Number(snapshot.round_number)!==Number(activeCombat.round_number))return false;
  return true;
}

function combatUndoActiveTurnAlreadyStarted(){
  if(typeof activeCombat==="undefined"||!activeCombat?.active_actor_id)return false;
  const actorId=String(activeCombat.active_actor_id),round=Number(activeCombat.round_number)||1;
  const hasAction=(Array.isArray(typeof combatActions!=="undefined"?combatActions:null)?combatActions:[]).some(action=>
    String(action.combatant_id)===actorId&&Number(action.round_number)===round&&action.status!=="cancelled"
  );
  if(hasAction)return true;
  const actor=(Array.isArray(typeof combatants!=="undefined"?combatants:null)?combatants:[])
    .find(row=>String(row.id)===actorId);
  if(actor&&typeof combatMovementMaximum==="function"&&typeof combatMovementBudget==="function"){
    const max=Number(combatMovementMaximum(actor))||0;
    const left=Number(combatMovementBudget(actor))||0;
    if(max>0&&left<max)return true;
  }
  return false;
}

async function combatUndoEnsureCurrentSnapshot(){
  if(combatUndoTransitioning||combatUndoRestoring)return null;
  if(typeof combatCanManage!=="function"||!combatCanManage())return null;
  if(typeof activeCombat==="undefined"||!activeCombat?.id||activeCombat.status!=="active"||!activeCombat.active_actor_id)return null;
  const settings=combatUndoSettings();
  const existing=settings[COMBAT_UNDO_CURRENT_KEY];
  if(existing&&combatUndoSnapshotMatchesActiveTurn(existing))return existing;
  if(combatUndoActiveTurnAlreadyStarted())return null;
  if(combatUndoCapturePromise)return combatUndoCapturePromise;
  const snapshot=combatUndoBuildSnapshot();
  if(!snapshot)return null;
  combatUndoCapturePromise=(async()=>{
    const last=await dbJson("combat_area_events?combat_id=eq."+encodeURIComponent(snapshot.combat_id)+"&select=id&order=id.desc&limit=1");
    snapshot.area_event_max_id=Number(last?.[0]?.id)||0;
    await combatUndoPersistSettings({[COMBAT_UNDO_CURRENT_KEY]:snapshot});
    return snapshot;
  })()
    .catch(error=>{console.warn("Kunde inte spara ångra-snapshot",error);return null})
    .finally(()=>{combatUndoCapturePromise=null;combatUndoInstallButton()});
  return combatUndoCapturePromise;
}

async function combatUndoPromoteCompleted(snapshot){
  if(!snapshot||typeof activeCombat==="undefined"||!activeCombat?.id)return;
  await combatUndoPersistSettings({
    [COMBAT_UNDO_LAST_KEY]:snapshot,
    [COMBAT_UNDO_CURRENT_KEY]:null
  });
}

function combatUndoInstallButton(){
  const topbar=document.querySelector("#combatPage .combat-topbar");
  if(!topbar)return;
  topbar.querySelector(".combat-undo-row")?.remove();
  const button=topbar.querySelector(".combat-turn-undo-btn");
  if(!button)return;
  const canManage=typeof combatCanManage==="function"&&combatCanManage();
  if(!canManage){
    button.hidden=true;
    return;
  }
  button.hidden=false;
  const last=(typeof activeCombat!=="undefined"&&activeCombat?.settings&&typeof activeCombat.settings==="object")
    ?activeCombat.settings[COMBAT_UNDO_LAST_KEY]:null;
  const disabled=!last||combatUndoRestoring;
  const label=last?.actor_name?"Ångra senaste drag · "+last.actor_name:"Ångra senaste drag";
  if(button.disabled!==disabled)button.disabled=disabled;
  if(button.title!==label)button.title=label;
  if(button.getAttribute("aria-label")!==label)button.setAttribute("aria-label",label);
}

window.combatUndoBeforeActorAction=async function(){
  return combatUndoEnsureCurrentSnapshot();
};

window.combatUndoAfterTurnAdvanced=async function(snapshot){
  combatUndoTransitioning=true;
  try{
    if(snapshot&&combatUndoSnapshotMatchesActiveTurn(snapshot)===false){
      // Snapshot belongs to the actor who just completed the turn; active turn has already advanced.
    }
    if(snapshot){
      try{await combatUndoPromoteCompleted(snapshot)}
      catch(error){console.warn("Kunde inte markera senaste drag för ångra",error)}
    }else{
      const settings=combatUndoSettings();
      if(settings[COMBAT_UNDO_CURRENT_KEY]){
        await combatUndoPersistSettings({[COMBAT_UNDO_CURRENT_KEY]:null});
      }
    }
  }finally{
    combatUndoTransitioning=false;
  }
  await combatUndoEnsureCurrentSnapshot();
  combatUndoInstallButton();
};

window.undoLastCombatTurn=async function(event){
  event?.stopPropagation?.();
  if(combatUndoRestoring||typeof combatCanManage!=="function"||!combatCanManage())return;
  if(typeof activeCombat==="undefined"||!activeCombat?.id)return;
  const snapshot=combatUndoSettings()[COMBAT_UNDO_LAST_KEY];
  if(!snapshot||String(snapshot.combat_id)!==String(activeCombat.id))return;
  if(combatUndoActiveTurnAlreadyStarted()){
    alert("Du kan inte ångra föregående drag efter att nästa kombatant börjat agera.");
    return;
  }
  const actorName=snapshot.actor_name||"senaste kombatanten";
  if(!window.confirm("Ångra hela senaste draget för "+actorName+"?"))return;
  combatUndoRestoring=true;combatUndoInstallButton();
  const combatId=activeCombat.id,cid=encodeURIComponent(combatId);
  try{
    const currentActions=await dbJson("combat_actions?combat_id=eq."+cid+"&select=id,round_number");
    const baselineActions=new Map((snapshot.actions||[]).map(row=>[String(row.id),row]));
    const currentIds=new Set((currentActions||[]).map(row=>String(row.id)));
    const removals=(currentActions||[]).filter(row=>{
      const round=Number(row.round_number)||0;
      return round>Number(snapshot.round_number)||(
        round===Number(snapshot.round_number)&&!baselineActions.has(String(row.id))
      );
    });
    await Promise.all(removals.map(row=>dbJson("combat_actions?id=eq."+encodeURIComponent(row.id),{
      method:"DELETE",headers:{"Prefer":"return=minimal"}
    })));
    for(const action of snapshot.actions||[]){
      const body={
        phase:action.phase,action_type:action.action_type,slot_key:action.slot_key||"",
        source_data:action.source_data||{},target_combatant_id:action.target_combatant_id||null,
        status:action.status,sequence:Number(action.sequence)||0,result:action.result||{},
        player_visible:action.player_visible!==false,updated_at:new Date().toISOString()
      };
      if(currentIds.has(String(action.id))){
        await dbJson("combat_actions?id=eq."+encodeURIComponent(action.id),{
          method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(body)
        });
      }else{
        await dbJson("combat_actions",{
          method:"POST",headers:{"Prefer":"return=minimal"},
          body:JSON.stringify({
            id:action.id,combat_id:action.combat_id,campaign_id:action.campaign_id,
            combatant_id:action.combatant_id,round_number:action.round_number,
            ...body,created_by:action.created_by||null
          })
        });
      }
    }
    // Restore coordinates in transaction-local trigger-suppressed RPC calls.
    await Promise.all((snapshot.combatants||[]).map(row=>dbJson("rpc/haj_restore_combatant",{
      method:"POST",headers:{"Prefer":"return=representation"},
      body:JSON.stringify({p_combatant_id:row.id,p_snapshot:row})
    })));
    if(Array.isArray(snapshot.area_effects)){
      const currentAreas=await dbJson("combat_area_effects?combat_id=eq."+cid+"&select=id");
      const originalById=new Map(snapshot.area_effects.map(row=>[String(row.id),row]));
      await Promise.all((currentAreas||[]).filter(row=>!originalById.has(String(row.id))).map(row=>
        dbJson("combat_area_effects?id=eq."+encodeURIComponent(row.id)+"&combat_id=eq."+cid,{
          method:"DELETE",headers:{"Prefer":"return=minimal"}
        })
      ));
      await Promise.all(snapshot.area_effects.map(row=>
        dbJson("combat_area_effects?id=eq."+encodeURIComponent(row.id)+"&combat_id=eq."+cid,{
          method:"PATCH",headers:{"Prefer":"return=minimal"},
          body:JSON.stringify({
            center_q:row.center_q,center_r:row.center_r,radius:row.radius,
            applied_round:row.applied_round,expires_round:row.expires_round,
            source_combatant_id:row.source_combatant_id,status:row.status,
            parameters:row.parameters||{},updated_at:new Date().toISOString()
          })
        })
      ));
    }
    if(Number.isSafeInteger(snapshot.area_event_max_id)&&snapshot.area_event_max_id>=0){
      await dbJson("combat_area_events?combat_id=eq."+cid+"&id=gt."+snapshot.area_event_max_id,{
        method:"DELETE",headers:{"Prefer":"return=minimal"}
      });
    }
    const logMax=Math.max(0,Number(snapshot.log_max_id)||0);
    await dbJson("combat_log?combat_id=eq."+cid+"&id=gt."+logMax,{
      method:"DELETE",headers:{"Prefer":"return=minimal"}
    });
    const restoredSettings={...combatUndoSettings(),
      [COMBAT_UNDO_LAST_KEY]:null,
      [COMBAT_UNDO_CURRENT_KEY]:snapshot
    };
    await dbJson("combat_instances?id=eq."+cid,{
      method:"PATCH",headers:{"Prefer":"return=minimal"},
      body:JSON.stringify({
        active_actor_id:snapshot.active_actor_id||snapshot.actor_id,
        active_responder_id:snapshot.active_responder_id||null,
        round_number:Number(snapshot.round_number)||1,
        phase:snapshot.phase||"movement",
        initiative:snapshot.initiative||{},
        settings:restoredSettings,
        updated_at:new Date().toISOString()
      })
    });
    await dbJson("combat_log",{
      method:"POST",headers:{"Prefer":"return=minimal"},
      body:JSON.stringify({
        combat_id:combatId,campaign_id:centralCampaignId,
        round_number:Number(snapshot.round_number)||1,phase:snapshot.phase||"movement",
        actor_id:snapshot.actor_id||null,target_id:null,event_type:"turn_undo",
        message:"SL ångrade "+actorName+"s senaste drag",
        details:{undone_actor_id:snapshot.actor_id,captured_at:snapshot.captured_at},
        player_visible:true
      })
    });
    await loadActiveCombat(combatId);
  }catch(error){
    console.error("Kunde inte ångra senaste draget",error);
    alert("Kunde inte ångra senaste draget: "+(error?.message||error));
  }finally{
    combatUndoRestoring=false;
    combatUndoInstallButton();
  }
};

const combatUndoBody=document.getElementById("combatBody");
if(combatUndoBody){
  const combatUndoObserver=new MutationObserver(()=>{
    combatUndoInstallButton();
    queueMicrotask(()=>combatUndoEnsureCurrentSnapshot());
  });
  // Observe only replacement of the combat body's direct children.
  // Observing the subtree caused the undo button's own text updates to
  // retrigger this observer indefinitely and freeze the combat screen.
  combatUndoObserver.observe(combatUndoBody,{childList:true});
  combatUndoInstallButton();
  queueMicrotask(()=>combatUndoEnsureCurrentSnapshot());
}


/* v0.33.70 — prevent combat undo observer feedback loop */

/* v0.33.74 — integrated round-panel undo control */

/* v0.33.76 — reliable turn-start undo checkpoints */

/* v0.33.76 — immutable turn-start undo snapshots */

// Gimli material uploader mounts on the existing Administration page.
window.gimliMountAdmin?.();
window.bilboMountLibrary?.();
