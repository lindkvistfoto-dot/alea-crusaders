import {afterEach,describe,expect,it,vi} from 'vitest';
import {openCryptSession} from '../features/crypt/session.js';
import {openCryptWire} from '../features/crypt/session-wire.js';

const base='https://pilot.example/kryptans-dorr.html';
const sessions=[];
afterEach(()=>{for(const session of sessions.splice(0))session.close();vi.useRealTimers();});
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(test){for(let n=0;n<200;n++){if(test())return;await pause();}throw Error('Ingen uppdatering');}
function memory(){
  const values=new Map();
  return {values,getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,val)};
}
function relay(){
  const listeners=new Map(),frames=[];
  return {frames,wire(topics,onReceive){
    for(const t of topics){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(onReceive);}
    return {send(t,data){
      frames.push([t,structuredClone(data)]);
      for(const fn of listeners.get(t)||[])if(fn!==onReceive)queueMicrotask(()=>fn(t,structuredClone(data)));
    },close(){for(const t of topics)listeners.get(t).delete(onReceive);}};
  }};
}
const fixture={
  createWorld:()=>({revision:0,shared:0,secret:'PRIVAT VAKT',door:false,receipts:{}}),
  projectWorld(w,{role,actorId}){return role==='gm'?{...w}:{revision:w.shared,door:w.door,controlledActorId:actorId};},
  applyCommand(w,cmd,actor){
    if(w.receipts[cmd.id])return w;
    if(cmd.expectedRevision!==(actor.role==='gm'?w.revision:w.shared))throw Error('Gammal revision.');
    if(cmd.type==='guard'&&actor.role!=='gm')throw Error('Endast SL.');
    return {...w,revision:w.revision+1,shared:w.shared+(cmd.type==='guard'?0:1),
      door:cmd.type==='door'?!w.door:w.door,receipts:{...w.receipts,[cmd.id]:true}};
  },
};
async function open(ctx, opts={}){
  const session=await openCryptSession({url:base,locks:null,loadWorld:async()=>fixture,onView:()=>{},replaceUrl:url=>{ctx.url=url;},
    wireFactory:ctx.bus.wire,storage:ctx.storage,...opts});
  sessions.push(session);return session;
}
describe('Kryptans dörr · separata roller',()=>{
  it('sänder bara behörig projektion, lagrar krypterat och låter två verkliga klientinstanser dela dörren',async()=>{
    const ctx={bus:relay(),storage:memory()};
    const sl=await open(ctx);
    const invites=['astrid','lyra'].map(id=>sl.invite(id));
    const memberOpts={loadWorld:()=>{throw Error('Medlem importerade SL-världen');},storage:null};
    const a=await open(ctx,{url:invites[0],...memberOpts}),b=await open(ctx,{url:invites[1],...memberOpts});
    await until(()=>a.view&&b.view);
    expect(a.view).toMatchObject({door:false,controlledActorId:'astrid'});
    expect(b.view).toMatchObject({door:false,controlledActorId:'lyra'});
    expect(a.view).not.toHaveProperty('secret');
    expect(new URL(invites[0]).hash).not.toContain(new URL(ctx.url).hash.slice(4));
    const secretCount=ctx.bus.frames.length;
    await sl.command({type:'guard'});
    expect(ctx.bus.frames).toHaveLength(secretCount);
    expect(a.view.revision).toBe(0);
    await expect(a.command({type:'door',actorId:'lyra'})).rejects.toThrow('annan rollperson');
    await expect(a.command({type:'guard',role:'gm'})).rejects.toThrow('Endast SL');
    const id=crypto.randomUUID();
    await a.command({id,type:'door'});
    await until(()=>b.view.door);
    await a.command({id,type:'door'});
    expect(sl.view.door).toBe(true);
    expect(sl.view.revision).toBe(2);
    expect(JSON.stringify(ctx.bus.frames)).not.toMatch(/PRIVAT VAKT|"door"|astrid|lyra/);
    expect([...ctx.storage.values.values()][0]).not.toMatch(/PRIVAT VAKT|"receipts"/);
    expect(()=>a.invite('lyra')).toThrow('Endast');
    await expect(a.reset()).rejects.toThrow('Endast');
    const hostUrl=ctx.url;
    await expect(open(ctx,{url:hostUrl,storage:memory()})).rejects.toThrow('på den enhet');
    sl.close();
    const restored=await open(ctx,{url:hostUrl});
    expect(restored.view).toMatchObject({door:true,revision:2,secret:'PRIVAT VAKT'});
    const reloaded=await open(ctx,{url:invites[1],...memberOpts});
    await until(()=>reloaded.view?.door===true);
    await restored.reset();
    await until(()=>reloaded.view?.door===false);
    expect(reloaded.view.revision).toBe(0);
  });
  it('delivers the real observed floor, door and torch together without exposing the hidden guard',async()=>{
    const ctx={bus:relay(),storage:memory()};
    const gm=await open(ctx,{loadWorld:()=>import('../features/crypt/world.js')});
    const a=await open(ctx,{url:gm.invite('astrid')}), b=await open(ctx,{url:gm.invite('lyra')});
    await until(()=>a.view&&b.view);
    expect(b.view.actors.some(actor=>actor.kind==='guard')).toBe(false);
    expect(b.view.floor.length).toBeGreaterThan(0);
    expect(b.view.torch.on).toBe(true);
    if(typeof CompressionStream==='function'){
      const longest=Math.max(...ctx.bus.frames.map(([,packet])=>packet.body.length));
      expect(longest).toBeLessThan(JSON.stringify(b.view).length);
    }
    await gm.command({type:'door',open:true});
    await until(()=>a.view.door.open&&b.view.door.open);
    await gm.command({type:'door',open:false});
    await until(()=>!b.view.door.open);
    expect(b.view.actors.some(actor=>actor.kind==='guard')).toBe(false);
  });
  it('clears the live player view after a disconnected host, then restores a fresh projection on reconnect',async()=>{
    const ctx={bus:relay(),storage:memory()};
    const gm=await open(ctx);
    let network;const updates=[];
    const member=await open(ctx,{url:gm.invite('astrid'),onView:v=>updates.push(v),wireFactory:(topics,receive,status)=>{
      network=status;return ctx.bus.wire(topics,receive);
    }});
    await until(()=>member.view);
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+20_000);
    try{
      network(false);
      expect(member.status).toBe('Spelledaren är frånkopplad');
      expect(member.view).toBeNull();
      expect(updates.at(-1)).toBeNull();
      network(true);
      await until(()=>member.view);
      expect(member.view).toMatchObject({door:false,controlledActorId:'astrid'});
    }finally{clock.mockRestore();}
  });
  it('treats an invalid role fragment as a broken invitation, never a new GM',async()=>{
    await expect(openCryptSession({url:base+'#player=invalid&hero=lyra'})).rejects.toThrow('ogiltig');
  });
});
function socketServer(){
  const sockets=new Set(), joins=new Map();
  function makeSocket(){
    const ws={readyState:0,send(raw){
      const msg=JSON.parse(raw);
      if(msg.event==='phx_join'){
        joins.get(ws).add(msg.topic);
        queueMicrotask(()=>ws.onmessage?.({data:JSON.stringify({...msg,event:'phx_reply',payload:{status:'ok'}})}));
      }else if(msg.event==='broadcast'){
        for(const other of sockets)if(other!==ws&&joins.get(other).has(msg.topic))queueMicrotask(()=>other.onmessage?.({data:raw}));
      }
    },close(){sockets.delete(ws);joins.delete(ws);ws.readyState=3;}};
    sockets.add(ws);joins.set(ws,new Set());
    queueMicrotask(()=>{ws.readyState=1;ws.onopen?.();});
    return ws;
  }
  return {makeSocket,sockets};
}
describe('Kryptans dörr · DEV transport',()=>{
  it('delivers between separate origins/contexts with local transport disabled, with isolated player channels',async()=>{
    const server=socketServer();
    const wireFactory=(topics,receive,status)=>openCryptWire(topics,receive,status,{
      config:{name:'development',url:'https://example.supabase.co',key:'test'},makeSocket:server.makeSocket,makeChannel:()=>null});
    const ctx={bus:{wire:wireFactory},storage:memory()};
    const gm=await open(ctx),astrid=await open(ctx,{url:gm.invite('astrid')}),lyra=await open(ctx,{url:gm.invite('lyra')});
    await until(()=>astrid.view&&lyra.view);
    expect(gm.status).toContain('Flera enheter');
    expect(astrid.status).toContain('Ansluten');
    expect(server.sockets.size).toBe(3);
    await astrid.command({type:'door'});
    await until(()=>lyra.view?.door);
  });
  it('opens no remote socket in LIVE',()=>{
    const makeSocket=vi.fn();
    const wire=openCryptWire(['sample'],vi.fn(),vi.fn(),{config:{name:'live',url:'https://example.com',key:'test'},makeChannel:()=>null,makeSocket});
    expect(makeSocket).not.toHaveBeenCalled();wire.close();
  });
});
