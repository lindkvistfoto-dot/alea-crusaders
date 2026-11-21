import { openCryptSession } from './session.js';
import { HERO_PROFILES, heroPortraitStyle } from './hero-class.js';
import { mountCrypt } from './render.js';

const artFirst=new URLSearchParams(location.search).get('art')==='1';
const livingDarkness=artFirst && new URLSearchParams(location.search).get('darkness')==='1';
let painting;
const $ = id => document.getElementById(id);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { camera: 'map', wallMode: 'low', grid: false, sunlight: true, reducedMotion: motionPreference.matches };
const nameOf = actor => actor?.name || '';
const shortName = actor => nameOf(actor).split(' ')[0];
const makeButton = (label, callback) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', callback);
  return b;
};

let session, renderer, projection, currentHostView, selectedId, playerPreview = false;
let guardTargeting = false, pendingCommand = false, feedbackTimer, diceTimer;
let lastJournalId = null, lastRole = null, currentJournalSignature = '', currentPendingSignature = '';
let renderedHeroIds = '', lastInviteActor = '';
let destroyed = false;

function announce(text) {
  clearTimeout(feedbackTimer);
  $('feedback').textContent = text || '';
  if (text) feedbackTimer = setTimeout(() => { $('feedback').textContent = ''; }, 6000);
}

function showStartupError(text) {
  $('startup-error').textContent = text;
  $('startup-error').hidden = false;
  $('map-placeholder').textContent = 'Kartan kunde inte öppnas.';
  $('board').setAttribute('aria-busy', 'false');
}

function heroes() { return projection?.actors.filter(a => a.kind === 'hero') || []; }
function selectedHero() { return heroes().find(a => a.id === selectedId); }
function guard() { return projection?.actors.find(a => a.kind === 'guard'); }
function isGM() { return session?.role === 'gm' && !playerPreview; }
function canControl(actor) { return !!actor && !!session && (isGM() || (!playerPreview && session.actorId === actor.id)); }
function charBattle(id) { return projection?.battle?.combatants?.find(c => c.id === id); }

function drawMap() {
  if (!renderer || !projection) return;
  renderer.update(projection, { ...settings, selectedHero: selectedId });
}

function setSelection(id) {
  if (!heroes().some(a => a.id === id)) return;
  selectedId = id;
  guardTargeting = false;
  refreshControls();
  drawMap();
}

function updateHeroes() {
  const members = heroes();
  const signature = members.map(a => a.id + ':' + a.name).join('|');
  if (signature !== renderedHeroIds) {
    renderedHeroIds = signature;
    const nodes = members.map(a => {
      const b = makeButton('', () => setSelection(a.id));
      b.className = 'hero-choice';
      b.dataset.hero = a.id;
      b.setAttribute('aria-label', a.name);
      const portrait = document.createElement('span');
      portrait.className = 'hero-portrait';
      if (HERO_PROFILES[a.id]) Object.assign(portrait.style, heroPortraitStyle(a.id));
      const label = document.createElement('span');
      label.textContent = shortName(a);
      b.append(portrait, label);
      return b;
    });
    $('hero-list').replaceChildren(...nodes);
  }
  for (const b of $('hero-list').children) b.setAttribute('aria-pressed', String(b.dataset.hero === selectedId));
}

function updateJournal() {
  const journal = projection.journal || [];
  const entries = journal.slice(-10).reverse();
  const signature = JSON.stringify(entries);
  if (currentJournalSignature !== signature) {
    currentJournalSignature = signature;
    $('journal-count').textContent = journal.length ? String(journal.length) : '';
    const list = entries.map(entry => {
      const li = document.createElement('li');
      li.textContent = entry.text;
      return li;
    });
    if (!list.length) {
      const item = document.createElement('li');
      item.textContent = 'Inga spelhändelser ännu.';
      list.push(item);
    }
    $('journal').replaceChildren(...list);
  }
}

