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

export function loadArt(components, target) {
  const art = {};
  for (const {key,url} of components) {
    const shortName = key.replace('ARCANE_PARTY_', '');
    art[shortName] = url;
    target.style.setProperty('--' + shortName.toLowerCase().replaceAll('_','-'), 'url("' + url + '")');
  }
  return art;
}

export function createPartyPanel(mount, art, {opened=false, onStatus, onRead, onPortrait} = {}) {
  mount.innerHTML = `<div class="viewport"><div class="drawer-track"><div class="drawer" data-open="false">
      <div class="skin rail" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="skin panel" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="panel-heading">Följet</div>
      <div id="members"></div>
      <button id="grip" type="button" aria-controls="members" aria-expanded="false" aria-label="Fäll in spelarlistan" title="Dra eller klicka för att fälla in"><img alt=""></button>
      <div class="windrose" aria-hidden="true"></div>
    </div></div></div>`;
  const drawer = mount.querySelector('.drawer');
  const members = mount.querySelector('#members');
  const grip = mount.querySelector('#grip');
  function setOpen(open) {
    drawer.dataset.open = String(open);
    grip.setAttribute('aria-expanded', String(open));
    grip.setAttribute('aria-label', open ? 'Fäll in spelarlistan' : 'Dra ut spelarlistan');
    grip.title = open ? 'Dra eller klicka för att fälla in' : 'Dra eller klicka för att öppna';
    grip.firstElementChild.src = art[open ? 'ARROW_RIGHT' : 'ARROW_LEFT'];
    for (const node of members.querySelectorAll('.details')) node.inert = !open;
    // Keep off-screen portrait art behind the rail throughout the animation.
    mount.querySelector('.panel-heading').setAttribute('aria-hidden', String(!open));
  }

  function createRow(person) {
    const row = element('div', 'member');
    const lamp = element(onStatus ? 'button' : 'span', 'lamp');
    if (onStatus) lamp.type = 'button';
    else lamp.setAttribute('role', 'img');
    lamp.append(picture(art.LAMP_GREEN));
    const detail = element('div', 'details');
    const frame = element(person.character && onPortrait ? 'button' : 'span', 'face');
    if (frame.tagName === 'BUTTON') {
      frame.type = 'button';
      frame.setAttribute('aria-label', 'Visa ' + person.name);
      frame.onclick = () => onPortrait(person);
    }
    if (person.portrait) frame.append(picture(person.portrait));
    else {
      const initial = element('span','initial');
      initial.textContent = person.name[0];
      frame.append(initial);
    }
    const name = element('span', 'name');
    name.textContent = person.name;
    detail.append(frame,name);
    const mail = element('button','mail');
    mail.type = 'button';
    const envelope = element('span','letter');
    const badge = element('span','count');
    envelope.append(badge);
    mail.append(envelope);
    function refresh() {
      lamp.firstChild.src = art['LAMP_' + (person.colour || 'GREEN')];
      lamp.classList.toggle('unknown', !person.colour);
      lamp.title = person.name + ' · ' + person.statusLabel + (onStatus ? ' · Ändra status' : '');
      lamp.setAttribute('aria-label', lamp.title);
      mail.hidden = !person.unread;
      badge.textContent = person.unread > 99 ? '99+' : person.unread;
      mail.setAttribute('aria-label', person.name + ', ' + person.unread + ' olästa brev. Markera som lästa');
    }
    if (onStatus) lamp.onclick = () => { onStatus(person); refresh(); };
    mail.onclick = () => { onRead?.(person); refresh(); lamp.focus({preventScroll:true}); };
    row.append(mail,lamp,detail);
    refresh();
    return {row,refresh};
  }

  function setPeople(people) {
    const rows = people.map(createRow);
    members.replaceChildren(...rows.map(entry => entry.row));
    setOpen(drawer.dataset.open === 'true');
    return rows;
  }
  // Keyboard activation uses the native button click. A completed drag consumes its subsequent click.
  let drag = null;
  let consumed = false;
  grip.onclick = () => {
    if (!consumed) setOpen(drawer.dataset.open !== 'true');
    consumed = false;
  };
  grip.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    consumed = false;
    const wing = parseFloat(getComputedStyle(drawer).getPropertyValue('--wing'));
    drag = {id:event.pointerId, start:event.clientX, wing, offset:drawer.dataset.open === 'true' ? 0 : wing};
    grip.setPointerCapture(event.pointerId);
  };
  grip.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    const delta = event.clientX - drag.start;
    if (Math.abs(delta) < 5 && !consumed) return;
    consumed = true;
    drawer.classList.add('dragging');
    const offset = Math.min(drag.wing, Math.max(0, drag.offset + delta));
    drawer.style.setProperty('--opening', String(1 - offset / drag.wing));
  };
  function finish(event, cancel) {
    if (drag?.id !== event.pointerId) return;
    if (consumed && !cancel) setOpen(drag.offset + event.clientX - drag.start < drag.wing/2);
    drawer.classList.remove('dragging');
    drawer.style.removeProperty('--opening');
    grip.releasePointerCapture(event.pointerId);
    drag = null;
    if (cancel) consumed = false;
  }
  grip.onpointerup = event => finish(event,false);
  grip.onpointercancel = event => finish(event,true);
  setOpen(opened);
  return {setPeople, setOpen};
}
