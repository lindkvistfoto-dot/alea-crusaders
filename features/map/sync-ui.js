/* Alea Crusaders v0.34.95 – map panel integration.
 * Reload only RLS-authorized state; keep the current zoom/pan for fog updates.
 */
import {createMapRealtime} from './realtime.js?v=0.34.95';

let syncing=null,queued=false,seenCampaign='',seenActiveMap=undefined;

function mapPanelOpen(){
 return !!document.getElementById('mapPage')&&
  !document.getElementById('mapPage').classList.contains('hidden');
}

async function refreshMapOnce(){
 const campaign=String(centralCampaignId||'');
 if(!campaign||!supabaseSession?.access_token||!mapPanelOpen())return;
 const priorMap=activeCampaignMap?.id||null;
 await loadCampaignMaps(false);
 if(campaign!==String(centralCampaignId||'')||!mapPanelOpen())return;
 const currentChanged=seenCampaign===campaign&&
  seenActiveMap!==undefined&&seenActiveMap!==campaignActiveMapId;
 seenCampaign=campaign;seenActiveMap=campaignActiveMapId;
 const isGM=canManageCampaignMaps();
 const available=campaignMaps.filter(m=>isGM||m.player_visible);
 const current=available.find(m=>m.id===campaignActiveMapId);
 const previous=available.find(m=>m.id===priorMap);
 const desired=(!isGM&&currentChanged&&current?current:previous||current||available[0])||null;
 if(desired?.id!==priorMap){
  if(desired)await viewCampaignMap(desired.id,false);
  else{
   closeMapLocationInfo();
   setCampaignMapData(null,[]);
  }
  return;
 }
 if(!desired){renderMapLibraryControls();return;}
 const areas=await loadCampaignMapAreas(desired.id);
 if(campaign!==String(centralCampaignId||'')||!mapPanelOpen()||
    activeCampaignMap?.id!==desired.id)return;
 // Keep the image blob, current zoom and pan. Refresh only the fog overlay.
 const existingUrl=activeCampaignMap.image_url||activeCampaignMap.imageUrl||'';
 activeCampaignMap={...desired,image_url:existingUrl};
 campaignMapAreas=areas;
 if(mapSelectedAreaId){
  const selected=areas.find(a=>a.id===mapSelectedAreaId);
  if(!selected||(!isGM&&selected.status==='unknown'))closeMapLocationInfo();
  else void openMapLocationInfoByArea(mapSelectedAreaId,true);
 }
 renderMapPanel();
}
export async function reconcileCampaignMap(){
 if(!mapPanelOpen())return;
 if(syncing){queued=true;return syncing}
 syncing=(async()=>{
  do{
   queued=false;
   try{await refreshMapOnce()}
   catch(error){console.warn('Kunde inte synkronisera kampanjkartan',error)}
  }while(queued);
 })().finally(()=>{syncing=null});
 return syncing;
}

const mapSync=createMapRealtime({
 getCampaign:()=>String(centralCampaignId||''),
 getToken:()=>String(supabaseSession?.access_token||''),
 isAuthenticated:()=>Boolean(activeUser()&&supabaseSession?.access_token),
 supabaseUrl:SUPABASE_URL,
 publishableKey:SUPABASE_KEY,
 onRefresh:reconcileCampaignMap,
 onStatus:(label,connected)=>{
  const page=document.getElementById('mapPage');
  const status=document.getElementById('mapStatusText');
  if(page)page.dataset.realtime=connected?'connected':'fallback';
  if(status)status.title='Kartsynk: '+label;
 }
});

function mountMapRealtime(){
 mapSync.start();
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
   mapSync.tick();
   void reconcileCampaignMap();
  }
 });
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',mountMapRealtime,{once:true});
else mountMapRealtime();
window.aleaMapRealtime=Object.freeze({
 connected:mapSync.connected,
 refresh:reconcileCampaignMap,
 status:mapSync.status
});