function updatePending() {
  const requests = isGM() ? projection.pending || [] : [];
  const signature = JSON.stringify(requests);
  if (signature === currentPendingSignature) return;
  currentPendingSignature = signature;
  const items = requests.map(request => {
    const section = document.createElement('div');
    section.className = 'pending-item';
    const who = heroes().find(a => a.id === request.actorId);
    section.append(document.createTextNode((shortName(who) || 'En rollperson') + ' vill passera dörren.'));
    const actions = document.createElement('div');
    actions.append(makeButton('Godkänn', () => dispatch({ type: 'approve', requestId: request.id })),
      makeButton('Avslå', () => dispatch({ type: 'deny', requestId: request.id })));
    section.append(actions);
    return section;
  });
  $('pending').replaceChildren(...items);
}

function showConfirmedRoll(journal) {
  const latest = journal?.at(-1);
  const key = latest?.id ?? latest?.text;
  const newRoll = lastRole === projection.role && lastJournalId !== null && key !== lastJournalId &&
    latest?.skill !== 'danger' && Number.isFinite(latest?.roll);
  lastRole = projection.role;
  lastJournalId = key ?? '';
  if (!newRoll) return;
  const text = ['T20 ' + latest.roll];
  if (Number.isFinite(latest.confirmationRoll)) text.push('kontroll ' + latest.confirmationRoll);
  if (Number.isFinite(latest.fv)) text.push('FV ' + latest.fv);
  const out = $('dice-result');
  out.textContent = text.join(' · ');
  out.dataset.motion = String(!settings.reducedMotion);
  out.hidden = false;
  clearTimeout(diceTimer);
  diceTimer = setTimeout(() => { out.hidden = true; }, 3300);
}

function updateCombat(hero, actorControlled) {
  const battle = projection.battle;
  const inCombat = !!battle;
  const stats = charBattle(hero?.id);
  const isTurn = inCombat && battle.activeActorId === hero?.id;
  const active = projection.actors.find(a => a.id === battle?.activeActorId);
  const enemy = guard();
  const personalSight = !!hero && !!enemy?.seenBy?.includes(hero.id);
  const turnAction = actorControlled && isTurn && stats?.actionAvailable;
  $('combat-info').hidden = !inCombat;
  if (inCombat) {
    const info = ['Runda ' + battle.round, active ? shortName(active) + ' har turen' : 'Inväntar nästa tur'];
    if (stats) {
      info.push(stats.hp + '/' + stats.maxHp + ' KP');
      if (isTurn) info.push(stats.movementRemaining + ' hex kvar', stats.actionAvailable ? 'Handling kvar' : 'Handling använd');
      if (stats.weapon) info.push(stats.weapon);
    }
    $('combat-info').textContent = info.join(' · ');
  }
  $('attack-target').textContent = enemy ? 'Anfall ' + enemy.name : 'Anfall';
  $('attack').hidden = !inCombat || !enemy;
  $('attack').disabled = !turnAction || pendingCommand || !personalSight;
  $('weapon').hidden = !inCombat;
  $('weapon').disabled = !turnAction || pendingCommand;
  $('combat-action').textContent = inCombat ? 'Avsluta strid' : 'Starta strid';
  $('next-turn').hidden = !isGM() || !inCombat;
  $('guard-attack').hidden = !isGM() || !inCombat || !enemy || battle.activeActorId !== enemy.id;
  $('guard-attack').disabled = !hero || pendingCommand;
  $('guard-attack').textContent = enemy && isGM() ? enemy.name + ' anfaller ' + shortName(hero) : 'Anfall vald rollperson';
  return { inCombat, isTurn, stats, personalSight };
}

