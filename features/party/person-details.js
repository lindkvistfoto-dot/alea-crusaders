// The legacy drawer owns the character model, the four page renderers and the roll menus.
export function createPersonDetails(container, {sheet, inbox, onManage, onTab}={}) {
  container.innerHTML = `<div class="party-person"></div><nav class="party-tabs" aria-label="Personsidor" role="tablist"></nav>
    <div class="party-page" role="tabpanel" tabindex="0"></div>
    <form class="party-compose" hidden><input aria-label="Meddelande" placeholder="Skriv ett brev …" maxlength="2000" required><button type="submit">Skicka</button></form>
    <div class="party-feedback" role="status"></div>`;
  const title=container.querySelector('.party-person'), tabs=container.querySelector('nav');
  const page=container.querySelector('.party-page'), form=container.querySelector('form');
  const field=form.querySelector('input'), feedback=container.querySelector('.party-feedback');
  let person, active=0, visible=false, generation=0, request=0, pending=null;
  const drafts=new Map();
  const model=()=>sheet?.();
  function available() {
    const pages=person?.character ? [...(model()?.labels || [])] : [];
    if (person && !person.self) pages.push('Meddelanden');
    return pages;
  }
  function showingMail() { return !!person && available()[active]==='Meddelanden'; }
  async function refreshMail() {
    if (!visible || !showingMail() || !inbox || document.hidden) return;
    const serial=++request, version=generation, peer=person;
    try {
      const messages=await inbox.list(peer);
      if (serial!==request || version!==generation || !visible || document.hidden) return;
      const atEnd=page.scrollHeight-page.scrollTop-page.clientHeight<=16;
      if (page.dataset.last!==JSON.stringify(messages)) {
        const nodes=messages.map(m=>{
          const article=document.createElement('article');
          article.className='party-letter'+(m.mine?' outgoing':'');
          const by=document.createElement('b'); by.textContent=m.mine?'Du':peer.name;
          const body=document.createElement('p'); body.textContent=m.text;
          article.append(by,body); return article;
        });
        page.replaceChildren(...nodes);
        if (!nodes.length) page.textContent='Inga brev ännu.';
        if (atEnd || !page.dataset.last) page.scrollTop=page.scrollHeight;
        page.dataset.last=JSON.stringify(messages);
      }
      const unread=messages.filter(m=>!m.mine && !m.read).map(m=>m.id);
      if (unread.length) {
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const animations=container.closest('.drawer')?.getAnimations() || [];
        await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
        if (serial===request && version===generation && visible && !document.hidden && container.isConnected && !container.closest('[inert]')) await inbox.mark(peer,unread);
      }
    } catch {
      if (version===generation && visible) feedback.textContent='Kunde inte läsa breven. Försök igen genom att öppna fliken.';
    }
  }
  function render() {
    generation++; request++; page.scrollTop=0; delete page.dataset.last;
    const pages=available();
    title.textContent=person?.name || '';
    tabs.replaceChildren(...pages.map((name,i)=>{
      const tab=document.createElement('button'); tab.type='button'; tab.textContent=name;
      tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(i===active));
      tab.onclick=()=>setPage(i); return tab;
    }));
    page.replaceChildren(); feedback.textContent='';
    form.hidden=!showingMail() || !inbox;
    if (showingMail()) {
      field.value=drafts.get(person.owner) || '';
      page.textContent=inbox?'Hämtar brev …':'Den privata inkorgen är ännu inte ansluten.';
      void refreshMail();
    } else if (person?.character && pages.length) {
      const c=person.character;
      page.innerHTML=model().renderPage(c,active);
      if (model().mayAct(c) && onManage) {
        const button=document.createElement('button'); button.type='button'; button.className='party-manage';
        button.textContent=active===3?'Hantera utrustning':'Öppna rollpersonsblad';
        button.onclick=()=>{if (model().mayAct(c)) onManage(c,active);}; page.append(button);
      }
    } else page.textContent='Ingen rollperson är kopplad till ditt konto.';
    onTab?.(active,pages);
  }
  function setPage(n) {
    const len=available().length;
    if (!len) return;
    const next=(n+len)%len;
    if (next!==active) { active=next; render(); }
  }
  function select(next,messages=false) {
    const previous=person;
    const before=showingMail();
    person=next;
    const pages=available();
    const index=messages || (before && previous?.character) ? pages.indexOf('Meddelanden') : active;
    const desired=Math.max(0,Math.min(index,pages.length-1));
    if (previous?.owner===person.owner && previous?.character===person.character && desired===active) return;
    active=desired; render();
  }
  page.onclick=e=>{
    const button=e.target.closest('[data-roll]');
    if (button && person?.character && model()?.mayAct(person.character))
      model().roll(person.character,button.dataset.roll,Number(button.dataset.index));
  };
  field.oninput=()=>{if(person) drafts.set(person.owner,field.value);};
  form.onsubmit=async e=>{
    e.preventDefault();
    const peer=person, text=field.value.trim();
    if (!showingMail() || !text || pending || !inbox) return;
    pending=peer; form.querySelector('button').disabled=true;
    try {
      await inbox.send(peer,text);
      if (drafts.get(peer.owner)?.trim()===text) drafts.delete(peer.owner);
      if (person===peer && field.value.trim()===text) field.value='';
      await refreshMail();
    } catch { if (person===peer) feedback.textContent='Brevet kunde inte skickas. Din text finns kvar.'; }
    finally {pending=null; form.querySelector('button').disabled=false;}
  };
  return {select,setPage,refreshMail,step:direction=>setPage(active+direction),
    setVisible(value){if (visible===value) return; visible=value; request++; if(value) void refreshMail();},
    dispose(){visible=false;generation++;request++;drafts.clear();}
  };
}
