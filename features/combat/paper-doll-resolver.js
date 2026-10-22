/* ARES step 1: pure visual selection; does not change combat rendering. */
(function(root){
 'use strict';
 const BASE='arcane-paper-doll-hexagon-base';
 const STAND='arcane-portrait-stand-generic';
 function resolve(actor,options={}){
  if(!actor)return Object.freeze({mode:'classic',reason:'missing-actor'});
  const footprint=String(options.footprint||'single');
  if(footprint!=='single')return Object.freeze({mode:'classic',reason:'unsupported-footprint',footprint});
  const assets=options.assets||{};
  const base=assets[BASE],stand=assets[STAND];
  if(!base?.src)return Object.freeze({mode:'classic',reason:'base-unavailable'});
  const pose=String(options.battlePoseUrl||'').trim();
  const portrait=String(options.portraitUrl||'').trim();
  if(pose)return Object.freeze({mode:'battle-pose',baseUrl:base.src,poseUrl:pose,portraitUrl:portrait});
  if(!stand?.src)return Object.freeze({mode:'classic',reason:'stand-unavailable'});
  return Object.freeze({mode:'portrait-stand',baseUrl:base.src,standUrl:stand.src,portraitUrl:portrait});
 }
 function assetsByKey(result){
  const rows=Array.isArray(result?.assets)?result.assets:[];
  const byId=new Map(rows.filter(a=>a?.verified&&a?.src).map(a=>[a.id,a]));
  const out={};
  for(const [key,id] of Object.entries(result?.systemArt||{})){
   if(byId.has(id))out[key]=byId.get(id);
  }
  return out;
 }
 root.aleaCombatPaperDollResolver=Object.freeze({resolve,assetsByKey,BASE,STAND});
})(globalThis);