function refreshControls() {
  if (!projection || !session) return;
  const hero = selectedHero();
  const control = canControl(hero);
  const gm = isGM();
  $('role').textContent = playerPreview ? 'Spelarens perspektiv' : gm ? 'Spelledare' :
    'Spelare · ' + shortName(heroes().find(a => a.id === session.actorId));
  $('phase').textContent = projection.phase === 'combat' ? 'Strid' : 'Äventyr';
  $('gm-title').hidden = session.role !== 'gm';
  $('perspective').textContent = playerPreview ? 'Till spelledarvyn' : 'Visa som spelare';
  $('perspective').setAttribute('aria-pressed', String(playerPreview));
  $('invite').hidden = !gm;
  $('gm-tools').hidden = !gm;
  $('prepare').hidden = !gm || artFirst;
  $('prepare').disabled = pendingCommand || projection.canPrepare === false;
  $('reset').hidden = !gm;
  $('wall-field').hidden = !gm || artFirst;
  $('sun-field').hidden = !gm;
  $('hero-sheet').hidden = !hero;
  updateHeroes();
  if (hero) {
    $('hero-name').textContent = hero.name;
    const role = { astrid: 'Krigare', lyra: 'Magiker · mörkerseende i spelprovet', evalin: 'Fackelbärare' };
    $('hero-detail').textContent = role[hero.id] || '';
  }
  const { inCombat, isTurn, stats, personalSight } = updateCombat(hero, control);
  $('search').disabled = !control || pendingCommand || (inCombat && (!isTurn || !stats?.actionAvailable));
  const waiting = projection.pending?.some(item => item.actorId === hero?.id);
  const hint = playerPreview ? 'Här ser du gruppens gemensamma synfält. Mörkare golv visar det gruppen minns.' :
    !control ? 'Du kan följa denna rollperson. Välj din egen för att agera.' :
    guardTargeting ? 'Tryck på en fri golvyta för att flytta vakten.' :
    waiting ? shortName(hero) + ' väntar på spelledarens godkännande av passagen.' :
    inCombat && !isTurn ? 'Välj en rollperson för att se utrustning och handlingar.' :
    'Tryck på golvet för att flytta ' + shortName(hero) + '.';
  $('action-hint').textContent = hint;
  const discoveries = projection.discoveries || [];
  $('discoveries').hidden = !discoveries.length;
  $('discoveries').textContent = discoveries.length ? 'Upptäckt: ' + discoveries.map(d => d.name).join(', ') : '';
  const enemy = guard();
  const observers = (enemy?.seenBy || []).map(id => shortName(heroes().find(a => a.id === id))).filter(Boolean);
  $('observed').hidden = !enemy;
  $('observed').textContent = !enemy ? '' : observers.length ? enemy.name + ' ses av ' + observers.join(', ') + '.' :
    (gm ? enemy.name + ' är utom gruppens synfält.' : 'Gruppen ser ' + enemy.name + '.');
  if (inCombat && enemy && hero && !personalSight) {
    $('observed').textContent += ' ' + shortName(hero) + ' behöver själv se målet för att anfalla.';
  }
  for (const b of $('step-buttons').children) b.disabled = !control || pendingCommand || (inCombat && !isTurn);
  $('guard-move').setAttribute('aria-pressed', String(guardTargeting));
  $('guard-move').textContent = guardTargeting ? 'Avbryt placering' : (gm ? 'Flytta vakten' : 'Flytta motståndare');
  $('environment-bar').hidden = false;
  $('door-item').hidden = !projection.door;
  if (projection.door) {
    $('door-value').textContent = projection.door.open ? 'Öppen' : 'Stängd';
    $('door-action').textContent = projection.door.open ? 'Stäng dörren' : 'Öppna dörren';
    $('door-action').disabled = !control || pendingCommand;
  }
  $('torch-item').hidden = !projection.torch;
  if (projection.torch) {
    $('torch-value').textContent = projection.torch.on ? 'Tänd' : 'Släckt';
    $('torch-action').textContent = projection.torch.on ? 'Släck facklan' : 'Tänd facklan';
    $('torch-action').disabled = pendingCommand || (!gm && (playerPreview || session.actorId !== 'evalin'));
  }
  for (const id of ['combat-action','next-turn','guard-move','reset']) $(id).disabled = pendingCommand;
  if(artFirst){
    const lamps=projection.lamps??[];
    $('lamp-tools').hidden=!gm;
    const selector=$('lamp-select');
    if(gm && selector.options.length===0){
      selector.add(new Option('Alla fasta ljus','all'));
      for(const l of lamps)selector.add(new Option(l.name,String(l.id)));
    }
    if(gm){
      const affected=lamps.filter(l=>selector.value==='all'||String(l.id)===selector.value);
      $('lamp-toggle').textContent=affected.some(l=>l.on)?'Släck':'Tänd';
    }
  }
  updatePending();
  for (const b of $('pending').querySelectorAll('button')) b.disabled = pendingCommand;
  updateJournal();
}

