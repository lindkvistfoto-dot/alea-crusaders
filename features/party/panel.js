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
const mobileScreen = '(max-width:700px), (pointer:coarse) and (max-height:540px) and (max-width:1000px)';

export function createPartyPanel(mount, art, {opened=false, onStatus, onRead, onPortrait} = {}) {
  mount.innerHTML = `<div class="viewport"><div class="drawer" data-open="false">
    <button id="grip" type="button" aria-controls="members"></button>
    <div id="members"></div>
  </div></div>`;
  const drawer = mount.querySelector('.drawer');
  const members = mount.querySelector('#members');
  const grip = mount.querySelector('#grip');

  function setOpen(open) {
    drawer.dataset.open = String(open);
    grip.setAttribute('aria-expanded', String(open));
    grip.setAttribute('aria-label', open ? 'Fäll in spelarlistan' : 'Öppna spelarlistan');
    for (const portrait of members.querySelectorAll('.portrait')) portrait.inert = !open;
  }

  grip.onclick = () => setOpen(drawer.dataset.open !== 'true');
  drawer.addEventListener('keydown',event=>{
    if (event.key==='Escape' && drawer.dataset.open==='true') {
      event.stopPropagation();
      setOpen(false);
      grip.focus({preventScroll:true});
    }
  });

  function createRow(person) {
    const row = element('div', 'member');
    const portrait = element('div', 'portrait');
    const frame = element(person.character && onPortrait ? 'button' : 'span', 'face');
    if (frame.tagName === 'BUTTON') {
      frame.type = 'button';
      frame.setAttribute('aria-label', 'Visa ' + person.name);
      frame.onclick = () => onPortrait(person,frame);
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

    function refresh() {
      lamp.firstChild.src = art['LAMP_' + (person.colour || 'GREEN')];
      lamp.classList.toggle('unknown', !person.colour);
      lamp.setAttribute('aria-label', person.name + ' · ' + person.statusLabel);
      const unread = person.unread || 0;
      mail.hidden = !unread;
      count.hidden = unread < 2;
      count.textContent = unread > 99 ? '99+' : unread;
      mail.setAttribute('aria-label', person.name + ', ' + unread + ' olästa brev');
    }
    if (onStatus) lamp.onclick = () => { onStatus(person); refresh(); };
    mail.onclick = () => {
      if (drawer.dataset.open==='false' && matchMedia(mobileScreen).matches) {
        setOpen(true);
        return;
      }
      onRead?.(person);
      refresh();
      grip.focus({preventScroll:true});
    };
    row.append(portrait,mail);
    refresh();
    return {row,refresh};
  }

  function setPeople(people) {
    const rows = people.map(createRow);
    members.replaceChildren(...rows.map(entry => entry.row));
    setOpen(drawer.dataset.open === 'true');
    return rows;
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
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const style = getComputedStyle(drawer);
    const travel = drawer.offsetWidth - parseFloat(style.borderLeftWidth);
    const offset = new DOMMatrixReadOnly(style.transform).m41;
    const captor = event.target;
    captor.setPointerCapture(event.pointerId);
    drag = {id:event.pointerId, startX:event.clientX, startY:event.clientY, offset, travel, captor};
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
    drawer.style.setProperty('--opening', String(1-offset/drag.travel));
  };
  function finish(event,cancel) {
    if (drag?.id !== event.pointerId) return;
    if (suppressClick && !cancel) {
      const dx = event.clientX-drag.startX;
      setOpen(drag.offset+dx < drag.travel/2);
    }
    const captor = drag.captor;
    drag=null;
    drawer.classList.remove('dragging');
    drawer.style.removeProperty('--opening');
    if (captor.hasPointerCapture(event.pointerId)) captor.releasePointerCapture(event.pointerId);
    if (cancel) suppressClick=false;
  }
  drawer.onpointerup = event=>finish(event,false);
  drawer.onpointercancel = event=>finish(event,true);
  drawer.onlostpointercapture = event=>finish(event,true);
  setOpen(opened);
  return {setPeople,setOpen};
}
