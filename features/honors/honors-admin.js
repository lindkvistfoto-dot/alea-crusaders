import { validateHonorDefinition } from './honors-domain.js';
import './honors-admin.css';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {adventure:'Äventyr',campaign:'Kampanj',achievement:'Prestation',honor:'Hedersutmärkelse'};
const fields = d => `<label>Namn<input name="name" required maxlength="160" value="${esc(d?.name)}"></label>
<label>Typ<select name="type">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${d?.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
<label>Äventyrs-ID<input name="adventure_id" value="${esc(d?.adventure_id)}"></label>
<label>Kampanj-ID<input name="campaign_id" value="${esc(d?.campaign_id)}"></label>
<label>Beskrivning<textarea name="description">${esc(d?.description)}</textarea></label>
<label>Villkor<textarea name="requirement_text">${esc(d?.requirement_text)}</textarea></label>
<label>Synlighet<select name="visibility">${[['public','Öppen'],['silhouette','Dold silhuett'],['secret','Hemlig']].map(([k,v])=>`<option value="${k}" ${(d?.visibility||'public')===k?'selected':''}>${v}</option>`).join('')}</select></label>
<label>Tilldelning<select name="grant_mode">${[['manual','Manuell'],['automatic','Automatisk'],['both','Båda']].map(([k,v])=>`<option value="${k}" ${(d?.grant_mode||'manual')===k?'selected':''}>${v}</option>`).join('')}</select></label>
<label>Bildresurs-ID (HERMES)<input name="image_asset_id" value="${esc(d?.image_asset_id)}"></label>`;
export function renderHonorsAdmin(root, { definitions = [], grants = [], characters = [], onSave, onGrant, resolveImage } = {}) {
 if (!root) throw new Error('Missing root');
 let selected='',editing=null,query='',tab='awards';
 const count=id=>grants.filter(g=>String(g.honor_id)===String(id)&&!g.revoked_at).length;
 function draw(){
  root.innerHTML=`<section class="arcane-honors-admin" aria-label="Arcane Honors administration">
  <header class="honors-top"><div><span class="honors-eyebrow">ARCANE · BRONZE & IVORY</span><h2>Medaljbibliotek</h2></div><button type="button" data-new>+ Ny medalj</button></header>
  <nav class="honors-tabs" aria-label="Utmärkelseflikar"><button type="button" data-tab="awards" aria-pressed="${tab==='awards'}">Utmärkelser</button><button type="button" data-tab="recipients" aria-pressed="${tab==='recipients'}">Mottagare</button></nav>
  <div data-panel="awards" ${tab!=='awards'?'hidden':''}><label class="honors-search">Sök medalj<input data-search type="search" placeholder="Namn eller typ" value="${esc(query)}"></label>
  <div class="honors-table-wrap"><table class="honors-table"><thead><tr><th>Medalj</th><th>Typ</th><th>Utdelade</th><th>Åtgärd</th></tr></thead><tbody data-awards></tbody></table></div></div>
  <div data-panel="recipients" ${tab!=='recipients'?'hidden':''}><label>Utmärkelse<select data-honor-select><option value="">Välj utmärkelse</option>${definitions.map(d=>`<option value="${esc(d.id)}" ${String(selected)===String(d.id)?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label><ul data-recipients></ul>
  <form data-grant-form><label>Rollperson<select name="characterId" required>${characters.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Motivering<textarea name="reason"></textarea></label><button type="submit">Tilldela medalj</button></form></div>
  <div class="honors-editor" data-editor hidden><div class="honors-editor-card"><header><h3 data-editor-title>Medalj</h3><button type="button" data-close aria-label="Stäng redigering">×</button></header><form data-honor-form><div class="honors-editor-fields" data-fields></div><footer><button type="button" data-cancel>Avbryt</button><button type="submit">Spara utmärkelse</button></footer></form></div></div><p role="status" data-status></p></section>`;
  const list=root.querySelector('[data-awards]');
  function refresh(){list.replaceChildren();const matches=definitions.filter(d=>[d.name,labels[d.type]].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));if(!matches.length){const row=list.insertRow();const cell=row.insertCell();cell.colSpan=4;cell.textContent='Inga utmärkelser';return}
   for(const d of matches){const row=list.insertRow();const medal=row.insertCell();medal.className='honors-medal-cell';const thumb=document.createElement('span');thumb.className='honors-medal-thumb';const url=typeof resolveImage==='function'?resolveImage(d):null;if(url&&/^https:\/\//.test(url)){const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';thumb.append(img)}else thumb.textContent='✦';medal.append(thumb);const name=document.createElement('strong');name.textContent=d.name;medal.append(name);row.insertCell().textContent=labels[d.type]||d.type;const total=row.insertCell();total.textContent=String(count(d.id));total.className='honors-total';const action=row.insertCell();const edit=document.createElement('button');edit.type='button';edit.className='honors-edit';edit.textContent='Redigera';edit.addEventListener('click',()=>openEditor(d));action.append(edit)}
  }
  refresh();
  root.querySelector('[data-search]').addEventListener('input',e=>{query=e.target.value;refresh()});
  root.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tab;draw()}));
  const closeEditor=()=>{root.querySelector('[data-editor]').hidden=true;editing=null};
  function openEditor(d){editing=d||null;root.querySelector('[data-editor-title]').textContent=d?'Redigera medalj':'Ny medalj';root.querySelector('[data-fields]').innerHTML=fields(d);root.querySelector('[data-editor]').hidden=false;root.querySelector('[data-fields] input[name="name"]').focus()}
  root.querySelector('[data-new]').addEventListener('click',()=>openEditor(null));
  root.querySelector('[data-close]').addEventListener('click',closeEditor);
  root.querySelector('[data-cancel]').addEventListener('click',closeEditor);
  root.querySelector('[data-honor-form]').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(editing){data.id=editing.id;data.status=editing.status}else data.status='draft';const errors=validateHonorDefinition(data);if(errors.length){root.querySelector('[data-status]').textContent=errors.join(', ');return}try{if(!onSave)throw Error('Databaskoppling saknas – inga ändringar sparade');await onSave(data);root.querySelector('[data-status]').textContent='Utmärkelse sparad';closeEditor()}catch(error){root.querySelector('[data-status]').textContent=error.message}});
  const recipients=()=>{selected=root.querySelector('[data-honor-select]').value;root.querySelector('[data-recipients]').innerHTML=grants.filter(g=>String(g.honor_id)===String(selected)).map(g=>`<li>${esc(characters.find(c=>String(c.id)===String(g.character_id))?.name||'Okänd rollperson')} · ${esc(g.granted_at)} ${g.revoked_at?'(återkallad)':''}</li>`).join('')||'<li>Inga mottagare</li>'};
  root.querySelector('[data-honor-select]').addEventListener('change',recipients);recipients();
  root.querySelector('[data-grant-form]').addEventListener('submit',async e=>{e.preventDefault();try{if(!selected)throw Error('Välj utmärkelse');if(!onGrant)throw Error('Databaskoppling saknas');await onGrant({honorId:selected,...Object.fromEntries(new FormData(e.currentTarget))});root.querySelector('[data-status]').textContent='Tilldelning sparad'}catch(error){root.querySelector('[data-status]').textContent=error.message}});
 }
 draw();return {destroy:()=>root.replaceChildren()};
}