function clearProjection() {
  currentHostView = null; projection = null;
  resetOverlay();
  renderedHeroIds = currentJournalSignature = currentPendingSignature = '';
  for (const id of ['hero-list','hero-name','hero-detail','journal','pending','observed','discoveries','combat-info','action-hint']) $(id).replaceChildren();
  $('attack-target').textContent = 'Anfall';
  $('role').textContent = 'Spelare';
  $('phase').textContent = 'Inväntar spelbordet';
  $('journal-count').textContent = '';
  $('hero-sheet').hidden = true;
  $('environment-bar').hidden = true;
  $('gm-title').hidden = true;
  $('gm-tools').hidden = true;
  $('scene').style.visibility = 'hidden';
  renderer?.clear?.();
  $('map-placeholder').hidden = false;
  $('map-placeholder').textContent = session?.status || 'Väntar på spelledaren …';
  $('board').setAttribute('aria-busy', 'true');
}

function showProjection(hostView) {
  if (!hostView) { clearProjection(); return; }
  currentHostView = hostView;
  if (!session) return;
  $('scene').style.visibility = '';
  projection = playerPreview ? session.playerView() : currentHostView;
  const roster = heroes();
  if (!roster.some(a => a.id === selectedId)) selectedId =
    roster.find(a => a.id === session.actorId)?.id || roster.find(a => a.id === 'evalin')?.id || roster[0]?.id;
  $('board').setAttribute('aria-busy', 'false');
  if (renderer) $('map-placeholder').hidden = true;
  showConfirmedRoll(projection.journal);
  refreshControls();
  drawMap();
}

async function dispatch(action, successText) {
  if (!session || !projection || playerPreview || pendingCommand) return false;
  pendingCommand = true;
  refreshControls();
  const previous = projection.journal?.at(-1);
  try {
    await session.command(action);
    const latest = projection.journal?.at(-1);
    if (latest && (latest.id !== previous?.id || latest.text !== previous?.text)) announce(latest.text);
    else if (successText) announce(successText);
    return true;
  } catch (error) {
    announce(error.message || 'Handlingen kunde inte utföras.');
    return false;
  } finally {
    pendingCommand = false;
    refreshControls();
  }
}

function handlePoint(point) {
  if (!Array.isArray(point) || !projection || !session) return;
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (guardTargeting && isGM()) {
    void dispatch({ type: 'guard', x, y }).then(ok => {
      if (ok) guardTargeting = false;
      refreshControls();
    });
    return;
  }
  const hero = selectedHero();
  if (canControl(hero)) void dispatch({ type: 'move', actorId: hero.id, x, y });
}

function toggleDoor() {
  if (!projection?.door || !canControl(selectedHero())) return;
  void dispatch({ type: 'door', actorId: selectedId, open: !projection.door.open });
}

function selectGuard() {
  if (!guard()) return;
  if (projection.battle && !$('attack').disabled) {
    $('attack').focus({ preventScroll: true });
    announce('Målet är valt. Tryck på anfallsknappen för att slå.');
  } else announce($('observed').textContent);
}

function resetOverlay() {
  $('dice-result').hidden = true;
  $('feedback').textContent = '';
  lastJournalId = null;
  lastRole = null;
  guardTargeting = false;
}

function updateInviteLink() {
  if (!isGM()) return;
  lastInviteActor = $('invite-actor').value;
  $('open-invite').href = session.invite(lastInviteActor);
  $('invite-feedback').textContent = '';
}

