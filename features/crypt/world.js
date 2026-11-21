// This module and the unpublished world state belong to the session authority.
// A player connection receives only projectWorld output and sends an intent.
import { createEncounter, projectEncounter, resolveEncounterCommand, resolveAdventureSkill } from './rules.js';
import { prepareCryptMap } from './preparation.js';
import { HERO_PROFILES, REFERENCE_HEIGHT_CM } from './hero-class.js';
import {
  DEFAULT_CRYPT_MAP, distance, doorSettlesClear, hexAt, hexCenter, hexDistance, isFloor, knownFloor, perception,
  point, portal, renderGeometry, route, side, validateMap
} from './scene.js';

const SESSION_SCHEMA = 1;
const privateViews = new WeakMap();
const publicActor = ({id,kind,name,x,y,heightCm,hp,weaponIndex}) => ({id,kind,name,x,y,heightCm,hp,weaponIndex});
const authInfo = auth => typeof auth === 'string' ? {role:auth,actorId:null} : auth ?? {};
const publicError = () => Error('Handlingen kan inte utföras här.');
const getActor = (state,id) => state.actors.find(a=>a.id===id);
const isGm = auth => auth.role === 'gm';

function worldPerception(state) {
  let info=privateViews.get(state);
  if(!info) {
    info=perception(state);
    privateViews.set(state,info);
  }
  return info;
}
function remember(state, spatialChange = true) {
  if(spatialChange) privateViews.delete(state);
  const info=worldPerception(state);
  state.memory=[...new Set([...state.memory,...info.current])];
  if(info.doorSeen) state.rememberedDoor=state.doorOpen;
  if(state.map.artFirst) {
    for(const lamp of state.map.lamps) if(info.seenBy(lamp.foot).length) state.lampMemory[lamp.id]=state.lamps[lamp.id];
  }
  const t=state.map.table;
  if(info.seenBy([t.x+t.width/2,t.y+t.height/2]).length) state.rememberedTable=true;
}
function positionAroundDoor(map,dx,dy) {
  const [x,y]=portal(map);
  return {x:x+dx,y:y+dy};
}
function guardOffset() {
  const raw=new Uint32Array(1);
  globalThis.crypto.getRandomValues(raw);
  return [[95,-3],[104,5],[94,15],[100,-12]][raw[0]%4];
}

export function createWorld({map = DEFAULT_CRYPT_MAP, guardPosition, heroes = {}} = {}) {
  map=validateMap(map);
  // Hero identity and relative height come from the supplied role prototypes.
  // The blank character height on Lyra's existing record uses a preview fallback.
  const base=[['astrid',-200,50],['evalin',-150,-15],['lyra',-86,-2]].map(([id,dx,dy])=>({
    id,kind:'hero',name:HERO_PROFILES[id].name,heightCm:HERO_PROFILES[id].heightCm??REFERENCE_HEIGHT_CM,
    darkvisionMeters:id==='lyra'?7.5:0,...positionAroundDoor(map,dx,dy)
  }));
  // The table stays anchored to the west room. Keep Astrid's boot clear of
  // its footprint when a prepared doorway moves towards the western boundary.
  if(!map.artFirst && base[0].x < map.table.x+map.table.width+.3*map.pixelsPerMeter)
    base[0].y=map.table.y+map.table.height+.6*map.pixelsPerMeter;
  for(const actor of base) {
    // Only a host can provide approved character data. Never copy private
    // character records into the projected actor.
    const record=heroes[actor.id];
    if(record) {
      if(Number.isFinite(record.heightCm) && record.heightCm>0) actor.heightCm=record.heightCm;
    }
  }
  if(map.artFirst) {
    for(const actor of base) [actor.x,actor.y]=hexCenter(map,map.starts[actor.id]);
    const random=crypto.getRandomValues(new Uint32Array(1))[0];
    const [x,y]=hexCenter(map,map.guardSpots[random%map.guardSpots.length]);
    guardPosition??={x,y};
  }
  const offset=guardPosition?null:guardOffset();
  const guard=guardPosition?{x:guardPosition.x,y:guardPosition.y}:positionAroundDoor(map,...offset);
  if(!isFloor(map,point(guard))) throw Error('Vaktens position är ogiltig.');
  const state={
    schema:SESSION_SCHEMA,revision:0,publicRevision:0,geometryRevision:0,canPrepare:true,map,
    actors:[...base,{id:'guard',name:'Kryptväktaren',kind:'guard',heightCm:175,darkvisionMeters:6,...guard}],
    ...(map.artFirst ? {lamps:map.lamps.map(()=>true),lampMemory:map.lamps.map(()=>null)} : {}),
    phase:'adventure',doorOpen:false,torchOn:true,rememberedDoor:null,rememberedTable:false,
    memory:[],pending:[],discoveries:[],journal:[],receipts:[],battle:null
  };
  remember(state);
  return state;
}

