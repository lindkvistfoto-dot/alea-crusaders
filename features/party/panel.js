function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function picture(src) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

export function partyFirstName(name) {
  return name?.trim().split(/\s+/, 1)[0] || 'Namnlös';
}

// Some profiles use the account handle as their display name until a character is assigned.
export function partyProfileName(displayName, fallback) {
  const given = displayName?.trim().split(/[\s.@_+]/u, 1)[0];
  return given ? given.charAt(0).toLocaleUpperCase('sv-SE') + given.slice(1) : fallback;
}

export function loadArt(components, target) {
  const art = {};
  for (const {key,url} of components) {
    const shortName = key.replace('ARCANE_PARTY_', '');
    art[shortName] = url;
    target.style.setProperty('--' + shortName.toLowerCase().replaceAll('_','-'), 'url("' + url + '")');
  }
  return art;
}

const neutralPortrait = new URL('../../assets/arcane/system/v1/icon-person.avif', import.meta.url).href;
export const mobileScreen = '(max-width:900px), (pointer:coarse) and (max-height:540px) and (max-width:1000px)';

export function createPartyPanel(mount, art, {opened=false, onStatus, onRead, onPortrait, onDetails, onVisibility} = {}) {
  mount.innerHTML = `<div class="viewport"><div class="drawer" data-open="false">
    <button id="grip" type="button" aria-controls="members"></button>
    <div id="members"></div><section class="party-details" aria-label="Personinformation" inert></section>
  </div></div>`;
  const drawer = mount.querySelector('.drawer');
  const members = mount.querySelector('#members');
  const grip = mount.querySelector('#grip');
  const details = mount.querySelector('.party-details');
  const media = matchMedia(mobileScreen);
  const supportsFull = () => Boolean(onDetails && media.matches);
  let state = 0, roster = [], selected, records = new Map();
  drawer.classList.toggle('three-states',Boolean(onDetails));
  const key = person => person.owner ?? person.name;

  function positionWaitingLetter() {
    if (state!==0 || !supportsFull()) return;
    const waiting=roster.find(person=>person.unread>0);
    const row=waiting && records.get(key(waiting))?.row;
    const shift=row?Math.max(0,row.offsetTop+row.offsetHeight+6-drawer.clientHeight):0;
    members.style.setProperty('--peek-shift',-shift+'px');
  }

  function select(person, messages=false) {
    selected = key(person);
    for (const [id, entry] of records) entry.frame.setAttribute('aria-pressed',String(id===selected));
    onDetails?.(details,person,messages);
  }
  function setState(value) {
    const next=Math.max(0,Math.min(value,supportsFull()?2:1));
    if (next===2 && selected===undefined && roster.length) select(roster.find(p=>p.character) || roster[0]);
    state=next;
    drawer.dataset.state=String(state);
    drawer.dataset.open=String(state>0);
    grip.setAttribute('aria-expanded', String(state>0));
    grip.setAttribute('aria-label',state===2?'Till porträtten':state===1?'Fäll in spelarlistan':'Öppna spelarlistan');
    for (const entry of records.values()) entry.row.querySelector('.portrait').inert=state===0;
    details.inert=state!==2;
    if (state===0) positionWaitingLetter();
    onVisibility?.(state===2);
  }
  grip.onclick = () => setState(state===0?1:state-1);
  drawer.addEventListener('keydown',event=>{
    if ((event.key==='Escape' && state>0) || (event.target===grip && ['ArrowLeft','ArrowRight'].includes(event.key))) {
      event.preventDefault();
      event.stopPropagation();
      setState(state+(event.key==='ArrowLeft'?1:-1));
      grip.focus({preventScroll:true});
    }
  });

  function createRow(person) {
    const row = element('div', 'member');
    const portrait = element('div', 'portrait');
    const frame = element(onDetails || (person.character && onPortrait) ? 'button' : 'span', 'face');
    if (frame.tagName === 'BUTTON') {
      frame.type = 'button';
      frame.setAttribute('aria-label', 'Visa ' + person.name);
      frame.onclick = () => {
        if (supportsFull()) { select(person); setState(2); }
        else onPortrait?.(person,frame);
      };
    } else {
      frame.setAttribute('role', 'img');
      frame.setAttribute('aria-label', person.name);
    }
    const photo = picture(person.portrait || neutralPortrait);
    if (person.portrait) photo.addEventListener('error',()=>{photo.src=neutralPortrait;},{once:true});
    frame.append(photo);

    const lamp = element(onStatus ? 'button' : 'span', 'lamp');
    if (onStatus) lamp.type = 'button';
    else lamp.setAttribute('role', 'img');
    lamp.append(picture(art.LAMP_GREEN));
    portrait.append(frame,lamp);

    const mail = element('button','mail');
    mail.type = 'button';
    const letter = picture(art.ENVELOPE);
    const count = element('span','count');
    mail.append(letter,count);

    let lastUnread;
    function refresh() {
      lamp.firstChild.src = art['LAMP_' + (person.colour || 'GREEN')];
      lamp.classList.toggle('unknown', !person.colour);
      lamp.setAttribute('aria-label', person.name + ' · ' + person.statusLabel);
      const unread = person.unread || 0;
      mail.hidden = !unread;
      count.hidden = unread < 2;
      count.textContent = unread > 99 ? '99+' : unread;
      mail.setAttribute('aria-label', person.name + ', ' + unread + ' olästa brev');
      if (unread!==lastUnread) {lastUnread=unread; positionWaitingLetter();}
    }
    if (onStatus) lamp.onclick = () => { onStatus(person); refresh(); };
    mail.onclick = () => {
      if (supportsFull()) {
        select(person,true); setState(2);
        return;
      }
      onRead?.(person,mail);
      refresh();
    };
    row.append(portrait,mail);
    refresh();
    return {row,frame,refresh,update(next) { person=next; frame.setAttribute('aria-label','Visa '+person.name); const src=person.portrait || neutralPortrait; if(photo.getAttribute('src')!==src)photo.src=src; refresh(); }};
  }

  function setPeople(people) {
    const next = new Map();
    people.forEach((person,index)=>{
      const id=key(person);
      const entry=records.get(id) || createRow(person);
      entry.update(person);
      next.set(id,entry);
      if (members.children[index]!==entry.row) members.insertBefore(entry.row,members.children[index] || null);
    });
    for (const [id,entry] of records) if (!next.has(id)) entry.row.remove();
    const previous=roster.find(p=>key(p)===selected);
    records=next; roster=people;
    const current=people.find(p=>key(p)===selected);
    if (!current) selected=undefined;
    else if (current.character!==previous?.character && state===2) select(current);
    setState(state);
    return [...records.values()];
  }

  // A tap belongs to the portrait/letter underneath it. Capture only a horizontal drag.
  let drag;
  let suppressClick = false;
  drawer.addEventListener('click',event=>{
    if (suppressClick && event.detail) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  },true);
  drawer.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('textarea,input,select,[contenteditable=true]')) return;
    suppressClick = false;
    const style = getComputedStyle(drawer);
    const travel = drawer.offsetWidth - parseFloat(style.borderLeftWidth);
    const offset = new DOMMatrixReadOnly(style.transform).m41;
    const captor = event.target;

    drag = {id:event.pointerId, startX:event.clientX, startY:event.clientY, offset, travel, captor,state};
  };
  drawer.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!suppressClick) {
      const dy = event.clientY - drag.startY;
      if (Math.abs(dy)>6 && Math.abs(dy)>Math.abs(dx)) {drag=null; return;}
      if (Math.abs(dx)<5) return;
      drawer.classList.add('dragging');
      suppressClick = true;
    }
    const offset = Math.min(drag.travel, Math.max(0, drag.offset+dx));
    drawer.style.setProperty('--offset',offset+'px');
    const firstTravel = members.offsetWidth+2*parseFloat(getComputedStyle(drawer).paddingLeft)+1;
    drawer.style.setProperty('--opening', String(Math.min(1,(drag.travel-offset)/firstTravel)));
  };
  function finish(event,cancel) {
    if (drag?.id !== event.pointerId) return;
    if (suppressClick && !cancel) {
      const dx = event.clientX-drag.startX;
      if (Math.abs(dx)>=22) setState(drag.state+(dx<0?1:-1));
    }
    const captor = drag.captor;
    drag=null;
    drawer.classList.remove('dragging');
    drawer.style.removeProperty('--opening');
    drawer.style.removeProperty('--offset');
    if (captor.hasPointerCapture(event.pointerId)) captor.releasePointerCapture(event.pointerId);
    if (cancel) suppressClick=false;
  }
  drawer.onpointerup = event=>finish(event,false);
  drawer.onpointercancel = event=>finish(event,true);
  drawer.onlostpointercapture = event=>finish(event,true);
  function resize() { setState(state); }
  media.addEventListener('change',resize);
  const observer=new ResizeObserver(positionWaitingLetter); observer.observe(drawer);
  setState(opened?1:0);
  return {setPeople,setState,setOpen:open=>setState(open?1:0),destroy(){observer.disconnect(); media.removeEventListener('change',resize);}};
}