function bind() {
  $('perspective').onclick = () => {
    if (session?.role !== 'gm') return;
    playerPreview = !playerPreview;
    resetOverlay();
    showProjection(session.view);
  };
  $('door-action').onclick = toggleDoor;
  $('torch-action').onclick = () => void dispatch({ type: 'torch', actorId: 'evalin', on: !projection.torch.on });
  $('search').onclick = () => void dispatch({ type: 'search', actorId: selectedId });
  $('attack').onclick = () => void dispatch({ type: 'attack', actorId: selectedId, targetId: guard()?.id });
  $('weapon').onclick = () => void dispatch({ type: 'switchWeapon', actorId: selectedId });
  $('guard-attack').onclick = () => void dispatch({ type: 'attack', actorId: guard()?.id, targetId: selectedId });
  $('guard-move').onclick = () => {
    guardTargeting = !guardTargeting;
    refreshControls();
    if (guardTargeting) announce('Välj vaktens nya plats på kartan.');
  };
  $('combat-action').onclick = () => void dispatch({ type: projection.battle ? 'endCombat' : 'startCombat' });
  $('next-turn').onclick = () => void dispatch({ type: 'nextTurn' });
  $('prepare').onclick = async () => {
    if (!isGM()) return;
    try {
      const { openCryptPreparation } = await import('./preparation-ui.js');
      openCryptPreparation(projection, async values => {
        if (!await dispatch({ type: 'prepare', ...values })) throw Error('Förberedelsen kunde inte sparas.');
      });
    } catch (error) { announce(error.message); }
  };
  $('step-buttons').addEventListener('click', e => {
    const direction = e.target.closest('button')?.dataset.step;
    const offsets = { northwest: [-.5, -Math.sqrt(3)/2], northeast: [.5, -Math.sqrt(3)/2], west: [-1,0],
      east: [1,0], southwest: [-.5, Math.sqrt(3)/2], southeast: [.5, Math.sqrt(3)/2] };
    const hero = selectedHero();
    if (!offsets[direction] || !canControl(hero)) return;
    const pitch = projection.pixelsPerMeter * 1.5;
    const [dx,dy] = offsets[direction];
    const figure = guardTargeting && isGM() ? guard() : hero;
    if (figure) handlePoint([figure.x + pitch * dx, figure.y + pitch * dy]);
  });
  for (const button of document.querySelectorAll('[data-camera]')) button.onclick = () => {
    settings.camera = button.dataset.camera;
    for (const b of document.querySelectorAll('[data-camera]')) b.setAttribute('aria-pressed', String(b === button));
    drawMap();
  };
  $('grid').onclick = () => {
    settings.grid = !settings.grid;
    $('grid').setAttribute('aria-pressed', String(settings.grid));
    drawMap();
  };
  $('wall-style').onchange = e => { settings.wallMode = e.currentTarget.value; drawMap(); };
  $('sunlight').onchange = e => { settings.sunlight = e.currentTarget.checked; drawMap(); };
  $('motion').checked = settings.reducedMotion;
  $('motion').onchange = e => { settings.reducedMotion = e.currentTarget.checked; drawMap(); };
  motionPreference.addEventListener('change', e => {
    settings.reducedMotion = $('motion').checked = e.matches;
    drawMap();
  });
  for (const b of document.querySelectorAll('.dialog-close')) b.onclick = () => b.closest('dialog').close();
  $('reset').onclick = () => { if (isGM()) $('reset-dialog').showModal(); };
  $('confirm-reset').onclick = async () => {
    $('reset-dialog').close();
    if (pendingCommand || !isGM()) return;
    try {
      pendingCommand = true;
      resetOverlay();
      await session.reset();
      announce('Spelprovet har börjat om.');
    } catch (error) { announce(error.message); }
    finally { pendingCommand = false; refreshControls(); }
  };
  $('invite').onclick = () => {
    if (!isGM()) return;
    $('invite-actor').replaceChildren(...heroes().map(a => new Option(a.name, a.id)));
    $('invite-actor').value = lastInviteActor || selectedId;
    updateInviteLink();
    $('invite-dialog').showModal();
  };
  $('invite-actor').onchange = updateInviteLink;
  $('copy-invite').onclick = async () => {
    const link = $('open-invite').href;
    try {
      await navigator.clipboard.writeText(link);
      $('invite-feedback').textContent = 'Spelarlänken har kopierats.';
    } catch {
      const field = document.createElement('input');
      field.readOnly = true;
      field.setAttribute('aria-label', 'Spelarlänk att kopiera');
      field.value = link;
      $('invite-feedback').replaceChildren(field);
      field.focus(); field.select();
    }
  };
}