export function projectWorld(state, identity = 'player') {
  const auth=authInfo(identity), gm=isGm(auth), info=worldPerception(state), table=state.map.table;
  const actors=[];
  for(const actor of state.actors) {
    const seenBy=info.seenBy(point(actor));
    if(!gm && actor.kind!=='hero' && !seenBy.length) continue;
    actors.push({...publicActor(actor),seenBy,...hexAt(state.map,point(actor))});
  }
  const mapView=renderGeometry(state,info,gm);
  const visibleIds=actors.map(a=>a.id);
  const observedTable=info.seenBy([table.x+table.width/2,table.y+table.height/2]).length>0;
  const view={
    role:gm?'gm':'player',controlledActorId:gm?null:auth.actorId??null,
    revision:gm?state.revision:state.publicRevision,phase:state.phase,...mapView,actors,
    objects:gm || state.rememberedTable?[{...table,visibility:observedTable?'visible':'memory'}]:[],
    discoveries:structuredClone(state.discoveries),
    journal:state.journal.filter(e=>gm || !e.private).map(({private:privateFlag,...record})=>({...record})),
    pending:state.pending.filter(r=>gm || r.actorId===auth.actorId).map(({id,actorId,x,y})=>({id,actorId,x,y})),
    battle:state.battle?projectEncounter(state.battle,visibleIds):null
  };
  if(state.map.artFirst) {
    view.artFirst=true;
    view.lamps=state.map.lamps.map(lamp=>({...lamp,on:gm?state.lamps[lamp.id]:state.lampMemory[lamp.id]}))
      .filter(lamp=>lamp.on!==null);
    // Only party members have public motion paths. An enemy's hidden travel stays with the host.
    view.steps=state.steps ?? {};
  }
  if(gm) {
    view.map=structuredClone(state.map);
    view.canPrepare=state.canPrepare;
  }
  return view;
}

