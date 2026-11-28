import components from './components.json';
import {createPartyPanel,loadArt,partyFirstName,partyProfileName} from './panel.js';
import styles from './panel.css?inline';
import dockStyles from './login-panel.css?inline';
import storyteller from './sl.webp';
import {connectPartyPresence} from './presence.js';

function start() {
  const login = document.getElementById('loginScreen');
  const main = document.querySelector('main');
  let host, panel, scope, live, loadedAt=0, loading=false, roster=[], people=[], rows=[];
  let lastToken, lastPage='', retryAfter=0, suspended=false;

  function mount() {
    host=document.createElement('aside');
    host.id='partyRail';
    host.setAttribute('aria-label','Spelarlista');
    const shadow=host.attachShadow({mode:'open'});
    const sheet=document.createElement('style');
    sheet.textContent=styles+'\n'+dockStyles;
    const mountPoint=document.createElement('div');
    shadow.append(sheet,mountPoint);
    panel=createPartyPanel(mountPoint,loadArt(components,host),{
      onPortrait:(person,trigger)=>window.aleaPartyCharacters?.open(person.character,trigger)
    });
    document.body.append(host);
  }
  function reset() {
    scope=null; loadedAt=retryAfter=0; loading=false; roster=[]; people=[]; rows=[]; lastPage='';
    live?.close(); live=null;
    host?.remove(); host=panel=null;
  }
  function paint() {
    const page=window.aleaRefreshLocation?.activePage() || 'landing';
    live?.move(page);
    lastPage=page;
    people.forEach((p,i)=>{
      const locations=live?.pages.get(p.owner);
      let colour=null, label='Hämtar närvaro';
      if (!navigator.onLine) label='Anslutning saknas';
      else if (p.owner===scope.user) {colour='GREEN';label='Du är inloggad';}
      else if (locations) {
        colour=locations.includes(page)?'GREEN':locations.length?'YELLOW':'RED';
        label={GREEN:'På samma sida',YELLOW:'På en annan sida',RED:'Ej ansluten'}[colour];
      }
      if (p.colour!==colour || p.statusLabel!==label) {
        p.colour=colour; p.statusLabel=label; rows[i].refresh();
      }
    });
  }
  function rebuild() {
    const known=scope.campaign && centralReady;
    const profiles=known ? campaignPlayerProfiles : [];
    const characters=known ? (window.aleaPartyCharacters?.list() || []) : [];
    const members=roster.slice().sort((a,b)=>Number(b.role==='gm')-Number(a.role==='gm'));
    if (!members.some(m=>m.user_id===scope.user)) members.push({user_id:scope.user});
    // Presence belongs to a person. Their first player character supplies the portrait.
    const next=members.map(({user_id,role})=>{
      if (role==='gm') return {owner:user_id,name:'SL',portrait:storyteller};
      const character=characters.find(c=>c.ownerId===user_id);
      const profileName=profiles.find(p=>p.id===user_id)?.display_name ||
        (user_id===scope.user ? supabaseProfile?.display_name : '');
      const name=character ? partyFirstName(window.aleaPartyCharacters.name(character)) :
        partyProfileName(profileName, user_id===scope.user ? 'Du' : 'Spelare');
      return {
        owner:user_id, character, name,
        portrait:character?window.aleaPartyCharacters.portrait(character):''
      };
    });
    if (next.length!==people.length || next.some((p,i)=>['name','portrait','owner','character'].some(k=>people[i][k]!==p[k]))) {
      people=next; rows=panel.setPeople(people);
    }
    paint();
  }
  async function fetchMembers(current) {
    loading=true;
    try {
      const result=await dbJson('campaign_members?campaign_id=eq.'+encodeURIComponent(current.campaign)+'&select=user_id,role&order=user_id');
      if (scope!==current) return;
      const changed=roster.length!==result.length || result.some((m,i)=>m.user_id!==roster[i].user_id || m.role!==roster[i].role);
      roster=result; loadedAt=Date.now(); retryAfter=0;
      if (changed || !live) {
        live?.close();
        live=roster.length && navigator.onLine ? connectPartyPresence(current.campaign,current.user,roster.map(m=>m.user_id),paint) : null;
      }
      rebuild();
    } catch {
      if (scope===current) retryAfter=Date.now()+15000;
    } finally { if (scope===current) loading=false; }
  }
  function refresh() {
    const session=typeof supabaseSession==='undefined'?null:supabaseSession;
    const user=session?.user?.id;
    if (suspended || !user || !login.classList.contains('hidden') || main.classList.contains('hidden')) {
      if (scope) reset();
      return;
    }
    const campaign=typeof centralCampaignId==='undefined'?null:centralCampaignId;
    if (!scope || user!==scope.user || campaign!==scope.campaign) {
      if (scope?.user!==user) { reset(); mount(); }
      else {
        live?.close(); live=null; roster=[]; loading=false; loadedAt=retryAfter=0;
      }
      scope={user,campaign};
    }
    if (lastToken!==session.access_token) { lastToken=session.access_token;live?.refreshToken(); }
    rebuild();
    if (campaign && navigator.onLine && !loading && Date.now()>=retryAfter && Date.now()-loadedAt>60000) void fetchMembers(scope);
  }
  const observer=new MutationObserver(()=>{
    if (!host || login.classList.contains('hidden')===false || main.classList.contains('hidden')) refresh();
    else if (lastPage!==window.aleaRefreshLocation?.activePage()) paint();
  });
  const attrs={attributes:true,attributeFilter:['class']};
  for (const section of main.querySelectorAll(':scope > section[id]')) observer.observe(section,attrs);
  // Authentication changes always re-evaluate the account binding, even if the route is unchanged.
  const authObserver=new MutationObserver(refresh);
  authObserver.observe(login,attrs);authObserver.observe(main,attrs);
  window.aleaPartyRail={refresh};
  window.addEventListener('pagehide',()=>{suspended=true;reset();});
  window.addEventListener('pageshow',()=>{suspended=false;refresh();});
  window.addEventListener('offline',()=>{live?.close();live=null;loadedAt=0;if(scope)paint();});
  window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!document.hidden && scope)refresh();},15000);
  refresh();
}
if (window.ALEA_SUPABASE_CONFIG?.name==='development' && window.parent===window) start();
