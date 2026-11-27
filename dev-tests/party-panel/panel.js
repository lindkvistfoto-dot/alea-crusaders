import {createPartyPanel,loadArt,partyFirstName} from '../../features/party/panel.js';
const sizes = document.querySelector('#sizes');
const notice = document.querySelector('#notice');
const colours = ['GREEN', 'YELLOW', 'RED'];
const statuses = ['På plats', 'Annan vy', 'Frånkopplad'];
const people = [
  ['SL', 'sl', 0, 0], ['Astrid Eldhjärta', 'astrid', 0, 2], ['Lyra Gråväv', 'lyra', 1, 0],
  ['Evalin Hugger från Caddo', 'evalin', 0, 1], ['Torin', '', 2, 0], ['Embla', '', 1, 1],
  ['Vidar', '', 0, 0], ['Sigrid', '', 0, 0],
].map(([name, portrait, status, unread]) => ({
  name:partyFirstName(name), portrait:portrait ? (portrait==='sl' ? '../../features/party/sl.webp' : 'scene/'+portrait+'.webp') : '',
  status, unread, colour:colours[status], statusLabel:statuses[status],
}));
let count = 4;
let nextRecipient = 0;

async function start() {
  const response = await fetch('../../features/party/components.json');
  if (!response.ok) throw Error('Bildregistret kunde inte läsas.');
  const art = loadArt(await response.json(), document.documentElement);
  const mobile=matchMedia('(max-width:700px), (pointer:coarse) and (max-height:540px) and (max-width:1000px)').matches;
  if (mobile) people.forEach(person=>{person.unread=0;});
  const panel = createPartyPanel(document.querySelector('#partyMount'), art, {
    opened:!mobile,
    onStatus(person) {
      person.status = (person.status + 1) % colours.length;
      person.colour = colours[person.status];
      person.statusLabel = statuses[person.status];
      notice.textContent = person.name + ' · ' + person.statusLabel;
    },
    onRead(person) {
      person.unread = 0;
      notice.textContent = 'Breven till ' + person.name + ' är markerade som lästa.';
    },
  });
  let rows;
  function show(size) {
    count=size;
    nextRecipient=0;
    rows=panel.setPeople(people.slice(0,count));
    for (const button of sizes.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.value)===count));
  }
  for (const li of document.querySelectorAll('li[data-lamp]')) {
    const img=new Image();
    img.src=art['LAMP_'+li.dataset.lamp];
    img.alt='';
    li.prepend(img);
  }
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

}
start().catch(error => {notice.textContent = 'Spelarlistan kunde inte laddas. Ladda om sidan för att försöka igen.'; console.error(error);});