function journal(state,text,privately=false,details={}) {
  // Public identifiers have their own sequence. A private die never creates a visible gap.
  const seq=state.journalCounter??{public:0,private:0}, stream=privately?'private':'public';
  seq[stream]++;
  state.journalCounter=seq;
  state.journal.push({id:stream+'-'+seq[stream],text,private:privately,...details});
  // A flurry of secret actions cannot evict any entries from the public journal.
  const same=state.journal.filter(row=>row.private===privately);
  if(same.length>40) state.journal.splice(state.journal.indexOf(same[0]),1);
}
function controlled(state,id,auth,allowGuard=false) {
  const actor=getActor(state,id);
  if(!actor || (!allowGuard && actor.kind!=='hero') || actor.hp===0 || (!isGm(auth) && (!auth.actorId || id!==auth.actorId))) throw publicError();
  return actor;
}
function requireGm(auth) {if(!isGm(auth)) throw publicError();}
function validateDestination(cmd) {
  if(!Number.isFinite(cmd.x)||!Number.isFinite(cmd.y)) throw publicError();
  return [cmd.x,cmd.y];
}
function newSpatialRevision(state) {
  state.geometryRevision++;
  privateViews.delete(state);
}
function combatAction(state,cmd,auth) {
  if(state.phase!=='combat' || !state.battle) throw publicError();
  const sight=worldPerception(state);
  return resolveEncounterCommand(state.battle,state.actors,cmd,{
    die:auth.die,
    canSee:(a,b)=>{const actor=getActor(state,a),target=getActor(state,b);return !!actor && !!target && sight.individual(actor,point(target));},
    distanceHexes:(a,b)=>hexDistance(state.map,point(getActor(state,a)),point(getActor(state,b)))
  });
}
function passiveEntry(state,actor,auth) {
  if(actor.kind!=='hero') return;
  const result=resolveAdventureSkill(actor,'danger',auth.die);
  journal(state,actor.name+' · Upptäcka fara '+result.roll+' mot FV '+result.fv+'.',true,{skill:'danger',roll:result.roll});
  if(result.success && !state.discoveries.some(d=>d.id==='ward')) {
    state.discoveries.push({id:'ward',name:'Den slitna varningstråden'});
    journal(state,actor.name+' upptäcker en tunn varningstråd i kryptans öppning.');
  }
}
function performMove(state,cmd,auth,approved=false) {
  const guard=cmd.type==='guard', actor=controlled(state,guard?'guard':cmd.actorId,auth,guard || isGm(auth));
  if(guard) requireGm(auth);
  const start=point(actor);
  let end=validateDestination(cmd);
  if(state.phase==='combat' || state.map.artFirst) end=hexCenter(state.map,end);
  if(distance(start,end)<.1) throw publicError();
  const across=side(state.map,start)!==side(state.map,end);
  if(across && actor.kind==='hero' && state.phase==='adventure' && !approved) {
    // The act of *requesting* a crossing cannot act as a probe for an unseen
    // sentry in a remembered room. Only the GM commits against the actual world.
    const offeredDoor=isGm(auth)?state.doorOpen:state.rememberedDoor;
    if(!offeredDoor || !isFloor(state.map,end) || (!isGm(auth) && !knownFloor(state,end))) throw publicError();
    if(state.pending.some(r=>r.actorId===actor.id || r.id===cmd.id)) throw Error('Rollpersonen väntar redan på passage.');
    state.pending.push({id:cmd.id,actorId:actor.id,x:end[0],y:end[1],geometryRevision:state.geometryRevision});
    return;
  }
  const path=route(state,actor,end);
  if(!path) {
    if(approved) {journal(state,'Passagen är inte tillgänglig.');return;}
    throw publicError();
  }
  if(state.phase==='combat') {
    let previous=start,cost=0;
    for(const waypoint of path){cost+=hexDistance(state.map,previous,waypoint);previous=waypoint;}
    combatAction(state,{type:'move',actorId:actor.id,cost:Math.max(1,cost)},auth);
  }
  const seenBefore=worldPerception(state).seenBy(start).length>0;
  if(state.map.artFirst && actor.kind==='hero') {
    state.steps={...state.steps,[actor.id]:{id:cmd.id,path:[start,...path]}};
  }
  actor.x=end[0];actor.y=end[1];
  newSpatialRevision(state);
  const seenAfter=worldPerception(state).seenBy(end).length>0;
  if(!guard && actor.kind==='hero') {
    if(across && side(state.map,end)==='east') passiveEntry(state,actor,auth);
    journal(state,actor.name+(across?' passerar kryptans dörr.':' förflyttar sig.'));
  } else if(seenAfter || seenBefore) {
    journal(state,seenAfter?'Kryptväktaren syns i öppningen.':'Kryptväktaren försvinner ur sikte.');
  }
}
function search(state,cmd,auth) {
  const actor=controlled(state,cmd.actorId,auth);
  if(state.phase==='combat') combatAction(state,{type:'skill',actorId:actor.id},auth);
  const result=resolveAdventureSkill(actor,'search',auth.die);
  const t=state.map.table, target=state.map.searchPoint ?? [t.x+t.width/2,t.y+t.height/2];
  const found=result.success && distance(point(actor),target)<state.map.pixelsPerMeter*3.5 &&
    worldPerception(state).individual(actor,target) && !state.discoveries.some(d=>d.id==='seal-key');
  if(found) state.discoveries.push({id:'seal-key',name:'Kryptans bronsnyckel'});
  const check=result.confirmationRoll?' · kontroll '+result.confirmationRoll:'';
  journal(state,actor.name+' · Finna dolda ting '+result.roll+' mot FV '+result.fv+check+
    (found?' · Kryptans bronsnyckel är funnen.':result.success?' · Sökandet är klart.':' · Misslyckat slag.'),
    false,{actorId:actor.id,skill:'search',roll:result.roll,confirmationRoll:result.confirmationRoll,fv:result.fv,outcome:result.outcome});
}
function changeDoor(state,cmd,auth) {
  if(typeof cmd.open!=='boolean' || cmd.open===state.doorOpen) throw publicError();
  if(!isGm(auth)) {
    const actor=controlled(state,auth.actorId,auth);
    if(distance(point(actor),portal(state.map))>state.map.pixelsPerMeter*1.8 ||
        !worldPerception(state).doorSeen) throw publicError();
    if(state.phase==='combat') combatAction(state,{type:'skill',actorId:actor.id},auth);
  }
  const justSeen=worldPerception(state).doorSeen;
  if(!doorSettlesClear(state,cmd.open)) throw publicError();
  state.doorOpen=cmd.open;
  newSpatialRevision(state);
  journal(state,cmd.open?'Kryptans dörr öppnas.':'Kryptans dörr stängs.',!justSeen && !worldPerception(state).doorSeen);
}

