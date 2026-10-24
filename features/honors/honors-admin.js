import { validateHonorDefinition } from './honors-domain.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {adventure:'Äventyr',campaign:'Kampanj',achievement:'Prestation',honor:'Hedersutmärkelse'};
export function renderHonorsAdmin(root, { definitions = [], grants = [], characters = [], onSave, onGrant } = {}) {
  if (!root) throw new Error('Missing root');
  let selected = null;
  function draw() {
    root.innerHTML = `<section class="arcane-honors-admin" aria-label="Arcane Honors administration">
      <header><h2>ARCANE HONORS</h2><p>Medaljer och utmärkelser</p></header>
      <nav aria-label="Utmärkelseflikar"><button type="button" data-tab="awards">Utmärkelser</button><button type="button" data-tab="recipients">Mottagare</button></nav>
      <div data-panel="awards">
        <label>Sök medalj <input data-search type="search" placeholder="Namn eller typ"></label>
        <ul data-awards></ul>
        <form data-honor-form>
          <h3>Ny utmärkelse</h3>
          <label>Namn <input name="name" required maxlength="160"></label>
          <label>Typ <select name="type">${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Beskrivning <textarea name="description"></textarea></label>
          <label>Villkor <textarea name="requirement_text"></textarea></label>
          <label>Synlighet <select name="visibility"><option value="public">Öppen</option><option value="silhouette">Dold silhuett</option><option value="secret">Hemlig</option></select></label>
          <label>Tilldelning <select name="grant_mode"><option value="manual">Manuell</option><option value="automatic">Automatisk</option><option value="both">Båda</option></select></label>
          <label>Bildresurs-ID (HERMES) <input name="image_asset_id"></label>
          <button type="submit">Spara utmärkelse</button>
        </form>
      </div>
      <div data-panel="recipients" hidden>
        <label>Utmärkelse <select data-honor-select><option value="">Välj utmärkelse</option>${definitions.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label>
        <ul data-recipients></ul>
        <form data-grant-form>
          <label>Rollperson <select name="characterId" required>${characters.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
          <label>Motivering <textarea name="reason"></textarea></label>
          <button type="submit">Tilldela medalj</button>
        </form>
      </div>
      <p role="status" data-status></p>
    </section>`;
    const list=root.querySelector('[data-awards]');
    const refresh = () => { const q=root.querySelector('[data-search]').value.toLowerCase(); list.innerHTML=definitions.filter(d=>[d.name,labels[d.type]].join(' ').toLowerCase().includes(q)).map(d=>`<li><strong>${esc(d.name)}</strong> · ${esc(labels[d.type])} · ${esc(d.status)}</li>`).join('') || '<li>Inga utmärkelser</li>'; };
    refresh(); root.querySelector('[data-search]').addEventListener('input',refresh);
    root.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{root.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel !== (button.dataset.tab==='awards'?'awards':'recipients'));}));
    const recipients=()=>{ const id=root.querySelector('[data-honor-select]').value; selected=id; root.querySelector('[data-recipients]').innerHTML=grants.filter(g=>g.honor_id===id).map(g=>`<li>${esc(characters.find(c=>c.id===g.character_id)?.name||'Okänd rollperson')} · ${esc(g.granted_at)} ${g.revoked_at?'(återkallad)':''}</li>`).join('')||'<li>Inga mottagare</li>'; };
    root.querySelector('[data-honor-select]').addEventListener('change',recipients);
    root.querySelector('[data-honor-form]').addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));data.status='draft';const errors=validateHonorDefinition(data);if(errors.length){root.querySelector('[data-status]').textContent=errors.join(', ');return;}try{if(!onSave)throw Error('Databaskoppling saknas');await onSave(data);root.querySelector('[data-status]').textContent='Utmärkelse sparad';}catch(error){root.querySelector('[data-status]').textContent=error.message;}});
    root.querySelector('[data-grant-form]').addEventListener('submit',async event=>{event.preventDefault();try{if(!selected)throw Error('Välj utmärkelse');if(!onGrant)throw Error('Databaskoppling saknas');const data=Object.fromEntries(new FormData(event.currentTarget));await onGrant({honorId:selected,...data});root.querySelector('[data-status]').textContent='Tilldelning sparad';}catch(error){root.querySelector('[data-status]').textContent=error.message;}});
  }
  draw();return {destroy:()=>root.replaceChildren()};
}
