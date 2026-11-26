/* Campaign image gallery bridge: new library + legacy location assets on the campaign map.
   No Google Drive/HERMES dependency; manual uploads are enough. */
(function () {
  'use strict';

  const originalRender = window.renderMapLocationPhotos;
  let galleryGeneration = 0;
  async function readNewLocationImages(campaignId, locationId, manager) {
    const links = await dbJson(
      'campaign_image_links?campaign_id=eq.' + encodeURIComponent(campaignId) +
      (manager ? '' : '&player_visible=eq.true') + '&object_type=eq.place&object_id=eq.' + encodeURIComponent(locationId) +
      '&select=id,image_id,is_primary,sort_order,caption,player_visible&order=sort_order.asc'
    );
    const visible = (links || []).filter(link => manager || link.player_visible === true);
    if (!visible.length) return [];
    const ids = [...new Set(visible.map(link => link.image_id))];
    const images = await dbJson(
      'campaign_images?campaign_id=eq.' + encodeURIComponent(campaignId) +
      '&id=in.(' + ids.map(encodeURIComponent).join(',') +
      ')&select=id,title,description,storage_bucket,storage_path'
    );
    const byId = new Map((images || []).map(image => [image.id, image]));
    return visible
      .filter(link => byId.has(link.image_id))
      .map(link => ({
        ...byId.get(link.image_id),
        id: link.id,
        title: byId.get(link.image_id).title || 'Platsbild',
        description: link.caption || byId.get(link.image_id).description || '',
        player_visible: link.player_visible,
        primary: !!link.is_primary,
        sort_order: link.sort_order || 0,
        source: 'library'
      }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.sort_order - b.sort_order);
  }

  async function readImageBlob(image) {
    const bucket = image.storage_bucket || 'campaign-location-assets';

    const res = await locationAssetStorageFetch(
      'object/' + encodeURIComponent(bucket) + '/' + encodeStoragePath(image.storage_path),
      { method: 'GET' }
    );
    if (!res.ok) throw Error('Kunde inte läsa bilden (' + res.status + ')');
    return res.blob();
  }

  window.readExplorerImageBlob=readImageBlob;

  window.refreshExplorerRoomPhotos = async function(area){
    const manager=adventureCanManage();
    if(!area?.location_id || (!manager && area.status!=='explored'))return;
    const token=mapLocationInfoToken;
    const rows=await dbJson('campaign_location_assets?location_id=eq.'+encodeURIComponent(area.location_id)+(manager?'':'&player_visible=eq.true')+'&asset_type=eq.image&select=id,title,storage_path,player_visible,sort_order&order=sort_order.asc');
    if(token===mapLocationInfoToken && mapSelectedAreaId===area.id && manager===adventureCanManage())await window.renderMapLocationPhotos(rows);
  };

  window.renderMapLocationPhotos = async function renderCampaignMapGallery(legacyAssets) {
    const generation = ++galleryGeneration;
    const originalGallery = document.getElementById('mapLocationGallery');
    if (!originalGallery) return;
    const selectedArea = campaignMapAreas.find(area => area.id === mapSelectedAreaId);
    if (!selectedArea?.location_id || !centralCampaignId) {
      return originalRender?.((legacyAssets || []).filter(image => image.player_visible === true));
    }
    const selectedId = selectedArea.id, campaign = centralCampaignId, manager = adventureCanManage();
    const stillCurrent = () => originalGallery.isConnected && mapSelectedAreaId===selectedId &&
      generation===galleryGeneration && centralCampaignId===campaign && manager===adventureCanManage();
    const legacy = (legacyAssets || []).filter(image => manager || image.player_visible === true)
      .map(image => ({...image, storage_bucket:'campaign-location-assets', source:'legacy'}));
    let linkedImages;
    try {
      linkedImages = await readNewLocationImages(campaign, selectedArea.location_id, manager);
    } catch (error) {
      console.warn('Kunde inte läsa länkade platsbilder:', error);
      linkedImages = [];
    }
    if (!stillCurrent()) return;
    const key = image => image.storage_bucket + '/' + image.storage_path;
    const byPath = new Map();
    for (const image of [...linkedImages, ...legacy]) {
      const existing = byPath.get(key(image));
      if (existing) existing.player_visible ||= image.player_visible;
      else byPath.set(key(image),image);
    }
    const combined = [...byPath.values()];
    if (window.aleaExplorerGallery?.enabled()) {
      window.aleaExplorerGallery.room(selectedId, combined, readImageBlob);
      return;
    }
    // Older app shells can still render their original location-asset gallery.
    if (!window.aleaExplorerGallery) return originalRender?.(legacy.filter(image=>image.player_visible));
  };
})();
