/* ARES: universal single-hex visual overlay. Classic SVG remains the hit target. */
(function(root){
 'use strict';
 const resolver=root.aleaCombatPaperDollResolver;
 let assets={},loading=false,ready=false,poseRows=new Map(),poseLoading=false;
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
   loadPublishedPoses();
   if(typeof renderCombat==='function')renderCombat();
  }).catch(err=>{console.warn('ARES systembilder kunde inte laddas',err)})
    .finally(()=>{loading=false});
 }
 function loadPublishedPoses(){
  if(poseLoading||typeof dbJson!=='function')return;
  poseLoading=true;
  dbJson('combatant_battle_poses?select=combatant_type,combatant_id,pose_key,image_path,base_key,mounting_profile&publication_status=eq.published&is_active=eq.true')
   .then(rows=>{
    const next=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
     if(!row.image_path||!/^hermes\/[a-z0-9/_-]+\/[a-f0-9]{64}\.webp$/.test(row.image_path))continue;
     next.set(row.combatant_type+':'+row.combatant_id+':'+row.pose_key,row);
    }
    poseRows=next;
    if(typeof renderCombat==='function')renderCombat();
   }).catch(error=>console.warn('ARES published poses unavailable; using classic fallback',error))
    .finally(()=>{poseLoading=false});
 }
 function publishedPose(actor){
  const type=String(actor?.source_type||'');
  const id=String(actor?.source_id||'');
  if(!id)return null;
  const aliases=type==='npc'?['campaign-npc','global-npc','character-npc']:type==='character'?['character','character-npc']:type==='monster'?['monster','enemy']:[type];
  let requested='standard';
  if(type==='character'&&typeof chars!=='undefined'){
   const source=(chars||[]).find(c=>String(c?._dbId||c?.id||'')===id);
   const eq=source?.currentEquipment||{};
   const hands=[eq.leftHand,eq.rightHand].filter(Boolean);
   const armed=hands.find(h=>h.kind==='weapon');
   const item=(source?.weapons||[]).find(w=>String(w.equipId||w.id)===String(armed?.itemId||''));
   const hasShield=hands.some(h=>h.kind==='shield');
   const cls=String(item?.weaponClass||item?.skillId||'').toLowerCase();
   const family=/enhandsvard|enhands_svard/.test(cls)?'one_handed_sword':/dolk|dolkar/.test(cls)?'dagger':/yx/.test(cls)?'axe':/spjut/.test(cls)?'spear':/stav/.test(cls)?'staff':/pilbag|bow/.test(cls)?'bow':/armborst/.test(cls)?'crossbow':null;
   if(family)requested=family+(hasShield&&['one_handed_sword','dagger','axe','spear'].includes(family)?'_shield':'');
  }
  for(const key of [requested,'standard']){
   for(const kind of aliases){const row=poseRows.get(kind+':'+id+':'+key);if(row)return row}
  }
  return null;
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
  const published=publishedPose(actor);
  const profile=published?.mounting_profile||{},cutout=profile.cutout||{},baseProfile=profile.base||{};
  const baseAsset=published?.base_key&&assets[published.base_key]?.src?assets[published.base_key]:assets[resolver.BASE];
  const chosenAssets={...assets,[resolver.BASE]:baseAsset};
  const publicPose=published?.image_path&&typeof SUPABASE_URL==='string'?SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+published.image_path:'';
  const selected=resolver.resolve(actor,{assets:chosenAssets,footprint:combatFootprintShape(actor),battlePoseUrl:publicPose||pose(actor),portraitUrl:portrait(actor)});
  if(selected.mode==='classic')return classic;
  // One base occupies the same hex as the classic marker; no hit geometry changes.
  const unit=g.size/42,baseWidth=73,baseHeight=48,baseY=9;
  const standHeight=99,standWidth=66,standBottom=baseY-7;
  const standTop=standBottom-standHeight;
  const poseScale=selected.mode==='battle-pose'&&published?Math.max(.2,Math.min(1.5,Number(cutout.scale??65)/65)):1;
  const poseX=selected.mode==='battle-pose'&&published?Math.max(-80,Math.min(80,Number(cutout.x??0)))*.4:0;
  const poseY=selected.mode==='battle-pose'&&published?Math.max(-80,Math.min(80,Number(cutout.y??0)))*.4:0;
  const baseScale=published?Math.max(.2,Math.min(1.5,Number(baseProfile.scale??35)/35)):1;
  const artWidth=standWidth*poseScale,artHeight=standHeight*poseScale;
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
   '<image href="'+esc(selected.baseUrl)+'" x="'+(-baseWidth*baseScale/2)+'" y="'+(baseY-baseHeight*.63*baseScale)+'" width="'+(baseWidth*baseScale)+'" height="'+(baseHeight*baseScale)+'" preserveAspectRatio="xMidYMid meet"/>'+
   (isStand&&selected.portraitUrl?'<defs><clipPath id="'+clip+'"><ellipse cx="'+(portraitX+portraitW/2)+'" cy="'+(portraitY+portraitH/2)+'" rx="'+(portraitW/2)+'" ry="'+(portraitH/2)+'"/></clipPath></defs>'+
    '<image href="'+esc(selected.portraitUrl)+'" x="'+portraitX+'" y="'+portraitY+'" width="'+portraitW+'" height="'+portraitH+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clip+')"/>':'')+
   '<image href="'+esc(art)+'" x="'+(-artWidth/2+poseX)+'" y="'+(standBottom-artHeight-poseY)+'" width="'+artWidth+'" height="'+artHeight+'" preserveAspectRatio="xMidYMid meet"/>'+
   '<polygon points="'+combatHexPoints(0,0,39)+'" class="combat-paper-doll-universal-ring"/>'+
   '</g>';
  return '<g class="combat-paper-doll-classic">'+classic+'</g>'+overlay;
 }
 root.aleaCombatPaperDollMap=Object.freeze({render,load});
})(globalThis);
