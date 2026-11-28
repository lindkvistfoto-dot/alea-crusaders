import {createPartyPanel,loadArt,partyFirstName} from '../../features/party/panel.js';
import {createPersonDetails} from '../../features/party/person-details.js';
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
const archetypes=[
  ['Krigare','Svärd'],['Magiker','Stav'],['Krigare','Kortsvärd']
];
for (const [i,person] of people.entries()) {
  person.owner='demo-'+i;
  person.letters=[];
  if (!i) continue;
  const [yrke,weapon]=archetypes[(i-1)%archetypes.length];
  person.character={id:person.owner,identity:{namn:person.name,yrke},
    base:{STY:{v:14},SMI:{v:13},INT:{v:12},FYS:{v:15}},
    live:{KP:13,KPmax:15,PSY:10,PSYmax:12},
    skills:['Upptäcka fara','Smyga','Klättra','Finna dolda ting','Simma','Rida','Orientering','Lyssna','Första hjälpen','Spåra','Läsa och skriva','Hoppa'].map((name,j)=>({name,fv:14-j%5,erf:0})),
    weapons:[{name:weapon,fv:14}],equipment:[{name:'Fackla',count:2,bep:1}]};
}
let count = 4;
let nextRecipient = 0;

async function start() {
  const response = await fetch('../../features/party/components.json');
  if (!response.ok) throw Error('Bildregistret kunde inte läsas.');
  const art = loadArt(await response.json(), document.documentElement);
  const mobile=matchMedia('(max-width:700px), (pointer:coarse) and (max-height:540px) and (max-width:1000px)').matches;
  if (mobile) people.forEach(person=>{person.unread=0;});
  let detail;
  const inbox={
    list:p=>p.letters,
    mark(p,ids){for(const m of p.letters)if(ids.includes(m.id))m.read=true;update(p);},
    send(p,text){p.letters.push({id:crypto.randomUUID(),text,mine:true,read:true});update(p);}
  };
  function update(person) {
    person.unread=person.letters.filter(m=>!m.mine&&!m.read).length;
    rows[people.indexOf(person)]?.refresh();
  }
  const panel = createPartyPanel(document.querySelector('#partyMount'), art, {
    opened:!mobile,
    onDetails(container,person,messages){
      detail??=createPersonDetails(container,{sheet:()=>window.aleaPartyCharacters,inbox});
      detail.select(person,messages);
    },
    onVisibility:full=>detail?.setVisible(full),
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
    const p=people[i];
    p.letters.push({id:crypto.randomUUID(),text:'Jag väntar vid kryptans port.',mine:false,read:false});
    update(p); void detail?.refreshMail();
    notice.textContent = 'Ett nytt brev till ' + people[i].name + '.';
  };

}
start().catch(error => {notice.textContent = 'Spelarlistan kunde inte laddas. Ladda om sidan för att försöka igen.'; console.error(error);});
