// Reusable terrain presets for the existing combat hex model.
// Artwork is referenced only by HERMES CORE system asset keys; missing art is
// intentionally rendered as a labelled fallback until the CORE asset exists.
(() => {
 const entries = [
  {key:'stone-wall',name:'Stenmur',category:'Hinder',icon:'▤',assetKey:'arcane-battlefield-stone-wall',movement_mode:'blocked',sight_mode:'blocked',movement_cost:1,description:'Blockerar förflyttning och sikt.'},
  {key:'dense-forest',name:'Tät skog',category:'Terräng',icon:'♣',assetKey:'arcane-battlefield-dense-forest',movement_mode:'difficult',sight_mode:'obscuring',movement_cost:2,description:'Svår terräng och skymd sikt.'},
  {key:'rubble',name:'Rasmassor',category:'Terräng',icon:'◈',assetKey:'arcane-battlefield-rubble',movement_mode:'difficult',sight_mode:'clear',movement_cost:2,description:'Svår terräng med fri sikt.'},
  {key:'shallow-water',name:'Grundvatten',category:'Terräng',icon:'≈',assetKey:'arcane-battlefield-shallow-water',movement_mode:'difficult',sight_mode:'clear',movement_cost:2,description:'Svår terräng med fri sikt.'},
  {key:'opaque-fog',name:'Tät dimma',category:'Sikt',icon:'☁',assetKey:'arcane-battlefield-opaque-fog',movement_mode:'free',sight_mode:'blocked',movement_cost:1,description:'Fri förflyttning, blockerad sikt.'},
  {key:'clear-ground',name:'Rensa hex',category:'Verktyg',icon:'⌫',assetKey:null,movement_mode:'free',sight_mode:'clear',movement_cost:1,description:'Återställer hexen till fri mark.'}
 ];
 const byKey = new Map(entries.map(entry => [entry.key, Object.freeze({...entry})]));
 const externalByKey=new Map();
 function get(key){ return byKey.get(String(key||'')) || externalByKey.get(String(key||'')) || null }
 function registerExternal(rows){
  externalByKey.clear();
  (Array.isArray(rows)?rows:[]).filter(row=>row&&row.active!==false&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.object_key||'')&&/^arcane-battlefield-[a-z0-9-]+$/.test(row.asset_key||''))
   .forEach(row=>externalByKey.set(row.object_key,Object.freeze({key:row.object_key,name:row.name,category:row.category||'Objekt',icon:'⬡',assetKey:row.asset_key,placement_mode:'object',footprint:Array.isArray(row.footprint)?row.footprint:[{q:0,r:0}],connector_edges:Array.isArray(row.connector_edges)?row.connector_edges:[],movement_mode:row.movement_mode||'blocked',sight_mode:row.sight_mode||'blocked',movement_cost:Number(row.movement_cost)||1,max_damage:row.max_damage==null?null:Number(row.max_damage),description:row.description||'',active:row.active!==false})));
 }
 function entriesForCategory(category){ return [...entries,...externalByKey.values()].filter(entry => !category || entry.category===category).map(entry=>({...entry})) }
 function terrainPayload(entry, existing={}){
  if(!entry || !byKey.has(entry.key)) throw new Error('Okänt terrängobjekt.');
  return {movement_mode:entry.movement_mode,sight_mode:entry.sight_mode,
   movement_cost:entry.movement_cost,notes:existing.notes||''};
 }
 function objectPayload(entry,{q,r,rotation=0,damage=0,visible_to_players=true}={}){
  if(!entry||entry.placement_mode!=='object'||(!byKey.has(entry.key)&&!externalByKey.has(entry.key)))throw new Error('Okänt kartobjekt.');
  if(!Number.isInteger(Number(q))||!Number.isInteger(Number(r)))throw new Error('Välj en giltig hexposition.');
  return {object_key:entry.key,name_snapshot:entry.name,asset_key:entry.assetKey,q:Number(q),r:Number(r),
   rotation:((Number(rotation)%6)+6)%6,footprint:(entry.footprint||[{q:0,r:0}]).map(cell=>({q:cell.q,r:cell.r})),
   damage:Math.max(0,Math.min(Number(entry.max_damage)||Number(damage)||0,Number(damage)||0)),max_damage:entry.max_damage,
   visible_to_players:visible_to_players!==false,properties:{movement_mode:entry.movement_mode,sight_mode:entry.sight_mode}};
 }
 window.aleaBattlefieldLibrary = Object.freeze({get,entries:entriesForCategory,terrainPayload,objectPayload,registerExternal});
})();