async function start() {
  bind();
  if(artFirst) {
    document.body.classList.add('art-first');
    document.title='Den målade kryptan · ALEA Crusaders';
    document.querySelector('h1').textContent='Den målade kryptan';
    $('compare').href='./kryptans-dorr?compare=1';$('compare').textContent='Jämför med Kryptans dörr';$('compare').hidden=false;
    $('lamp-select').onchange=refreshControls;
    $('lamp-toggle').onclick=()=>{
      const val=$('lamp-select').value,lamp=val==='all'?'all':Number(val);
      const on=!projection.lamps.some(l=>(lamp==='all'||l.id===lamp)&&l.on);
      return dispatch({type:'lamps',lamp,on});
    };
    const module=await import('../art-first/painting.js');
    const host=!new URLSearchParams(location.hash.slice(1)).has('player');
    if(livingDarkness){
      Object.assign(settings,{model:'b',ambient:.78,reach:1,flicker:.35,sunlight:false});
      $('sunlight').checked=false;
      $('light-lab').hidden=false;
      for(const button of document.querySelectorAll('[data-light-model]'))button.onclick=()=>{
        settings.model=button.dataset.lightModel;
        for(const b of document.querySelectorAll('[data-light-model]'))b.setAttribute('aria-pressed',String(b===button));
        $('light-controls').hidden=settings.model!=='b';drawMap();
      };
      for(const id of ['ambient','reach','flicker'])$(id).oninput=()=>{
        settings[id]=Number($(id).value)/100;
        document.querySelector('output[for="'+id+'"]').value=$(id).value+' %';drawMap();
      };
    }
    const studio=host?await module.hostPainting(livingDarkness):null;
    painting={...module,studio,experiment:livingDarkness};
  } else if(new URLSearchParams(location.search).has('compare')) {
    $('compare').href='./kryptans-dorr?art=1';$('compare').textContent='Till den målade kryptan';$('compare').hidden=false;
  }
  const startup = openCryptSession({
    ...(artFirst?{loadWorld:async()=>{
      const [world,{chamber}]=await Promise.all([import('./world.js'),import('../art-first/chamber.js')]);
      // Register both models on the warm master’s exact aspect. The common
      // height keeps every existing foot anchor, hex and wall in world units.
      const map=livingDarkness?{...chamber,livingDarkness:true,width:chamber.height*painting.studio.aspect}:chamber;
      return {...world,createWorld:()=>world.createWorld({map})};
    },decoratePlayerView:view=>painting.studio.decorate(view)}:{}),
    onView: showProjection,
    onStatus: text => {
      $('connection').textContent = text;
      if (!currentHostView) $('map-placeholder').textContent = text;
    },
    onError: error => announce(error.message)
  });
  const map = mountCrypt($('scene'), { onHero: setSelection, onPoint: handlePoint, onDoor: toggleDoor, onGuard: selectGuard },painting);
  const [opened, mounted] = await Promise.allSettled([startup,map]);
  if (opened.status === 'fulfilled') session = opened.value;
  if (mounted.status === 'fulfilled') renderer = mounted.value;
  if (destroyed) { session?.close(); renderer?.destroy(); return; }
  if (opened.status === 'rejected' || mounted.status === 'rejected') {
    const error = opened.reason || mounted.reason;
    showStartupError(error?.message || 'Spelbordet kunde inte öppnas.');
    session?.close();
    renderer?.destroy();
    return;
  }
  if (session.view) showProjection(session.view);
  else clearProjection();
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  destroyed = true;
  session?.close(); renderer?.destroy();
});
start().catch(error => showStartupError(error.message));

