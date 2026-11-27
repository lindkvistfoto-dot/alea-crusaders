const drawer = document.querySelector('.drawer');
const members = document.querySelector('#members');
const grip = document.querySelector('#grip');
const notice = document.querySelector('#notice');
const sizes = document.querySelector('#sizes');
const colours = ['GREEN', 'YELLOW', 'RED'];
const statuses = ['På plats', 'Annan vy', 'Frånkopplad'];
const people = [
  ['SL', 'sl', 0, 0], ['Astrid', 'astrid', 0, 2], ['Lyra', 'lyra', 1, 0],
  ['Evalin', 'evalin', 0, 1], ['Torin', '', 2, 0], ['Embla', '', 1, 1],
  ['Vidar', '', 0, 0], ['Sigrid', '', 0, 0],
].map(([name, portrait, status, unread]) => ({name, portrait, status, unread}));
let count = 4;
let nextRecipient = 0;
let art;
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
function setOpen(open) {
  drawer.dataset.open = String(open);
  grip.setAttribute('aria-expanded', String(open));
  grip.setAttribute('aria-label', open ? 'Fäll in spelarlistan' : 'Dra ut spelarlistan');
  grip.title = open ? 'Dra eller klicka för att fälla in' : 'Dra eller klicka för att öppna';
  grip.firstElementChild.src = art[open ? 'ARROW_RIGHT' : 'ARROW_LEFT'];
  for (const node of members.querySelectorAll('.details')) node.inert = !open;
  // Keep off-screen portrait art behind the rail throughout the animation.
  document.querySelector('.panel-heading').setAttribute('aria-hidden', String(!open));
}
function letter(person, update, lamp) {
  const button = element('button', 'mail');
  button.type = 'button';
  const envelope = element('span', 'letter');
  const badge = element('span', 'count');
  envelope.append(badge);
  button.append(envelope);
  button.onclick = () => {
    person.unread = 0;
    update();
    lamp.focus({preventScroll:true});
    notice.textContent = 'Breven till ' + person.name + ' är markerade som lästa.';
  };
  return button;
}
function member(person) {
  const row = element('div', 'member');
  const lamp = element('button', 'lamp');
  lamp.type = 'button';
  lamp.append(picture(art['LAMP_' + colours[person.status]]));
  const detail = element('div', 'details');
  const frame = element('span', 'face');
  if (person.portrait) frame.append(picture('scene/' + person.portrait + '.webp'));
  else {
    const initial = element('span','initial');
    initial.textContent = person.name[0];
    frame.append(initial);
  }
  const name = element('span', 'name');
  name.textContent = person.name;
  const mail = letter(person, refresh, lamp);
  function refresh() {
    lamp.firstChild.src = art['LAMP_' + colours[person.status]];
    lamp.title = person.name + ' · ' + statuses[person.status] + ' · Ändra status';
    lamp.setAttribute('aria-label', lamp.title);
    mail.hidden = person.unread === 0;
    mail.querySelector('.count').textContent = person.unread > 99 ? '99+' : person.unread;
    mail.setAttribute('aria-label', person.name + ', ' + person.unread + ' olästa brev. Markera som lästa');
  }
  lamp.onclick = () => {
    person.status = (person.status + 1) % colours.length;
    refresh();
    notice.textContent = person.name + ' · ' + statuses[person.status];
  };
  detail.append(frame,name);
  row.append(mail,lamp,detail);
  refresh();
  return {row,refresh};
}
let rows = [];
function show(size) {
  count = size;
  nextRecipient = 0;
  rows = people.slice(0,count).map(member);
  members.replaceChildren(...rows.map(entry => entry.row));
  for (const button of sizes.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.value) === count));
  setOpen(drawer.dataset.open === 'true');
}
async function start() {
  const response = await fetch('components.json');
  if (!response.ok) throw Error('Bildregistret kunde inte läsas.');
  const components = await response.json();
  art = {};
  for (const {key,url} of components) {
    const shortName = key.replace('ARCANE_PARTY_', '');
    art[shortName] = url;
    document.documentElement.style.setProperty('--' + shortName.toLowerCase().replaceAll('_','-'), 'url("' + url + '")');
  }
  for (const li of document.querySelectorAll('li[data-lamp]')) li.prepend(picture(art['LAMP_' + li.dataset.lamp]));
  for (const n of [1,3,4,5,8]) {
    const button = document.createElement('button');
    button.type = 'button'; button.value = n; button.textContent = n;
    button.onclick = () => show(n);
    sizes.append(button);
  }
  show(count);
  document.querySelector('#send').onclick = () => {
    const i = nextRecipient++ % count;
    people[i].unread++;
    rows[i].refresh();
    notice.textContent = 'Ett nytt brev till ' + people[i].name + '.';
  };
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
}
start().catch(error => {notice.textContent = 'Spelarlistan kunde inte laddas. Ladda om sidan för att försöka igen.'; console.error(error);});
