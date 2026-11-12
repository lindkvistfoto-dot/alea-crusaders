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
 function get(key){ return byKey.get(String(key||'')) || null }
 function entriesForCategory(category){ return entries.filter(entry => !category || entry.category===category).map(entry=>({...entry})) }
 function terrainPayload(entry, existing={}){
  if(!entry || !byKey.has(entry.key)) throw new Error('Okänt terrängobjekt.');
  return {movement_mode:entry.movement_mode,sight_mode:entry.sight_mode,
   movement_cost:entry.movement_cost,notes:existing.notes||''};
 }
 window.aleaBattlefieldLibrary = Object.freeze({get,entries:entriesForCategory,terrainPayload});
})();
