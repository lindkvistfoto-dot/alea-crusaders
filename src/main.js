import "./features/dice/dice3d.js";

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
window.combatHitLocationCameraHtml=function(hitLocation,fullDamage=false){
  if(!hitLocation?.label)return "";
  return '<aside class="combat-attack-hit-camera" aria-label="Träffkamera">'+
    (fullDamage?'<div class="combat-hit-full-damage">FULL SKADA</div>':'')+
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
      '<div class="combat-attack-result-rolls"><span>T20 <b>'+result.roll+'</b> mot FV <b>'+result.fv+'</b></span>'+
        (result.confirmation_roll!=null?'<span>Kontrollslag <b>'+result.confirmation_roll+'</b></span>':'')+
      '</div>'+
      window.combatHitLocationResultHtml(result.hit_location)+
      (result.erf
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
    window.combatHitLocationCameraHtml(result.hit_location,full)+
  '</div>';
};