function execute(state,cmd,auth) {
  switch(cmd.type) {
    case 'prepare': {
      requireGm(auth);
      if(state.map.artFirst || !state.canPrepare || state.phase!=='adventure') throw Error('Kartans förberedelse är redan avslutad.');
      const fresh=createWorld({map:prepareCryptMap(DEFAULT_CRYPT_MAP,{splitX:cmd.splitX,pixelsPerMeter:cmd.pixelsPerMeter})});
      Object.assign(state,{...fresh,revision:state.revision,publicRevision:state.publicRevision,receipts:state.receipts});
      privateViews.set(state,worldPerception(fresh));
      return;
    }
    case 'door': return changeDoor(state,cmd,auth);
    case 'lamps': {
      requireGm(auth);
      if(!state.map.artFirst || typeof cmd.on!=='boolean' ||
        (cmd.lamp!=='all' && !state.map.lamps.some(l=>l.id===cmd.lamp))) throw publicError();
      state.lamps=state.lamps.map((on,i)=>cmd.lamp==='all' || i===cmd.lamp ? cmd.on : on);
      newSpatialRevision(state);
      return;
    }
    case 'torch':
      if((!isGm(auth) && auth.actorId!=='evalin') || typeof cmd.on!=='boolean' || cmd.on===state.torchOn) throw publicError();
      if(!isGm(auth)) {controlled(state,'evalin',auth);if(state.phase==='combat') combatAction(state,{type:'skill',actorId:'evalin'},auth);}
      state.torchOn=cmd.on;newSpatialRevision(state);journal(state,cmd.on?'Evalin tänder facklan.':'Evalin släcker facklan.');return;
    case 'move':
    case 'guard': return performMove(state,cmd,auth);
    case 'approve':
    case 'deny': {
      requireGm(auth);
      const index=state.pending.findIndex(r=>r.id===cmd.requestId);
      if(index===-1) throw publicError();
      const request=state.pending[index];state.pending.splice(index,1);
      if(cmd.type==='deny') {journal(state,'SL avböjer passagen.');return;}
      if(request.geometryRevision!==state.geometryRevision || !state.doorOpen || state.phase!=='adventure') {
        journal(state,'Passagen har förändrats. En ny begäran behövs.');return;
      }
      return performMove(state,{...request,type:'move'},auth,true);
    }
    case 'search': return search(state,cmd,auth);
    case 'startCombat':
      requireGm(auth);if(state.phase!=='adventure') throw publicError();
      state.battle=createEncounter(state.actors,auth.die);state.phase='combat';state.pending=[];
      journal(state,'Striden börjar.');return;
    case 'endCombat':
      requireGm(auth);if(state.phase!=='combat') throw publicError();
      state.phase='adventure';state.battle=null;journal(state,'Striden avslutas. Gruppen fortsätter utforska.');return;
    case 'attack':
    case 'switchWeapon':
    case 'nextTurn': {
      if(cmd.type==='nextTurn') requireGm(auth);
      else controlled(state,cmd.actorId,auth,isGm(auth));
      const before=worldPerception(state);
      const visibleId=id=>{const actor=getActor(state,id);return actor && (actor.kind==='hero'||before.seenBy(point(actor)).length>0);};
      if(cmd.targetId && (!isGm(auth) && !visibleId(cmd.targetId))) throw publicError();
      const result=combatAction(state,cmd,auth);
      if(result.targetId && Number.isFinite(result.hp)) {
        const target=getActor(state,result.targetId);
        if(target) {target.hp=result.hp;if(target.hp===0) privateViews.delete(state);}
      }
      if(result.thrown) getActor(state,cmd.actorId).thrown=true;
      if(Number.isInteger(result.weaponIndex)) getActor(state,cmd.actorId).weaponIndex=result.weaponIndex;
      const hidden=cmd.type==='nextTurn' || [cmd.actorId,cmd.targetId].some(id=>id && !visibleId(id));
      if(result.message) journal(state,result.message,hidden,result.result?{actorId:cmd.actorId,roll:result.result.roll,confirmationRoll:result.result.confirmationRoll,fv:result.result.fv,outcome:result.result.outcome}:{});
      return;
    }
    default: throw publicError();
  }
}
function ordered(value) {
  return value && typeof value==='object' && !Array.isArray(value) ?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])) : value;
}
function visibleChangeMarker(state) {
  // Private SL moves do not advance public time or reveal hidden actors through
  // status refreshes. Requests change the sender's view and carry an opaque ID.
  const {revision,...view}=projectWorld(state,'player');
  return JSON.stringify([view,state.pending.map(({id,actorId})=>[id,actorId])]);
}
export function applyCommand(state,command,identity={}) {
  const auth=authInfo(identity), gm=isGm(auth);
  if(!['gm','player'].includes(auth.role) || (!gm && !getActor(state,auth.actorId)) ||
      (!gm && getActor(state,auth.actorId).kind!=='hero')) throw publicError();
  if(!command || typeof command.id!=='string' || !command.id.trim() || command.id.length>128) throw publicError();
  const principal=gm?'gm':auth.actorId;
  // The client may have refreshed its projection while waiting for the first
  // receipt. The revision is a precondition, not part of the action's identity.
  const {expectedRevision,...intent}=command;
  const fingerprint=JSON.stringify(ordered(intent));
  const previous=state.receipts.find(row=>row.id===command.id && row.principal===principal);
  if(previous) {
    if(previous.fingerprint!==fingerprint) throw Error('Handlings-ID har redan använts.');
    return state;
  }
  if(expectedRevision!==(gm?state.revision:state.publicRevision)) throw Error('Läget har ändrats. Försök igen från den aktuella vyn.');
  const before=visibleChangeMarker(state);
  const next=structuredClone(state);
  // Geometry is immutable for a session. Retain its precomputed tile descriptors.
  next.map=state.map;
  privateViews.set(next,worldPerception(state));
  execute(next,command,auth);
  next.canPrepare=command.type==='prepare';
  next.revision=state.revision+1;
  remember(next,false);
  if(visibleChangeMarker(next)!==before) next.publicRevision=state.publicRevision+1;
  next.receipts.push({principal,id:command.id,fingerprint});
  if(next.receipts.length>256) next.receipts.shift();
  return next;
}

