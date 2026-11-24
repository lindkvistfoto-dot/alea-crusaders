import {createHermesAleaClient} from '../hermes-alea/client.js';
import hermesAlea from '../hermes-alea/asset-resolver.js';
import {objectCategories} from '../map/object-categories.js';
import {objectImageUrls} from '../map/object-images.js';

const table = 'arcane_object_definitions';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const upload = createHermesAleaClient({
  targetPolicies: {'map-object': {}},
  environment: globalThis.ALEA_SUPABASE_CONFIG?.name === 'live' ? 'LIVE' : 'DEV',
  rpc: (name,args) => window.dbJson('rpc/' + name,{method:'POST',body:JSON.stringify(args)}),
  request: (path,options) => window.authFetch(path,{...options,headers:{Authorization:'Bearer session',...options.headers}}),
});
const phases = {preparing:'Förbereder bilden…',uploading:'Laddar upp original och visningsbild…',verifying:'Verifierar bilden…',activating:'Kopplar bilden till objektet…'};
let mounted = 0;
let dispose = () => {};

async function mount() {
  const root = document.getElementById('battlefieldObjectWorkshopMount');
  if (!root) return;
  const version = ++mounted;
  dispose();root.inert=false;
  if (!window.activeUser?.()?.admin) {root.textContent='Endast administratörer kan öppna objektverkstaden.';return;}
  root.textContent='Läser objektbiblioteket…';
  try {
    const [rows,campaigns] = await Promise.all([
      window.dbJson(table+'?select=*&order=name,id'),
      window.dbJson('campaigns?select=id,name&order=name,id'),
    ]);
    if (version!==mounted) return;
    let selected, draftId, pending=false, preview='', urls=new Map();
    dispose=()=>{if(preview)URL.revokeObjectURL(preview);};
    const campaignNames=new Map(campaigns.map(c=>[c.id,c.name]));
    const campaignOptions=campaigns.map(c=>'<option value="'+escape(c.id)+'">'+escape(c.name)+'</option>').join('');
    const categories=objectCategories.map(c=>'<option>'+escape(c)+'</option>').join('');
    root.innerHTML='<div class="ow-layout"><aside><div class="ow-heading"><h2>Objektbibliotek</h2><button type="button" class="btn" data-new>Nytt objekt</button></div>'+
      '<label>Sök objekt<input type="search" data-search></label><label>Samling<select data-scope><option value="all">Alla samlingar</option><option value="">Gemensamma objekt</option>'+campaignOptions+'</select></label>'+
      '<label>Kategori<select data-filter><option value="">Alla kategorier</option>'+categories+'</select></label><div class="ow-list" data-list></div></aside>'+
      '<form><h2 data-title></h2><div class="ow-preview" data-preview></div><label>Objektbild<input name="picture" type="file" accept="image/png,image/jpeg,image/webp"></label>'+
      '<label>Namn<input name="title" required></label><div class="ow-fields"><label>Kategori<select name="category">'+categories+'</select></label>'+
      '<label>Samling<select name="scope"><option value="">Gemensamma objekt</option>'+campaignOptions+'</select></label></div>'+
      '<div class="ow-fields">'+[['length','Längd'],['width','Bredd'],['height','Höjd']].map(([key,label])=>'<label>'+label+' (m)<input type="number" name="'+key+'" min="0.001" step="0.001"></label>').join('')+
      '<label>Max BEP<input type="number" name="bep" min="0" step="1"></label></div><label>Beskrivning<textarea name="description" rows="3"></textarea></label>'+
      '<label class="ow-check"><input type="checkbox" name="enabled"> Aktiv i kartbiblioteket</label><p data-battle hidden>Namn, bild, beskrivning, Max BEP och aktivitet hämtas från Battle Library.</p>'+
      '<button type="submit" class="btn primary">Spara objekt</button><p role="status" aria-live="polite"></p></form></div>';
    const find=s=>root.querySelector(s), form=find('form'), field=name=>form.elements.namedItem(name);
    const status=message=>{if(version===mounted)find('[role=status]').textContent=message;};
    const collection=row=>row.campaign_id?campaignNames.get(row.campaign_id)||'Kampanjspecifikt':'Gemensamt';
    function list() {
      const search=find('[data-search]').value.trim().toLocaleLowerCase('sv');
      const category=find('[data-filter]').value, scope=find('[data-scope]').value;
      const matches=rows.filter(d=>(scope==='all'||(d.campaign_id||'')===scope)&&(!category||d.library_category===category)&&
        [d.name,d.library_category,collection(d)].some(s=>s.toLocaleLowerCase('sv').includes(search)));
      find('[data-list]').innerHTML=matches.map(d=>'<button type="button" class="ow-row" aria-pressed="'+(d.id===selected?.id)+'" data-id="'+escape(d.id)+'">'+
        (urls.get(d.image_asset_key)?'<img alt="" src="'+escape(urls.get(d.image_asset_key))+'">':'')+'<span><b>'+escape(d.name)+'</b><small>'+escape(d.library_category)+' · '+escape(collection(d))+(d.active?'':' · Inaktiv')+'</small></span></button>').join('')||'<p>Inga objekt matchar urvalet.</p>';
    }
    function showArt() {
      const src=preview||urls.get(selected?.image_asset_key);
      find('[data-preview]').innerHTML=src?'<img alt="Objektets bild" src="'+escape(src)+'">':'<span>Ingen bild vald</span>';
    }
    function select(row) {
      selected=row;draftId=row?.id||crypto.randomUUID();
      if(preview)URL.revokeObjectURL(preview);
      preview='';form.reset();field('title').value=row?.name||'';
      field('category').value=row?.library_category||find('[data-filter]').value||'Övrigt';
      field('scope').value=row?.campaign_id||(row||find('[data-scope]').value==='all'?'':find('[data-scope]').value);
      field('scope').disabled=!!row;
      for(const [key,column] of [['length','width_m'],['width','depth_m'],['height','height_m'],['bep','max_bep'],['description','description']])
        field(key).value=row?.[column]??'';
      field('enabled').checked=row?.active??true;
      for(const key of ['title','picture','bep','description','enabled'])field(key).disabled=!!row?.battle_object_key;
      find('[data-battle]').hidden=!row?.battle_object_key;
      find('[data-title]').textContent=row?'Redigera objekt':'Nytt objekt';
      showArt();list();status('');
    }
    find('[data-list]').onclick=e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id)select(rows.find(d=>d.id===id));};
    find('[data-new]').onclick=()=>{select(null);field('title').focus();};
    find('[data-search]').oninput=list;find('[data-scope]').onchange=list;find('[data-filter]').onchange=list;
    field('picture').onchange=()=>{if(preview)URL.revokeObjectURL(preview);preview=field('picture').files[0]?URL.createObjectURL(field('picture').files[0]):'';showArt();};
    function remember(row) {
      const i=rows.findIndex(d=>d.id===row.id);
      if(i<0)rows.push(row);else rows[i]=row;
      rows.sort((a,b)=>a.name.localeCompare(b.name,'sv'));
      selected=row;
    }
    const number=key=>field(key).value===''?null:field(key).valueAsNumber;
    const byId=()=>table+'?id=eq.'+draftId;
    form.onsubmit=async event=>{
      event.preventDefault();
      if(pending||!form.reportValidity())return;
      if(!field('title').value.trim()){status('Ange objektets namn.');field('title').focus();return;}
      pending=true;root.inert=true;status('Sparar objektet…');
      const file=field('picture').files[0];
      let metadataSaved=false;
      try{
        const values={library_category:field('category').value,width_m:number('length'),depth_m:number('width'),height_m:number('height')};
        if(!selected?.battle_object_key)Object.assign(values,{name:field('title').value.trim(),description:field('description').value.trim(),max_bep:number('bep'),active:field('enabled').checked});
        const isNew=!selected;
        if(isNew)Object.assign(values,{id:draftId,object_key:'object-'+draftId,object_type:'map-object',campaign_id:field('scope').value||null,image_crop:{}});
        const path=isNew?table+'?on_conflict=id':byId()+'&updated_at=eq.'+encodeURIComponent(selected.updated_at);
        const saved=await window.dbJson(path,{method:isNew?'POST':'PATCH',headers:{Prefer:isNew?'resolution=ignore-duplicates,return=representation':'return=representation'},body:JSON.stringify(values)});
        const row=saved[0]||(isNew?(await window.dbJson(byId()+'&select=*'))[0]:null);
        if(!row){
          const [latest]=await window.dbJson(byId()+'&select=*');
          if(latest && version===mounted){remember(latest);select(latest);}
          throw Error('Mallen har ändrats. Kontrollera de aktuella värdena innan du sparar igen.');
        }
        remember(row);metadataSaved=true;
        if(file)await upload.upload({targetKind:'map-object',target:{id:row.id,image_asset_id:row.image_asset_key,image_revision:row.image_revision},file,onStatus:p=>{if(phases[p])status(phases[p]);}});
        const [fresh]=await window.dbJson(byId()+'&select=*');
        remember(fresh);
        if(version!==mounted)return;
        select(fresh);
        status(file?'Objektet och bilden har sparats.':'Objektet har sparats.');
        try {
          if(file)await hermesAlea.load(true);
          urls=await objectImageUrls(rows);
          if(version===mounted){list();showArt();}
        }catch{status('Objektet är sparat. Förhandsbilden kunde inte läsas just nu.');}
      }catch(error){if(version===mounted)status((metadataSaved?'Objektmallen är sparad. ':'')+error.message);}
      finally{
        if(metadataSaved)window.dispatchEvent(new Event('alea-object-library-changed'));
        pending=false;if(version===mounted){root.inert=false;field('scope').disabled=!!selected;list();}
      }
    };
    select(rows[0]||null);
    urls=await objectImageUrls(rows);if(version===mounted){list();showArt();}
  } catch(error){if(version===mounted){const node=root.querySelector('[role=status]')||root;node.textContent='Objektverkstaden kunde inte läsas. '+error.message;}}
}
window.aleaBattlefieldObjectWorkshop={mount};
