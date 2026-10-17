/* Campaign image gallery bridge: new library + legacy location assets on the campaign map.
   No Google Drive/HERMES dependency; manual uploads are enough. */
(function () {
  'use strict';

  const originalRender = window.renderMapLocationPhotos;
  const urls = new Map();
  const encode = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  async function readNewLocationImages(campaignId, locationId, gm) {
    const links = await dbJson(
      'campaign_image_links?campaign_id=eq.' + encodeURIComponent(campaignId) +
      '&object_type=eq.place&object_id=eq.' + encodeURIComponent(locationId) +
      '&select=id,image_id,is_primary,sort_order,caption,player_visible&order=sort_order.asc'
    );
    const visible = (links || []).filter(link => gm || link.player_visible);
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

  async function imageUrl(image) {
    const bucket = image.storage_bucket || 'campaign-location-assets';
    const key = bucket + '/' + image.storage_path;
    if (urls.has(key)) return urls.get(key);
    const res = await locationAssetStorageFetch(
      'object/' + encodeURIComponent(bucket) + '/' + encodeStoragePath(image.storage_path),
      { method: 'GET' }
    );
    if (!res.ok) throw Error('Kunde inte läsa bilden (' + res.status + ')');
    const url = URL.createObjectURL(await res.blob());
    urls.set(key, url);
    return url;
  }

  window.renderMapLocationPhotos = async function renderCampaignMapGallery(legacyAssets) {
    const originalGallery = document.getElementById('mapLocationGallery');
    if (!originalGallery) return;
    const selectedArea = campaignMapAreas.find(area => area.id === mapSelectedAreaId);
    if (!selectedArea?.location_id || !centralCampaignId) {
      return originalRender?.(legacyAssets || []);
    }
    const selectedId = selectedArea.id;
    const stillCurrent = () =>
      originalGallery.isConnected &&
      document.getElementById('mapLocationGallery') === originalGallery &&
      mapSelectedAreaId === selectedId;
    const gm = canManageCampaignMaps();
    let linkedImages = [];
    try {
      linkedImages = await readNewLocationImages(centralCampaignId, selectedArea.location_id, gm);
    } catch (error) {
      // Preserve the old map gallery if a migration/network/database issue occurs.
      console.warn('Kunde inte läsa det nya kampanjbildbiblioteket:', error);
      if (stillCurrent()) return originalRender?.(legacyAssets || []);
      return;
    }
    if (!stillCurrent()) return;
    const unique = new Set(linkedImages.map(image =>
      (image.storage_bucket || 'campaign-location-assets') + '/' + image.storage_path
    ));
    const remaining = (legacyAssets || [])
      .filter(image => gm || image.player_visible)
      .filter(image => {
        const key = 'campaign-location-assets/' + image.storage_path;
        if (unique.has(key)) return false;
        unique.add(key);
        return true;
      })
      .map(image => ({ ...image, storage_bucket: 'campaign-location-assets', source: 'legacy', primary: false }));
    const combined = [...linkedImages, ...remaining];
    if (!combined.length) {
      originalGallery.innerHTML =
        '<div class="map-location-empty">Inga bilder är kopplade till platsen.</div>';
      return;
    }
    const main = combined[0];
    originalGallery.classList.add('campaign-map-image-gallery');
    originalGallery.innerHTML =
      '<figure class="campaign-map-image-primary"><div class="campaign-map-image-stage" id="mapCampaignPrimaryImage">Laddar bild…</div>' +
      '<figcaption id="mapCampaignPrimaryCaption">' + encode(main.title) +
      (gm && !main.player_visible ? ' <span class="gm-only">ENDAST SL</span>' : '') +
      (main.description ? '<p>' + encode(main.description) + '</p>' : '') +
      '</figcaption></figure>' +
      (combined.length > 1
        ? '<div class="campaign-map-image-thumbnails" aria-label="Fler bilder från platsen">' +
          combined.map((item, index) =>
            '<button type="button" class="campaign-map-image-thumb' + (index === 0 ? ' active' : '') +
            '" data-image-index="' + index + '" aria-label="' + encode(item.title || 'Bild') + '">' +
            '<span>Laddar…</span></button>'
          ).join('') + '</div>'
        : '');

    const loaded = await Promise.all(combined.map(async item => {
      try { return await imageUrl(item); }
      catch (error) { console.warn('Platsbild kunde inte laddas:', item.storage_path, error); return null; }
    }));
    if (!stillCurrent()) return;
    const setMain = index => {
      const image = combined[index];
      const url = loaded[index];
      const stage = originalGallery.querySelector('#mapCampaignPrimaryImage');
      const caption = originalGallery.querySelector('#mapCampaignPrimaryCaption');
      if (!stage || !caption) return;
      stage.replaceChildren();
      if (url) {
        const element = document.createElement('img');
        element.src = url;
        element.alt = image.title || 'Platsbild';
        element.title = 'Öppna bilden i större format';
        element.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
        stage.appendChild(element);
      } else stage.textContent = 'Bilden kunde inte laddas.';
      caption.textContent = image.title || 'Platsbild';
      if (gm && !image.player_visible) {
        const badge = document.createElement('span');
        badge.className = 'gm-only';
        badge.textContent = 'ENDAST SL';
        caption.appendChild(badge);
      }
      if (image.description) {
        const detail = document.createElement('p');
        detail.textContent = image.description;
        caption.appendChild(detail);
      }
      originalGallery.querySelectorAll('[data-image-index]').forEach(button =>
        button.classList.toggle('active', Number(button.dataset.imageIndex) === index));
    };
    originalGallery.querySelectorAll('[data-image-index]').forEach(button => {
      const index = Number(button.dataset.imageIndex);
      if (loaded[index]) {
        const preview = document.createElement('img');
        preview.src = loaded[index];
        preview.alt = combined[index].title || 'Stödbild';
        button.replaceChildren(preview);
      } else button.textContent = 'Bild saknas';
      button.addEventListener('click', () => setMain(index));
    });
    setMain(0);
  };
})();