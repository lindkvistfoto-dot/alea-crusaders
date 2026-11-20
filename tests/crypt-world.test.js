import {describe,expect,it} from 'vitest';
import {createWorld,applyCommand,projectWorld} from '../features/crypt/world.js';
import {DEFAULT_CRYPT_MAP,hexAt,movementClear,torchSource} from '../features/crypt/scene.js';
import {heroPlacement} from '../features/crypt/hero-class.js';

const gm={role:'gm',die:()=>1};
const member=actorId=>({role:'player',actorId,die:()=>1});
const fixture=()=>createWorld({guardPosition:{x:595,y:297}});
const go=(s,type,p={},auth=gm)=>applyCommand(s,{
  id:crypto.randomUUID(),expectedRevision:projectWorld(s,auth).revision,type,...p
},auth);
const livingGuard=view=>view.actors.find(a=>a.id==='guard');
const knownAt=(view,x,y)=>view.floor.find(r=>x>=r.x && y>=r.y && x<r.x+r.width && y<r.y+r.height)?.visibility;

describe('Kryptans dörr · en värld, separata observationer',()=>{
  it('keeps a truly hidden guard out of every initial player field and shares individual observations when the door opens',()=>{
    let s=fixture();
    const west=projectWorld(s);
    expect(west.actors.map(a=>a.id)).toEqual(['astrid','evalin','lyra']);
    expect(JSON.stringify(west)).not.toMatch(/Kryptväktaren|guard|doorOpen|receipts|darkvisionMeters/);
    expect(west.door.open).toBe(false);
    expect(west.sun.polygon.length).toBeGreaterThan(2);
    expect(knownAt(west,595,297)).toBeUndefined();
    expect(livingGuard(projectWorld(s,'gm'))).toBeTruthy();
    s=go(s,'door',{open:true});
    expect(livingGuard(projectWorld(s,member('astrid'))).seenBy).toEqual(['lyra']);
    expect(livingGuard(projectWorld(s,member('evalin'))).seenBy).toEqual(['lyra']);
    expect(projectWorld(s).floor).toEqual(projectWorld(s,member('lyra')).floor);
    expect(knownAt(projectWorld(s),595,297)).toBe('visible');
    s=go(s,'torch',{on:false});
    expect(livingGuard(projectWorld(s)).seenBy).toEqual(['lyra']);
  });

  it('remembers floor, drops all current position data on sight loss and does not reveal a private move through revisions or journal',()=>{
    let s=go(fixture(),'door',{open:true});
    s=go(s,'door',{open:false});
    const memory=projectWorld(s);
    expect(knownAt(memory,595,297)).toBe('memory');
    expect(livingGuard(memory)).toBeUndefined();
    s=go(s,'guard',{x:820,y:380});
    expect(projectWorld(s)).toEqual(memory);
    expect(livingGuard(projectWorld(s,'gm'))).toMatchObject({x:820,y:380});
    const reloaded=JSON.parse(JSON.stringify(s));
    expect(projectWorld(reloaded)).toEqual(memory);
    s=go(s,'door',{open:true});
    expect(livingGuard(projectWorld(s))).toBeUndefined();
  });

  it('uses the actual sprite socket and scale while keeping its physical light out of walls',()=>{
    const s=fixture(), host=s.actors.find(a=>a.id==='evalin');
    const placement=heroPlacement('evalin',{pixelsPerMeter:s.map.pixelsPerMeter,heightCm:host.heightCm});
    expect(torchSource(s).x).toBeCloseTo(host.x+(placement.torchFlame.x-placement.anchor.x)*placement.width);
    let moved=go(s,'move',{actorId:'evalin',x:370,y:285},member('evalin'));
    expect(projectWorld(moved).torch.x-projectWorld(s).torch.x).toBeCloseTo(20);
    moved=go(moved,'move',{actorId:'evalin',x:330,y:105},member('evalin'));
    expect(torchSource(moved)).toMatchObject({x:330,y:105});
    expect(()=>go(s,'torch',{on:false},member('astrid'))).toThrow();
  });

  it('requires SL approval on both sides and rechecks changed door geometry, including a duplicate client request',()=>{
    let s=go(fixture(),'door',{open:true});
    const auth=member('lyra'), old=s.actors.find(a=>a.id==='lyra').x;
    const request={type:'move',actorId:'lyra',x:562,y:301,id:'cross-once',expectedRevision:projectWorld(s,auth).revision};
    s=applyCommand(s,request,auth);
    expect(applyCommand(s,request,auth)).toBe(s);
    expect(()=>applyCommand(s,{...request,x:563},auth)).toThrow();
    expect(s.actors.find(a=>a.id==='lyra').x).toBe(old);
    expect(projectWorld(s,auth).pending).toHaveLength(1);
    expect(projectWorld(s,member('astrid')).pending).toHaveLength(0);
    s=go(s,'door',{open:false});
    s=go(s,'approve',{requestId:'cross-once'});
    expect(s.pending).toHaveLength(0);
    expect(s.actors.find(a=>a.id==='lyra').x).toBe(old);
    expect(()=>go(s,'move',{actorId:'lyra',x:562,y:301},auth)).toThrow();
    s=go(s,'door',{open:true});
    s=go(s,'move',{actorId:'lyra',x:562,y:301},auth);
    s=go(s,'approve',{requestId:s.pending[0].id});
    expect(s.actors.find(a=>a.id==='lyra')).toMatchObject({x:562,y:301});
    expect(projectWorld(s,'gm').journal.filter(e=>e.skill==='danger')).toHaveLength(1);
    expect(projectWorld(s).journal.some(e=>e.skill==='danger')).toBe(false);
    expect(projectWorld(s).discoveries.map(d=>d.id)).toContain('ward');
  });

  it('sends a passage request to the GM before inspecting an unobserved occupant at its destination',()=>{
    let s=go(fixture(),'door',{open:true});
    // First observe part of the eastern floor, then leave only the near face of
    // the open door within the bearer’s darkvision. The remembered tile remains.
    s=go(s,'torch',{on:false});
    s=go(s,'move',{actorId:'lyra',x:320,y:320});
    s=go(s,'guard',{x:600,y:301});
    expect(livingGuard(projectWorld(s))).toBeUndefined();
    expect(knownAt(projectWorld(s),600,301)).toBe('memory');
    const auth=member('lyra');
    s=go(s,'move',{actorId:'lyra',x:600,y:301},auth);
    expect(projectWorld(s,auth).pending).toHaveLength(1);
    s=go(s,'approve',{requestId:s.pending[0].id});
    expect(s.actors.find(a=>a.id==='lyra').x).toBe(320);
    expect(projectWorld(s,auth).pending).toHaveLength(0);
    expect(projectWorld(s,auth).journal.at(-1).text).toBe('Passagen är inte tillgänglig.');
  });

  it('binds commands to the selected member, validates stale requests and keeps ordinary ability results authoritative',()=>{
    const s=fixture(), auth=member('astrid');
    expect(()=>go(s,'move',{actorId:'lyra',x:403,y:299},auth)).toThrow();
    expect(()=>go(s,'guard',{x:700,y:310},auth)).toThrow();
    expect(()=>go(s,'startCombat',{},auth)).toThrow();
    expect(()=>go(s,'move',{actorId:'astrid',x:0,y:0},auth)).toThrow();
    expect(()=>go(s,'door',{open:true},{role:'player'})).toThrow();
    const cmd={type:'search',actorId:'astrid',id:'find-key',expectedRevision:0};
    const found=applyCommand(s,cmd,auth);
    expect(applyCommand(found,cmd,auth)).toBe(found);
    expect(applyCommand(found,{...cmd,expectedRevision:found.publicRevision},auth)).toBe(found);
    const result=projectWorld(found).journal.at(-1);
    expect(result).toMatchObject({actorId:'astrid',skill:'search',fv:2,roll:1,confirmationRoll:1});
    expect(projectWorld(found).discoveries).toContainEqual({id:'seal-key',name:'Kryptans bronsnyckel'});
    expect(()=>applyCommand(found,{...cmd,id:'second'},auth)).toThrow(/ändrats/);
  });

  it('projects the combat order and targets by current vision, persists the confirmed hit and position across modes',()=>{
    let s=go(fixture(),'startCombat');
    const home=s.actors.map(a=>pointOf(a)), door=s.doorOpen;
    expect(projectWorld(s).battle.order).not.toContain('guard');
    expect(projectWorld(s,'gm').battle.order).toContain('guard');
    expect(()=>go(s,'attack',{actorId:'evalin',targetId:'guard'},member('evalin'))).toThrow();
    s=go(s,'door',{open:true});
    expect(()=>go(s,'attack',{actorId:'evalin',targetId:'guard'},member('evalin'))).toThrow(/synligt/);
    // Move Evalin towards the open threshold in her ordinary tactical turn.
    s=go(s,'move',{actorId:'evalin',x:432,y:250},member('evalin'));
    const active=projectWorld(s,member('evalin'));
    expect(active.battle.combatants.find(a=>a.id==='evalin').movementRemaining).toBeLessThan(15);
    const a=active.actors.find(a=>a.id==='evalin');
    expect(hexAt(s.map,[a.x,a.y])).toEqual({q:a.q,r:a.r});
    s=go(s,'attack',{actorId:'evalin',targetId:'guard'},member('evalin'));
    expect(s.actors.find(a=>a.id==='guard').hp).toBeLessThan(10);
    expect(()=>go(s,'search',{actorId:'evalin'},member('evalin'))).toThrow(/handling/);
    const last=s.actors.map(a=>pointOf(a));
    s=go(s,'endCombat');
    expect(projectWorld(s).phase).toBe('adventure');
    expect(s.actors.map(a=>pointOf(a))).toEqual(last);
    expect(last).not.toEqual(home);
    expect(s.doorOpen).not.toBe(door);
  });

  it('retains legacy map positioning, a single calibrated doorway and solid tables; preparation is isolated to the beginning',()=>{
    const raw=fixture();
    const s=go(raw,'prepare',{splitX:430,pixelsPerMeter:48});
    expect(s.map.door.x).toBe(430);
    expect(s.map.corridor.x+s.map.corridor.width/2).toBe(430);
    expect(raw.map).toEqual(DEFAULT_CRYPT_MAP);
    const actor=s.actors.find(a=>a.id==='astrid');
    expect(movementClear(s,pointOf(actor),[200,335],actor.id)).toBe(false);
    expect(movementClear(s,[410,300],[450,300],'lyra')).toBe(false);
    const started=go(s,'torch',{on:false});
    expect(()=>go(started,'prepare',{splitX:530,pixelsPerMeter:32})).toThrow();
    expect(()=>go(raw,'prepare',{splitX:530,pixelsPerMeter:0})).toThrow();
  });
});
function pointOf(a){return [a.x,a.y];}
