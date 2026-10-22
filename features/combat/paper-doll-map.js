/* ARES: universal single-hex visual overlay. Classic SVG remains the hit target. */
(function(root){
 'use strict';
 const resolver=root.aleaCombatPaperDollResolver;
 let assets={},loading=false,ready=false;
 const failed=new Set(),checked=new Set();
 function load(){
  if(loading||ready||!resolver||!root.aleaArcanePaperDollAssets||typeof dbJson!=='function'||typeof SUPABASE_URL==='undefined')return;
  loading=true;
  root.aleaArcanePaperDollAssets.load({dbJson,baseUrl:SUPABASE_URL}).then(result=>{
   const next=resolver.assetsByKey(result);
   return Promise.all(Object.entries(next).map(([key,a])=>new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{checked.add(key);resolve([key,a])};
    img.onerror=()=>{failed.add(key);resolve(null)};
    img.src=a.src;
   })));
  }).then(rows=>{
   assets=Object.fromEntries(rows.filter(Boolean));
   ready=true;
   if(typeof renderCombat==='function')renderCombat();
  }).catch(err=>{console.warn('ARES systembilder kunde inte laddas',err)})
    .finally(()=>{loading=false});
 }
 function portrait(actor){
  if(typeof combatRowPortraitUrl!=='function')return '';
  return combatRowPortraitUrl(actor)||'';
 }
 function pose(actor){
  // Only an explicitly registered battle pose qualifies; combat icons are not poses.
  const state=actor?.state||{};
  const source=actor?.source_type==='character'&&typeof chars!=='undefined'?
   (chars||[]).find(c=>String(c?._dbId||c?.id||'')===String(actor.source_id||'')):null;
  return String(state.battle_pose_url||source?.battlePoseUrl||source?.battle_pose_url||'').trim();
 }
 function esc(value){return String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
 function render(classic,actor,cell,g,stateClasses=''){
  if(!ready){load();return classic}
  if(typeof combatFootprintShape!=='function')return classic;
  const selected=resolver.resolve(actor,{assets,footprint:combatFootprintShape(actor),battlePoseUrl:pose(actor),portraitUrl:portrait(actor)});
  if(selected.mode==='classic')return classic;
  // One base occupies the same hex as the classic marker; no hit geometry changes.
  const unit=g.size/42,baseWidth=73,baseHeight=48,baseY=9;
  const standHeight=99,standWidth=66,standBottom=baseY-7;
  const standTop=standBottom-standHeight;
  const actorId=String(actor?.id||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_');
  const clip='aresPortrait_'+actorId;
  const art=selected.mode==='battle-pose'?selected.poseUrl:selected.standUrl;
  const isStand=selected.mode==='portrait-stand';
  // Original 1024x1536: portrait opening approx x=285..739, y=165..608.
  // Display width=66, height=99, opening center=(33,25), radius~14.
  const portraitX=-standWidth/2+standWidth*(285/1024);
  const portraitY=standTop+standHeight*(165/1536);
  const portraitW=standWidth*(454/1024),portraitH=standHeight*(443/1536);
  const overlay='<g class="combat-paper-doll-universal'+stateClasses+'" transform="translate('+cell.x+' '+cell.y+') scale('+unit.toFixed(4)+')" pointer-events="none" aria-hidden="true">'+
   '<image href="'+esc(selected.baseUrl)+'" x="'+(-baseWidth/2)+'" y="'+(baseY-baseHeight*.63)+'" width="'+baseWidth+'" height="'+baseHeight+'" preserveAspectRatio="xMidYMid meet"/>'+
   (isStand&&selected.portraitUrl?'<defs><clipPath id="'+clip+'"><ellipse cx="'+(portraitX+portraitW/2)+'" cy="'+(portraitY+portraitH/2)+'" rx="'+(portraitW/2)+'" ry="'+(portraitH/2)+'"/></clipPath></defs>'+
    '<image href="'+esc(selected.portraitUrl)+'" x="'+portraitX+'" y="'+portraitY+'" width="'+portraitW+'" height="'+portraitH+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clip+')"/>':'')+
   '<image href="'+esc(art)+'" x="'+(-standWidth/2)+'" y="'+standTop+'" width="'+standWidth+'" height="'+standHeight+'" preserveAspectRatio="xMidYMid meet"/>'+
   '<polygon points="'+combatHexPoints(0,0,39)+'" class="combat-paper-doll-universal-ring"/>'+
   '</g>';
  return '<g class="combat-paper-doll-classic">'+classic+'</g>'+overlay;
 }
 root.aleaCombatPaperDollMap=Object.freeze({render,load});
})(globalThis);
