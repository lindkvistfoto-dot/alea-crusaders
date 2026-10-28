import { validateHonorDefinition, honorCategory } from './honors-domain.js';
import { createHonorImageResolver } from './honors-image-resolver.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const categories = { medal:'Medaljer', award:'Utmärkelser', badge:'Badges' };
const types = { adventure:'Äventyr', campaign:'Kampanj', achievement:'Prestation', honor:'Hedersutmärkelse' };
const materials = { enamel:'Emalj', metal:'Metallrelief', wood:'Snidat trä', stone:'Sten (äldre variant)', other:'Övrigt' };
const frameKeys = { bronze:'arcane-lion-badge-bronze', silver:'arcane-lion-badge-silver', gold:'arcane-lion-badge-gold' };
const laurelFrameKeys = { bronze:'arcane-laurel-badge-bronze', silver:'arcane-laurel-badge-silver', gold:'arcane-laurel-badge-gold' };
const asArray = value => Array.isArray(value) ? value : [];

async function assertSquareBadgeImage(file) {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Den här webbläsaren kan inte kontrollera bildens proportioner.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width !== bitmap.height) {
      throw new Error('Badgebilder måste vara kvadratiska (1:1).');
    }
  } finally {
    bitmap.close?.();
  }
}

const getCategory = definition => honorCategory(definition);
const tierText = (definition, tier) => String(definition?.tier_criteria?.[tier] || '');
const frameFor = (definition, metal) => definition?.badge_frame_assets?.[metal] || (getCategory(definition) === 'badge' ? frameKeys[metal] : laurelFrameKeys[metal]);

