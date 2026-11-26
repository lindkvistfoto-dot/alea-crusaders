const byId=id=>document.getElementById(id);
export async function openDestination(message,valid){
 const isMap=message.view==='map',panel=byId(isMap?'mapPage':'legolasPanel');
 if(!panel||!valid())return false;
 // Reauthorize the exact destination before moving the player.
 if(isMap){
  await loadCampaignMaps(false);
  if(!valid()||campaignActiveMapId!==message.target||!campaignMaps.some(m=>m.id===message.target&&m.player_visible))return false;
  adventureRequestedMap=null;
 }else if(!await window.aleaGatherGallery?.accessible(message.target)||!valid())return false;
 window.aleaExplorerGallery?.closeViewer();
 window.closeGameSessionPanel?.();
 window.aleaGatherGallery?.closeViewer();
 if(panel.classList.contains('hidden'))byId(isMap?'mapNavBtn':'materialNavBtn')?.click();
 else if(isMap)await viewCampaignMap(message.target,false);
 if(!valid()||panel.classList.contains('hidden'))return false;
 if(!isMap&&!await window.aleaGatherGallery.focus(message.target,valid))return false;
 // A receipt means the authorized artwork was decoded on the destination page.
 const end=performance.now()+30000;
 while(valid()&&!panel.classList.contains('hidden')&&performance.now()<end){
  const img=byId(isMap?'mapImage':'arcaneGalleryImage');
  const targetReady=isMap?activeCampaignMap?.id===message.target&&img?.getAttribute('src')===activeCampaignMap.image_url:
   window.aleaGatherGallery.visibleId()===message.target;
  if(targetReady&&img?.complete&&img.naturalWidth>0){
   // The player may already be on this page, far down the map controls or gallery archive.
   byId(isMap?'mapViewport':'arcaneGalleryPicture')?.scrollIntoView({block:'center',behavior:'instant'});
   showBackupToast(isMap?'Spelledaren samlade gruppen på '+activeCampaignMap.name:'Spelledaren visar '+img.alt);
   return true;
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 return false;
}
