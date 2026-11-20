/* ARES: universal single-hex visual overlay. Classic SVG remains the hit target. */
(function(root){
 'use strict';
 const resolver=root.aleaCombatPaperDollResolver;
 const BASE_WIDTH=100.1;
 const STANDARD_BASE='arcane-bronze-ivory-pointed-hex-high-angle';
 let assets={},loading=null,ready=false,poseRows=new Map(),poseLoading=null,racePoseRows=new Map(),races=[];
 const mapBounds=new Map(),pendingBounds=new Map();
 const failed=new Set(),checked=new Set();
 function load(){
  if(loading)return loading;
  if(ready||!resolver||!root.aleaArcanePaperDollAssets||typeof dbJson!=='function'||typeof SUPABASE_URL==='undefined')return;
  loading=root.aleaArcanePaperDollAssets.load({dbJson,baseUrl:SUPABASE_URL}).then(result=>{
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
   const poses=loadPublishedPoses();
   loadPublishedRacePoses();
   if(typeof renderCombat==='function')renderCombat();
   return poses;
  }).catch(err=>{console.warn('ARES systembilder kunde inte laddas',err)})
    .finally(()=>{loading=null});
  return loading;
 }
 function loadPublishedPoses(){
  if(poseLoading)return poseLoading;
  if(typeof dbJson!=='function')return;
  poseLoading=dbJson('combatant_battle_poses?select=combatant_type,combatant_id,pose_key,image_path,base_key,mounting_profile&publication_status=eq.published&is_active=eq.true')
   .then(rows=>{
    const next=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
     if(!row.image_path||!/^hermes\/[a-z0-9/_-]+\/[a-f0-9]{64}\.webp$/.test(row.image_path))continue;
     next.set(row.combatant_type+':'+row.combatant_id+':'+row.pose_key,row);
    }
    poseRows=next;
    if(typeof renderCombat==='function')renderCombat();
   }).catch(error=>console.warn('ARES published poses unavailable; using classic fallback',error))
    .finally(()=>{poseLoading=null});
  return poseLoading;
 }
 function loadPublishedRacePoses(){
  if(typeof dbJson!=='function')return;
  Promise.all([
   dbJson('rule_races?select=id,name'),
   dbJson('race_battle_poses?select=race_id,gender_variant,pose_key,image_path,base_key,mounting_profile,is_active,publication_status&publication_status=eq.published&is_active=eq.true')
  ]).then(([raceList,rows])=>{
   races=Array.isArray(raceList)?raceList:[];
   racePoseRows=new Map();
   for(const row of Array.isArray(rows)?rows:[]){
    if(!row.image_path||!row.image_path.startsWith('hermes/race-battle-pose-cutout/')||!row.image_path.endsWith('.webp'))continue;
    const key=row.race_id+':'+row.gender_variant+':'+row.pose_key;
    racePoseRows.set(key,row);
   }
   if(typeof renderCombat==='function')renderCombat();
  }).catch(error=>console.warn('ARES race poses unavailable; retaining own/portrait fallback',error));
 }
 function publishedPose(actor){
  const type=String(actor?.source_type||'');
  const id=String(actor?.source_id||'');
  if(!id)return null;
  const aliases=type==='npc'?['campaign-npc','global-npc','character-npc']:type==='character'?['character','character-npc']:type==='monster'?['monster','enemy']:[type];
  let equipment={};
  if(type==='character'&&typeof chars!=='undefined'){
   const source=(chars||[]).find(c=>String(c?._dbId||c?.id||'')===id);
   equipment=root.aleaBattlePoseCatalog?.fromCharacter(source)||{};
  }
  if(type!=='character')equipment=root.aleaBattlePoseCatalog?.fromCombatant(actor)||{};
  const catalog=root.aleaBattlePoseCatalog;
  const requested=catalog?.resolve(equipment,[])?.requestedPoseId;
  // Resolve across all aliases by priority, not by whichever alias appears first.
  for(const key of [...new Set([requested,'standard'])]){
   for(const kind of aliases){
    const row=poseRows.get(kind+':'+id+':'+key);
    if(row)return row;
   }
  }
  return inheritedPose(actor,equipment,aliases,id);
 }
 function inheritedPose(actor,equipment,aliases,id){
  const catalog=root.aleaBattlePoseCatalog;
  if(!catalog?.resolveHierarchy||actor?.source_type==='character')return null;
  const own=[];
  for(const kind of aliases)for(const p of catalog.POSES||[]){const row=poseRows.get(kind+':'+id+':'+p.id);if(row)own.push(row)}
  const state=actor?.state||{};
  const profile=state.attack_profile||{};
  const raceId=catalog.raceIdFor({race_id:actor?.race_id||state.race_id||profile.race_id,race:actor?.race||state.race||profile.race||profile.attributes?.race||state.attributes?.race},races);
  if(!raceId)return null;
  const inherited=[];
  for(const row of racePoseRows.values())if(row.race_id===raceId)inherited.push(row);
  return catalog.resolveHierarchy({actorType:actor?.source_type==='monster'?'monster':'npc',equipment,ownPoses:own,racePoses:inherited,gender:actor?.gender||state.gender||profile.gender||profile.attributes?.gender||state.attributes?.gender}).pose;
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
 function measureMapArt(src){
  if(mapBounds.has(src))return Promise.resolve();
  if(pendingBounds.has(src))return pendingBounds.get(src);
  const pending=new Promise(resolve=>{
   const img=new Image();
   img.crossOrigin='anonymous';
   img.onerror=()=>resolve(null);
   img.onload=()=>{
    try{
     const canvas=document.createElement('canvas');
     const width=canvas.width=img.naturalWidth, height=canvas.height=img.naturalHeight;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(img,0,0);
     const pixels=ctx.getImageData(0,0,width,height).data;
     let left=width,top=height,right=-1,bottom=-1;
     for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(pixels[(y*width+x)*4+3]===0)continue;
      left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
     }
     resolve(right<0?null:{left,top,width:right-left+1,height:bottom-top+1,imageWidth:width,imageHeight:height});
    }catch{resolve(null)}
   };
   img.src=src;
  }).then(bounds=>{mapBounds.set(src,bounds);pendingBounds.delete(src)});
  pendingBounds.set(src,pending);
  return pending;
 }
 function mapArt(src,x,bottom,width,height,base=false){
  const bounds=mapBounds.get(src);
  if(!bounds)return '<image href="'+esc(src)+'" x="'+x+'" y="'+(bottom-height)+'" width="'+width+'" height="'+height+'" preserveAspectRatio="xMidYMid meet"/>';
  const scale=base?width/bounds.width:Math.min(width/bounds.width,height/bounds.height);
  const visibleWidth=bounds.width*scale,visibleHeight=bounds.height*scale;
  return '<svg x="'+(x+(width-visibleWidth)/2)+'" y="'+(bottom-visibleHeight)+'" width="'+visibleWidth+'" height="'+visibleHeight+
   '" viewBox="'+[bounds.left,bounds.top,bounds.width,bounds.height].join(' ')+'" overflow="hidden"><image href="'+esc(src)+
   '" width="'+bounds.imageWidth+'" height="'+bounds.imageHeight+'"/></svg>';
 }
 function render(classic,actor,cell,g,stateClasses='',mapBaseWidth,collectArt,allowStand=false){
  // Preserve the combat engine's defeated skull/base instead of drawing an upright paper doll.
  if(actor?.status==='dead')return classic;
  if(!ready){load();return classic}
  const mapToken=Number.isFinite(mapBaseWidth)&&mapBaseWidth>0;
  if(!mapToken&&typeof combatFootprintShape!=='function')return classic;
  const published=publishedPose(actor);
  const profile=published?.mounting_profile||{},cutout=profile.cutout||{},baseProfile=profile.base||{};
  // All single-hex combatants use High Angle regardless of the pose's workshop base.
  // Fall back to the original base only while High Angle is unavailable.
  const baseAsset=assets[STANDARD_BASE]?.src?assets[STANDARD_BASE]:assets[resolver.BASE];
  if(mapToken&&!assets[STANDARD_BASE]?.src)return '';
  const chosenAssets={...assets,[resolver.BASE]:baseAsset};
  const publicPose=published?.image_path&&typeof SUPABASE_URL==='string'?SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+published.image_path:'';
  const selected=resolver.resolve(actor,{assets:chosenAssets,footprint:mapToken?'single':combatFootprintShape(actor),battlePoseUrl:publicPose||pose(actor),portraitUrl:portrait(actor)});
  if(mapToken&&selected.mode!=='battle-pose'&&!(allowStand&&selected.mode==='portrait-stand'))return '';
  if(mapToken&&collectArt)collectArt(selected.baseUrl,selected.mode==='battle-pose'?selected.poseUrl:selected.standUrl);
  if(selected.mode==='classic')return classic;
  // One base occupies the same hex as the classic marker; no hit geometry changes.
  // SCALE STANDARD: fit the visible High Angle base footprint to the map hex.
  const unit=mapToken?mapBaseWidth/BASE_WIDTH:g.size/42,baseWidth=BASE_WIDTH,baseHeight=66.03,baseY=9;
  const standHeight=99,standWidth=66,standBottom=baseY-7;
  const standTop=standBottom-standHeight;
  const poseScale=selected.mode==='battle-pose'&&published?Math.max(.2,Math.min(1.5,Number(cutout.scale??65)/65)):1;
  const poseX=selected.mode==='battle-pose'&&published?Math.max(-80,Math.min(80,Number(cutout.x??0)))*.4:0;
  const poseY=selected.mode==='battle-pose'&&published?Math.max(-80,Math.min(80,Number(cutout.y??0)))*.4:0;
  // SCALE STANDARD V1.1: one-hex base size is global, never per-combatant.
  const baseScale=1;
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
  // BASE AURA V1: optional presentation layer; gold takes priority over allegiance.
  const allegiance=actor?.side==='enemies'?'enemy':actor?.side==='neutral'?'npc':actor?.side==='heroes'?'hero':'npc';
  const auraClass=/\b(?:selected|active-turn)\b/.test(stateClasses)?'gold':allegiance;
  const aura='<ellipse class="combat-base-aura combat-base-aura--'+auraClass+'" cx="0" cy="13" rx="42" ry="11"/>';
  const overlay='<g class="combat-paper-doll-universal'+stateClasses+'" transform="translate('+cell.x+' '+cell.y+') scale('+(mapToken?unit:unit.toFixed(4))+')" pointer-events="none" aria-hidden="true">'+
   aura+
   (mapToken?mapArt(selected.baseUrl,-baseWidth/2,baseY+baseHeight*.37,baseWidth,baseHeight,true):
    '<image href="'+esc(selected.baseUrl)+'" x="'+(-baseWidth*baseScale/2)+'" y="'+(baseY-baseHeight*.63*baseScale)+'" width="'+(baseWidth*baseScale)+'" height="'+(baseHeight*baseScale)+'" preserveAspectRatio="xMidYMid meet"/>')+
   (isStand&&selected.portraitUrl?'<defs><clipPath id="'+clip+'"><ellipse cx="'+(portraitX+portraitW/2)+'" cy="'+(portraitY+portraitH/2)+'" rx="'+(portraitW/2)+'" ry="'+(portraitH/2)+'"/></clipPath></defs>'+
    '<image href="'+esc(selected.portraitUrl)+'" x="'+portraitX+'" y="'+portraitY+'" width="'+portraitW+'" height="'+portraitH+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+clip+')"/>':'')+
   (mapToken?mapArt(art,-artWidth/2+poseX,standBottom-poseY,artWidth,artHeight):
    '<image href="'+esc(art)+'" x="'+(-artWidth/2+poseX)+'" y="'+(standBottom-artHeight-poseY)+'" width="'+artWidth+'" height="'+artHeight+'" preserveAspectRatio="xMidYMid meet"/>')+


   '</g>';
  return mapToken?overlay:'<g class="combat-paper-doll-classic">'+classic+'</g>'+overlay;
 }
 function mapBaseWidth(pixelsPerMeter){
  return .60*pixelsPerMeter;
 }
 function renderHeroMapToken(character,pixelsPerMeter,active=false){
  return root.aleaHeroClassField?.fieldHeroSvg(character,pixelsPerMeter,assets,{active})||'';
 }
 function renderBattleToken(classic,actor,cell,g,stateClasses,heroClass=false){
  if(heroClass&&g.pixelsPerMeter&&actor.source_type==='character'&&root.aleaHeroClassField){
   if(actor.status==='dead')return classic;
   const source=typeof chars!=='undefined'&&(chars||[]).find(row=>String(row?._dbId||row?.id)===String(actor.source_id));
   const character=source||{name:actor.name_snapshot};
   if(root.aleaHeroClassField.fieldHeroId(character)){
    if(!ready)load();
    const active=/\b(?:selected|active-turn)\b/.test(stateClasses);
    const figure=root.aleaHeroClassField.fieldHeroSvg(character,g.pixelsPerMeter,assets,{active,markerFallback:true});
    return '<g class="combat-paper-doll-classic">'+classic+'</g><g transform="translate('+cell.x+' '+cell.y+')">'+figure+'</g>';
   }
  }
  if(!g.pixelsPerMeter||actor.status==='dead'||combatFootprintShape(actor)!=='single'){
   return render(classic,actor,cell,g,stateClasses);
  }
  const overlay=render('',actor,cell,g,stateClasses,mapBaseWidth(g.pixelsPerMeter),(base,pose)=>{
   const missing=[base,pose].filter(src=>src&&!mapBounds.has(src)&&!pendingBounds.has(src));
   if(missing.length)Promise.all(missing.map(measureMapArt)).then(()=>{
    if(typeof renderCombat==='function'&&typeof document!=='undefined'&&document.querySelector?.('#combatPage:not(.hidden)'))renderCombat();
   });
  },true);
  return overlay?'<g class="combat-paper-doll-classic">'+classic+'</g>'+overlay:classic;
 }
 function renderMapToken(characterId,baseWidth,collectArt){
  if(!Number.isFinite(baseWidth)||baseWidth<=0)return '';
  return render('',{id:characterId,source_type:'character',source_id:characterId,side:'heroes'},{x:0,y:0},null,'',baseWidth,collectArt);
 }
 function loadMapTokens(){
  return loading || (ready ? loadPublishedPoses() : load()) || Promise.resolve();
 }
 function prepareMapToken(characterId){
  let pending=[];
  renderMapToken(characterId,BASE_WIDTH,(base,pose)=>{pending=[measureMapArt(base),measureMapArt(pose)]});
  return Promise.all(pending);
 }
 root.aleaCombatPaperDollMap=Object.freeze({render,renderBattleToken,renderHeroMapToken,mapBaseWidth,load,renderMapToken,loadMapTokens,prepareMapToken});
})(globalThis);