export function renderHonorsAdmin(root, options = {}) {
  if (!root) throw new Error('Missing root');
  const definitions = asArray(options.definitions);
  const grants = asArray(options.grants);
  const characters = asArray(options.characters);
  const variants = asArray(options.variants);
  const imageAssets = asArray(options.imageAssets);
  const onSave = options.onSave;
  const onGrant = options.onGrant;
  const onDelete = options.onDelete;
  const onSaveVariant = options.onSaveVariant;
  const onPreviewVariant = options.onPreviewVariant;
  const onPublishVariant = options.onPublishVariant;
  const onArchiveVariant = options.onArchiveVariant;
  const imageFor = typeof options.resolveImage === 'function' ? options.resolveImage : createHonorImageResolver(imageAssets);
  let selected = '';
  let editing = null;
  let query = '';
  let category = 'medal';
  let statusFilter = 'all';
  let tab = 'catalog';
  let imageBusy=false;
  const imagePilot=options.imagePilotEnabled===true;

  const count = id => grants.filter(g => String(g.honor_id) === String(id) && !g.revoked_at).length;
  const variantsFor = id => variants.filter(v => String(v.honor_id) === String(id));
  const publishedAsset = key => imageAssets.find(a => a?.asset_key === key && a.asset_path);
  const assetImage = key => imageFor({ image_asset_id:key });

  function imageControls(kind,row){
    if(!imagePilot||!row)return '';
    const currentImage=assetImage(row.image_asset_id);
    return '<fieldset class="honors-image-controls" data-image-controls data-kind="'+kind+'" data-id="'+esc(row.id)+'"><legend>Bild</legend>'+
      (currentImage?'<img class="honors-image-current" src="'+esc(currentImage)+'" alt="Aktuell bild">':'<span>'+(row.image_asset_id?'Förhandsvisning saknas':'Ingen bild')+'</span>')+
      '<label>'+ (row.image_asset_id?'Byt bild':'Lägg till bild')+'<input data-image-upload type="file" accept="image/png,image/jpeg,image/webp"></label>'+
      '<small>PNG, JPEG eller WebP. Högst 12 MB och 2048 × 2048 pixlar. Förbered beskärning och bakgrund före uppladdning.'+(kind==='relief'?' Relief behöver äkta transparens.':'')+'</small>'+
      (row.image_asset_id?'<button type="button" data-image-remove>Ta bort bild</button>':'')+
      '<button type="button" data-image-retry hidden>Försök igen</button><p role="status" aria-live="polite" data-image-status></p></fieldset>';
  }
  function bindImages(){
    root.querySelectorAll('[data-image-controls]').forEach(panel=>{
      const kind=panel.dataset.kind;
      const row=kind==='definition'?definitions.find(d=>String(d.id)===panel.dataset.id):variants.find(v=>String(v.id)===panel.dataset.id);
      let retryFile;
      async function run(file){
        if(imageBusy||!row)return;
        if(!file&&!root.ownerDocument.defaultView.confirm('Ta bort bildkopplingen? Originalarkivet behålls.'))return;
        retryFile=file;
        panel.querySelector('[data-image-retry]').hidden=true;
        imageBusy=true;
        const editor=root.querySelector('[data-editor]');
        const controls=[...editor.querySelectorAll('button,input,select,textarea')];
        const disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
        const status=panel.querySelector('[data-image-status]');status.textContent=file?'Laddar upp och kontrollerar bilden…':'Tar bort bildkopplingen…';
        try{
          if(file&&kind==='relief'&&getCategory(definitions.find(d=>String(d.id)===String(row.honor_id)))==='badge') await assertSquareBadgeImage(file);
          const result=file?await options.onUploadImage(kind,row,file):await options.onRemoveImage(kind,row);
          Object.assign(row,result);imageBusy=false;draw();openEditor(editing);
          const updatedPanel=[...root.querySelectorAll('[data-image-controls]')].find(el=>el.dataset.kind===kind&&el.dataset.id===String(row.id));
          if(updatedPanel){updatedPanel.querySelector('[data-image-status]').textContent=row.image_preview_pending?'Bilden är sparad. Öppna registret igen för att hämta förhandsvisningen.':file?'Bilden är sparad. Arkivering sker i bakgrunden.':'Bildkopplingen är borttagen.';updatedPanel.scrollIntoView({block:'nearest'});}
          notice(row.image_preview_pending?'Bilden är sparad, men förhandsvisningen kunde inte hämtas. Öppna registret igen.':file?'Bilden är sparad. Arkivering sker i bakgrunden.':'Bildkopplingen är borttagen.');
        }catch(error){
          panel.querySelector('[data-image-retry]').hidden=false;
          status.textContent='Kunde inte slutföra bildändringen: '+(error.message||'okänt fel')+'. Vid samtidig ändring: stäng och öppna registret igen.';
        }finally{imageBusy=false;controls.forEach((el,index)=>el.disabled=disabled[index]);}
      }
      panel.querySelector('[data-image-upload]').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)void run(file);});
      panel.querySelector('[data-image-retry]').addEventListener('click',()=>void run(retryFile));
      panel.querySelector('[data-image-remove]')?.addEventListener('click',()=>void run(null));
    });
  }

  function buildFields(definition) {
    const d = definition || {};
    const selectedCategory = definition ? getCategory(d) : category;
    const frame = d.badge_frame_assets || {};
    const categoryFrames = selectedCategory === 'badge' ? frameKeys : laurelFrameKeys;
    const framePrefix = selectedCategory === 'badge' ? 'arcane-lion-badge-' : 'arcane-laurel-badge-';
    const frameFamilyLabel = selectedCategory === 'badge' ? 'ARCANE LION' : 'ARCANE LAUREL';
    const badgeMetricPlaceholders = selectedCategory === 'badge'
      ? '<fieldset class="honors-metric-placeholders honors-wide"><legend>Automatiska karriärmått</legend>' +
        '<p>Platshållare för planerade karriärmått. Fälten är inte aktiva och sparas inte.</p>' +
        '<label>Karriärmått<select disabled><option selected>Välj mått senare</option></select></label>' +
        '<div class="honors-metric-thresholds">' +
          '<label>Brons<input type="number" disabled placeholder="Tröskelvärde"></label>' +
          '<label>Silver<input type="number" disabled placeholder="Tröskelvärde"></label>' +
          '<label>Guld<input type="number" disabled placeholder="Tröskelvärde"></label>' +
        '</div></fieldset>'
      : '';
    return '<div class="honors-basic-fields">' +
      '<label>Namn<input name="name" required maxlength="160" value="' + esc(d.name) + '"></label>' +
      '<label>Kategori<select name="category">' + Object.entries(categories).map(([key,label]) => '<option value="' + key + '"' + (selectedCategory === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
      '<label>Status<select name="status">' + [['draft','Utkast'],['active','Aktiv'],['inactive','Inaktiv']].map(([key,label]) => '<option value="' + key + '"' + ((d.status || 'draft') === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
      '<label>Äldre typ<select name="type">' + Object.entries(types).map(([key,label]) => '<option value="' + key + '"' + ((d.type || (selectedCategory === 'medal' ? 'adventure' : 'honor')) === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
      '<label>Äventyrs-ID<input name="adventure_id" value="' + esc(d.adventure_id) + '"></label>' +
      '<label>Kampanj-ID<input name="campaign_id" value="' + esc(d.campaign_id) + '"></label>' +
      '<label class="honors-wide">Beskrivning<textarea name="description">' + esc(d.description) + '</textarea></label>' +
      '<label class="honors-wide">Villkor<textarea name="requirement_text">' + esc(d.requirement_text) + '</textarea></label>' +
      '<label>Synlighet<select name="visibility">' + [['public','Öppen'],['silhouette','Dold silhuett'],['secret','Hemlig']].map(([key,label]) => '<option value="' + key + '"' + ((d.visibility || 'public') === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
      '<label>Tilldelning<select name="grant_mode">' + [['manual','Manuell'],['automatic','Automatisk'],['both','Båda']].map(([key,label]) => '<option value="' + key + '"' + ((d.grant_mode || 'manual') === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select><small>Utkast sparas alltid med manuell tilldelning.</small></label>' +
      badgeMetricPlaceholders +
      '<fieldset class="honors-tiers honors-wide"><legend>Kriterier per nivå (valfritt)</legend>' +
        ['bronze','silver','gold'].map(tier => '<label>' + ({bronze:'Brons',silver:'Silver',gold:'Guld'}[tier]) + '<textarea name="criteria_' + tier + '">' + esc(tierText(d,tier)) + '</textarea></label>').join('') +
      '</fieldset>' +
      '<label class="honors-wide">Bildresurs-ID (HERMES)<input name="image_asset_id"' + (imagePilot ? ' readonly' : '') + ' value="' + esc(d.image_asset_id) + '"></label>' +
      '<fieldset class="honors-frames honors-wide"><legend>Gemensamma ' + frameFamilyLabel + '-ramar</legend>' +
        ['bronze','silver','gold'].map(metal => {
          const key = frame[metal] || categoryFrames[metal];
          const asset = publishedAsset(key);
          return '<label>' + ({bronze:'Brons',silver:'Silver',gold:'Guld'}[metal]) +
            '<select name="frame_' + metal + '">' + imageAssets.filter(a => String(a.asset_key || '').startsWith(framePrefix)).map(a => '<option value="' + esc(a.asset_key) + '"' + (a.asset_key === key ? ' selected' : '') + '>' + esc(a.label || a.asset_key) + (a.asset_path ? '' : ' · ej publicerad') + '</option>').join('') +
            (!imageAssets.some(a => a.asset_key === key) ? '<option value="' + esc(key) + '" selected>' + esc(key) + ' · väntar på HERMES</option>' : '') +
            '</select><small>' + (asset ? 'HERMES-publicerad ram' : 'Väntar på HERMES-publicering') + '</small></label>';
        }).join('') +
      '</fieldset></div>';
  }

  function renderVariantPanel(definition) {
    if (!definition) return '<p class="honors-help">Spara utmärkelsen för att lägga till reliefvarianter.</p>';
    const own = variantsFor(definition.id);
    const isBadge = getCategory(definition) === 'badge';
    const selectedPreview = String(definition.preview_variant_id || '');
    const selectedPublished = String(definition.published_variant_id || '');
    const tiers = isBadge ? ['bronze','silver','gold'] : ['bronze'];
    const tierLabels = {bronze:'Brons',silver:'Silver',gold:'Guld'};
    const rows = own.length ? own.map(v => {
      const img = assetImage(v.image_asset_id);
      const isPreview = selectedPreview === String(v.id);
      const isPublished = selectedPublished === String(v.id);
      return '<article class="honors-variant-row' + (isPreview ? ' is-preview' : '') + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="honors-variant-placeholder" aria-hidden="true">✦</span>') +
        '<div><strong>' + esc(v.name) + '</strong><span>' + esc(materials[v.material] || v.material) + ' · ' + (isPublished ? 'Publicerad vald' : isPreview ? 'Aktiv förhandsvisning' : esc(v.status === 'archived' ? 'Arkiverad' : 'Utkast')) + '</span>' +
        '<small>' + (v.image_asset_id ? 'HERMES-asset: ' + esc(v.image_asset_id) : 'Bild väntar på HERMES') + (v.allow_overhang ? ' · bilden visas framför ramen' : ' · ramen visas framför bilden') + '</small></div>' +
        imageControls('relief',v) + '<div class="honors-variant-actions">' +
          '<button type="button" data-preview-variant="' + esc(v.id) + '"' + (v.status === 'archived' ? ' disabled' : '') + '>' + (isBadge ? 'Välj aktiv förhandsvisning' : 'Förhandsvisa') + '</button>' +
          (v.image_asset_id && publishedAsset(v.image_asset_id) ? '<button type="button" data-publish-variant="' + esc(v.id) + '">Välj publicerad</button>' : '') +
          (!isBadge && v.status !== 'archived' ? '<button type="button" data-archive-variant="' + esc(v.id) + '">Arkivera</button>' : '') +
        '</div></article>';
    }).join('') : '<p class="honors-help">Inga bildvarianter registrerade.</p>';
    const preview = own.find(v => String(v.id) === selectedPreview);
    const allowOverhang = preview?.allow_overhang !== false;
    const reliefUrl = preview ? assetImage(preview.image_asset_id) : null;
    const frameFamilyLabel = isBadge ? 'ARCANE LION' : 'ARCANE LAUREL';
    const framePreviews = tiers.map(tier => {
      const frameUrl = assetImage(frameFor(definition,tier));
      return '<div class="honors-preview-tier"><span>' + tierLabels[tier] + '</span><div class="honors-preview-art' + (allowOverhang ? ' has-overhang' : '') + '">' +
        (frameUrl ? '<img class="honors-preview-frame" src="' + esc(frameUrl) + '" alt="' + (isBadge ? 'ARCANE LION ' : 'ARCANE LAUREL ') + tierLabels[tier].toLowerCase() + 'ram">' : '<span class="honors-preview-empty">Ram väntar på HERMES</span>') +
        (reliefUrl ? '<img class="honors-preview-relief" src="' + esc(reliefUrl) + '" alt="' + esc(preview.name) + '">' : preview ? '<span class="honors-preview-relief-label">' + esc(preview.name) + ' · bild väntar</span>' : '') +
      '</div></div>';
    }).join('');
    return '<section class="honors-variant-library"><h4>Bildvarianter</h4><p>Den första badgebilden blir automatiskt aktiv för förhandsvisning. Publicering till spelarna kräver fortfarande ett separat val.</p>' +
      '<div class="honors-variant-list">' + rows + '</div>' +
      '<form data-variant-form class="honors-variant-form">' +
        '<label>Material<select name="material">' + Object.entries(materials).filter(([key]) => ['enamel','metal','wood','other'].includes(key)).map(([key,label]) => '<option value="' + key + '">' + label + '</option>').join('') + '</select></label>' +
        '<label>Bildfil<input type="file" name="image_file" accept="image/png,image/jpeg,image/webp" required'+(!imagePilot?' disabled':'')+'></label><small>'+(imagePilot?'HERMES ALEA: PNG, JPG eller WebP, högst 12 MB och 2048 × 2048 pixlar. '+(isBadge?'Badgebilder måste vara kvadratiska (1:1). ':'')+'Äkta transparens krävs.':'HERMES ALEA är inte tillgänglig. Bilduppladdning är spärrad tills tjänsten är driftsatt.')+'</small>' +
        '<label class="honors-overhang"><input type="checkbox" name="allow_overhang" checked> Tillåt bilden att sticka utanför ramen (3D-effekt)</label>' +
        '<button type="submit"'+(!imagePilot?' disabled':'')+'>Lägg till variant</button></form>' +
      '<div class="honors-preview-card" aria-label="Förhandsvisning av badge i brons-, silver- och guldram"><span>Förhandsvisning · valda ramar</span><div class="honors-preview-tiers">' + framePreviews + '</div>' +
      '<button type="button" data-trophy-preview' + (preview ? '' : ' disabled') + '>Visa i troférummet</button></div></section>';
  }

  function draw() {
    const visible = definitions.filter(d => getCategory(d) === category &&
      (statusFilter === 'all' || d.status === statusFilter) &&
      (String(d.name || '') + ' ' + String(d.description || '') + ' ' + String(types[d.type] || d.type || '')).toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
    root.innerHTML = '<section class="arcane-honors-admin" aria-label="ARCANE HONORS administration">' +
      '<header class="honors-top"><div><span class="honors-eyebrow">ARCANE · BRONZE & IVORY</span><h2>Honors-register</h2></div><button type="button" data-new>+ Ny post</button></header>' +
      '<nav class="honors-tabs" aria-label="Honors-kategorier">' +
        Object.entries(categories).map(([key,label]) => '<button type="button" data-category="' + key + '" aria-pressed="' + (category === key) + '">' + label + ' <span class="honors-count">' + definitions.filter(d => getCategory(d) === key).length + '</span></button>').join('') +
        '<button type="button" data-tab="recipients" aria-pressed="' + (tab === 'recipients') + '">Mottagare</button>' +
      '</nav>' +
      '<div data-panel="catalog"' + (tab !== 'catalog' ? ' hidden' : '') + '>' +
        '<div class="honors-filters"><label class="honors-search">Sök<input data-search type="search" placeholder="Namn, beskrivning eller typ" value="' + esc(query) + '"></label>' +
        '<label>Status<select data-status-filter><option value="all">Alla statusar</option><option value="draft"' + (statusFilter === 'draft' ? ' selected' : '') + '>Utkast</option><option value="active"' + (statusFilter === 'active' ? ' selected' : '') + '>Aktiv</option><option value="inactive"' + (statusFilter === 'inactive' ? ' selected' : '') + '>Inaktiv</option></select></label></div>' +
        '<div class="honors-table-wrap"><table class="honors-table"><thead><tr><th>Namn</th><th>Typ</th><th>Status</th><th>Tilldelade</th><th>Åtgärder</th></tr></thead><tbody data-list></tbody></table></div>' +
      '</div>' +
      '<div data-panel="recipients"' + (tab !== 'recipients' ? ' hidden' : '') + '><label>Utmärkelse<select data-honor-select><option value="">Välj utmärkelse</option>' + definitions.map(d => '<option value="' + esc(d.id) + '"' + (String(selected) === String(d.id) ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</select></label><ul data-recipients></ul>' +
        '<form data-grant-form><label>Rollperson<select name="characterId" required>' + characters.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '</select></label><label>Motivering<textarea name="reason"></textarea></label><button type="submit">Tilldela manuellt</button></form></div>' +
      '<div class="honors-editor" data-editor hidden><div class="honors-editor-card"><header><h3 data-editor-title>Utmärkelse</h3><button type="button" data-close aria-label="Stäng redigering">×</button></header><div data-definition-image></div><form data-honor-form><div class="honors-editor-fields" data-fields></div><footer><button type="button" data-cancel>Avbryt</button><button type="submit">Spara post</button></footer></form><div data-variants></div></div></div>' +
      '<p role="status" aria-live="polite" data-notice></p></section>';

    const list = root.querySelector('[data-list]');
    for (const d of visible) {
      const row = list.insertRow();
      const nameCell = row.insertCell(); nameCell.className = 'honors-name-cell';
      const thumb = document.createElement('span'); thumb.className = 'honors-medal-thumb';
      const url = imageFor(d);
      if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; thumb.append(img); }
      else thumb.textContent = '✦';
      nameCell.append(thumb);
      const title = document.createElement('strong'); title.textContent = d.name; nameCell.append(title);
      row.insertCell().textContent = types[d.type] || d.type || '—';
      const statusCell = row.insertCell(); statusCell.textContent = ({draft:'Utkast',active:'Aktiv',inactive:'Inaktiv'}[d.status] || d.status); statusCell.className = 'honors-status honors-status-' + (d.status || 'draft');
      const total = row.insertCell(); total.textContent = String(count(d.id)); total.className = 'honors-total';
      const actions = row.insertCell();
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'honors-edit'; edit.textContent = 'Redigera'; edit.addEventListener('click', () => openEditor(d)); actions.append(edit);
      if (d.status === 'draft' && count(d.id) === 0 && variantsFor(d.id).length === 0) {
        const del = document.createElement('button'); del.type = 'button'; del.className = 'honors-delete'; del.textContent = 'Ta bort utkast';
        del.addEventListener('click', async () => {
          if (!root.ownerDocument.defaultView.confirm('Ta bort utkastet "' + d.name + '"?')) return;
          try { await onDelete(d); definitions.splice(definitions.indexOf(d), 1); draw(); notice('Utkast borttaget.'); }
          catch (error) { notice(error.message || 'Kunde inte ta bort utkastet.'); }
        });
        actions.append(del);
      }
    }
    if (!visible.length) { const row = list.insertRow(); const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = 'Inga poster matchar filtret.'; }

    root.querySelector('[data-search]').addEventListener('input', e => { query = e.target.value; draw(); const input=root.querySelector('[data-search]'); input.focus(); input.setSelectionRange(query.length,query.length); });
    root.querySelector('[data-status-filter]').addEventListener('change', e => { statusFilter = e.target.value; draw(); });
    root.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.category; tab='catalog'; draw(); }));
    root.querySelector('[data-new]').addEventListener('click', () => openEditor(null));
    root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { tab = button.dataset.tab; draw(); }));
    const honorSelect = root.querySelector('[data-honor-select]');
    if (honorSelect) { honorSelect.addEventListener('change', recipients); recipients(); }
    const grantForm = root.querySelector('[data-grant-form]');
    if (grantForm) grantForm.addEventListener('submit', grantSubmit);
    const close = () => { if(imageBusy)return; root.querySelector('[data-editor]').hidden = true; editing = null; };
    root.querySelector('[data-close]').addEventListener('click', close);
    root.querySelector('[data-cancel]').addEventListener('click', close);
    root.querySelector('[data-honor-form]').addEventListener('submit', saveSubmit);
  }

  function notice(message) { const node=root.querySelector('[data-notice]'); if(node) node.textContent=message; }
  function openEditor(definition) {
    editing = definition || null;
    root.querySelector('[data-editor-title]').textContent = definition ? 'Redigera post' : 'Ny ' + categories[category].toLocaleLowerCase('sv');
    root.querySelector('[data-fields]').innerHTML = buildFields(definition);
    root.querySelector('[data-definition-image]').innerHTML = imageControls('definition',definition)||(imagePilot?'<p>Spara posten innan du lägger till en bild.</p>':'');
    root.querySelector('[data-variants]').innerHTML = renderVariantPanel(definition);
    bindImages();
    const editor = root.querySelector('[data-editor]'); editor.hidden=false;
    const cat = root.querySelector('[data-fields] [name="category"]');
    cat.addEventListener('change', () => { if (cat.value === 'medal') root.querySelector('[name="type"]').value = 'adventure'; else root.querySelector('[name="type"]').value = 'honor'; });
    const status = root.querySelector('[data-fields] [name="status"]');
    status.addEventListener('change', () => { if (status.value === 'draft') root.querySelector('[name="grant_mode"]').value='manual'; });
    root.querySelector('[data-fields] [name="name"]').focus();
    if (definition) bindVariantActions(definition);
  }
  function formData(form) { return Object.fromEntries(new FormData(form)); }
  async function saveSubmit(event) {
    event.preventDefault();
    const data = formData(event.currentTarget);
    data.tier_criteria = {};
    for (const tier of ['bronze','silver','gold']) {
      const value=String(data['criteria_'+tier] || '').trim(); delete data['criteria_'+tier];
      if (value) data.tier_criteria[tier]=value;
    }
    data.badge_frame_assets = {};
    for (const metal of ['bronze','silver','gold']) {
      const value=data['frame_'+metal]; delete data['frame_'+metal];
      if (value) data.badge_frame_assets[metal]=value;
    }
    data.frame_family = data.category === 'badge' ? 'arcane_lion_badge' : null;
    data.grant_mode = data.status === 'draft' ? 'manual' : data.grant_mode;
    if (editing) data.id=editing.id;
    const errors=validateHonorDefinition(data);
    if (errors.length) { notice(errors.join(', ')); return; }
    try {
      if (!onSave) throw Error('Databaskoppling saknas.');
      const result=await onSave(data); const saved=Array.isArray(result)?result[0]:result;
      if (!saved) throw Error('Databasen returnerade ingen sparad post.');
      if (editing) Object.assign(editing,saved); else definitions.push(saved);
      draw(); notice('Post sparad som ' + (saved.status === 'draft' ? 'utkast.' : 'aktiv.'));
      if (imagePilot || saved.category === 'badge' || getCategory(saved) === 'badge') openEditor(saved);
    } catch (error) { notice(error.message || 'Kunde inte spara posten.'); }
  }
  async function grantSubmit(event) {
    event.preventDefault();
    try {
      if (!selected) throw Error('Välj utmärkelse.');
      if (!onGrant) throw Error('Databaskoppling saknas.');
      const result=await onGrant({honorId:selected,...formData(event.currentTarget)});
      const saved=Array.isArray(result)?result[0]:result;
      if (saved) grants.unshift(saved);
      draw(); notice('Manuell tilldelning sparad.');
    } catch (error) { notice(error.message || 'Kunde inte spara tilldelningen.'); }
  }
  function recipients() {
    const select=root.querySelector('[data-honor-select]');
    if (!select) return;
    selected=select.value;
    const list=root.querySelector('[data-recipients]');
    list.replaceChildren();
    const matching=grants.filter(g=>String(g.honor_id)===String(selected));
    if (!matching.length) { const li=document.createElement('li'); li.textContent='Inga mottagare'; list.append(li); return; }
    for (const g of matching) {
      const li=document.createElement('li');
      li.textContent=(characters.find(c=>String(c.id)===String(g.character_id))?.name || 'Okänd rollperson') + ' · ' + String(g.granted_at || '') + (g.revoked_at ? ' (återkallad)' : '');
      list.append(li);
    }
  }
  async function bindVariantActions(definition) {
    const form=root.querySelector('[data-variant-form]');
    if (form) form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!imagePilot || !options.onUploadImage) { notice('HERMES ALEA är inte tillgänglig. Ingen variant har skapats.'); return; }
      const data=formData(event.currentTarget);
      const file=event.currentTarget.elements.namedItem('image_file')?.files?.[0];
      if (!file) { notice('Välj en bildfil.'); return; }
      if (getCategory(definition)==='badge') {
        try { await assertSquareBadgeImage(file); }
        catch(error) { notice(error.message); return; }
      }
      delete data.image_file;
      data.name='Relief '+data.material+' '+crypto.randomUUID().slice(0,8);
      data.honor_id=definition.id; data.allow_overhang=data.allow_overhang === 'on';
      let row;
      try {
        const saved=await onSaveVariant(data); row=Array.isArray(saved)?saved[0]:saved;
        if (!row?.id) throw Error('Reliefvarianten kunde inte sparas.');
        variants.push(row);
        draw(); openEditor(definition);
        const uploaded=await options.onUploadImage('relief',row,file,stage=>{
          const messages={preparing:'Förbereder bilden…',uploading:'Laddar upp bilden…',verifying:'Kontrollerar bilden…',activating:'Sparar bildkopplingen…'};
          if(messages[stage])notice(messages[stage]);
        });
        Object.assign(row,uploaded);
        let autoSelected=false;
        if(getCategory(definition)==='badge'&&!definition.preview_variant_id&&typeof options.onPreviewVariant==='function'){
          try{await options.onPreviewVariant(definition,row.id);definition.preview_variant_id=row.id;autoSelected=true;}catch(error){notice('Bilden sparades, men kunde inte väljas som aktiv förhandsvisning: '+(error.message||'okänt fel'));}
        }
        draw(); openEditor(definition); notice(autoSelected?'Första bildvarianten sparad och vald som aktiv förhandsvisning.':'Bildvariant sparad via HERMES ALEA.');
      } catch (error) {
        let message=error.message || 'Kunde inte lägga till reliefvarianten.';
        if (row?.id && !row.image_asset_id) {
          try {
            if (typeof options.onDeleteEmptyVariant !== 'function') throw Error('Återställning saknas');
            await options.onDeleteEmptyVariant(row);
            const index=variants.findIndex(v=>String(v.id)===String(row.id));
            if (index>=0) variants.splice(index,1);
            draw(); openEditor(definition);
            message+=' Den tomma varianten har återställts.';
          } catch (rollbackError) {
            message+=' En tom variant kan finnas kvar; öppna registret igen innan du försöker på nytt.';
          }
        }
        notice(message);
      }
    });
    root.querySelectorAll('[data-preview-variant]').forEach(button => button.addEventListener('click', async () => {
      try {
        await onPreviewVariant(definition,button.dataset.previewVariant);
        definition.preview_variant_id=button.dataset.previewVariant; draw(); openEditor(definition); notice('Förhandsvisningsvariant vald; publicerad variant oförändrad.');
      } catch(error) { notice(error.message || 'Kunde inte välja förhandsvisning.'); }
    }));
    root.querySelectorAll('[data-publish-variant]').forEach(button => button.addEventListener('click', async () => {
      try {
        const variant=variants.find(v=>String(v.id)===button.dataset.publishVariant);
        if (!variant || !publishedAsset(variant.image_asset_id)) throw Error('Varianten saknar verifierad HERMES-publicering.');
        await onPublishVariant(definition,variant);
        definition.published_variant_id=variant.id; variant.status='published'; draw(); openEditor(definition); notice('Publicerad reliefvariant vald. Alternativa varianter finns kvar.');
      } catch(error) { notice(error.message || 'Kunde inte välja publicerad variant.'); }
    }));
    root.querySelectorAll('[data-archive-variant]').forEach(button => button.addEventListener('click', async () => {
      try {
        const variant=variants.find(v=>String(v.id)===button.dataset.archiveVariant);
        await onArchiveVariant(definition,variant);
        variant.status='archived';
        if (String(definition.preview_variant_id)===String(variant.id)) definition.preview_variant_id=null;
        if (String(definition.published_variant_id)===String(variant.id)) definition.published_variant_id=null;
        draw(); openEditor(definition); notice('Varianten arkiverades och finns kvar i biblioteket.');
      } catch(error) { notice(error.message || 'Kunde inte arkivera varianten.'); }
    }));
    const previewButton=root.querySelector('[data-trophy-preview]');
    if (previewButton) previewButton.addEventListener('click', () => {
      const variant=variants.find(v=>String(v.id)===String(definition.preview_variant_id));
      if (!variant) return;
      root.dispatchEvent(new CustomEvent('arcane-honors:preview',{bubbles:true,detail:{
        honorName:definition.name,variantName:variant.name,
        frameUrls:{bronze:assetImage(frameFor(definition,'bronze')),silver:assetImage(frameFor(definition,'silver')),gold:assetImage(frameFor(definition,'gold'))},
        reliefUrl:assetImage(variant.image_asset_id),allowOverhang:variant.allow_overhang !== false
      }}));
      notice('Förhandsvisning öppnad i troférummet.');
    });
  }
  draw();
  return { destroy: () => root.replaceChildren() };
}
