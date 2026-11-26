import {describe,it,expect,vi} from 'vitest';
import {createGather} from '../features/session/gather.js';

function meeting(){
 let id=0;
 const channels=new Map(), messages=[];
 function client(user,gm=false){
  const identity={user,gm,campaign:'campaign'};
  let session='meeting',view='home',latest;
  const opened=vi.fn(async command=>{view=command.target;return true;});
  const revealed=vi.fn();
  const api=createGather({
   identity:()=>identity,readSession:async()=>session,open:opened,reveal:revealed,announce:vi.fn(),uuid:()=>String(++id),
   changed:s=>{latest=s;},
   connect:(s,b,events)=>{
    const key=Symbol();
    function presence(){
     const members={};
     for(const c of channels.values())if(c.s===s&&c.data)(members[c.user]??=[]).push(c.data);
     for(const c of channels.values())if(c.s===s)c.events.presence(members);
    }
    return {start(){channels.set(key,{s,user,events});events.status(true);},
     async track(data){channels.get(key).data=data;presence();},
     async close(){channels.delete(key);presence();},async refreshAuth(){}};
   },
   publish:async(_c,s,view,target,id)=>{
    const m={view,target,id};messages.push(m);
    for(const c of channels.values())if(c.s===s)c.events.message(m);
    return id;
   }
  });
  return {api,opened,revealed,latest:()=>latest,where:()=>view,leave:()=>{view='home';},session:s=>{session=s;}};
 }
 return {client,channels,messages};
}
describe('Samla spelarna',()=>{
 it('navigates only on each explicit command and counts each player once across tabs',async()=>{
  const m=meeting(),gm=m.client('SL',true),a=m.client('Lyra'),b=m.client('Lyra');
  await Promise.all([gm.api.refresh(),a.api.refresh(),b.api.refresh()]);
  await gm.api.send('map','Kryptan');await vi.waitFor(()=>expect(gm.latest().report).toEqual({view:'map',total:1,opened:1}));
  a.leave();await a.api.refresh();
  for(const c of m.channels.values())c.events.message(m.messages[0]);
  expect(a.where()).toBe('home');
  await gm.api.send('map','Kryptan');await vi.waitFor(()=>expect(a.where()).toBe('Kryptan'));
  expect(gm.opened).not.toHaveBeenCalled();
  expect(a.opened).toHaveBeenCalledTimes(2);
 });
 it('includes a rendered receipt if the attendance update arrived after the click',async()=>{
  const m=meeting(),gm=m.client('SL',true);await gm.api.refresh();
  const player=m.client('Astrid');await player.api.refresh();
  const sender=[...m.channels.values()].find(c=>c.user==='SL');
  sender.events.presence({});
  await gm.api.send('map','Kryptan');
  await vi.waitFor(()=>expect(gm.latest().report).toEqual({view:'map',total:1,opened:1}));
 });
 it('leaves late arrivals on their own page, and excludes another meeting',async()=>{
  const m=meeting(),gm=m.client('SL',true),other=m.client('annan');
  other.session('other');await Promise.all([gm.api.refresh(),other.api.refresh()]);
  await gm.api.send('image','bild');const late=m.client('ny');await late.api.refresh();
  expect(late.where()).toBe('home');expect(other.where()).toBe('home');
  await gm.api.send('image','bild');await vi.waitFor(()=>expect(late.where()).toBe('bild'));
  expect(other.where()).toBe('home');expect(await late.api.send('map','Kryptan')).toBe(false);
 });
 it('rejects revoked membership before navigation and only acknowledges decoded media',async()=>{
  const m=meeting(),gm=m.client('SL',true),a=m.client('Lyra'),b=m.client('Astrid');
  await Promise.all([gm.api.refresh(),a.api.refresh(),b.api.refresh()]);
  a.session(null);b.opened.mockResolvedValue(false);
  await gm.api.send('image','bild');await vi.waitFor(()=>expect(b.opened).toHaveBeenCalledTimes(1));
  expect(a.opened).not.toHaveBeenCalled();expect(gm.latest().report.opened).toBe(0);
 });
 it('delivers a live reveal once and cancels pending decoding after disconnect or session change',async()=>{
  const m=meeting(),gm=m.client('SL',true),a=m.client('Astrid');
  await Promise.all([gm.api.refresh(),a.api.refresh()]);
  const channels=[...m.channels.values()];
  const client=channels.find(c=>c.user==='Astrid');
  const event={id:'presentation',mode:'full',ref:'opaque'};
  for(const c of channels)c.events.reveal(event);
  client.events.reveal(event);
  expect(gm.revealed).not.toHaveBeenCalled();
  expect(a.revealed).toHaveBeenCalledTimes(1);
  const [session,received,valid]=a.revealed.mock.calls[0];
  expect(session).toBe('meeting');expect(received).toEqual(event);expect(valid()).toBe(true);
  await client.events.status(false);expect(valid()).toBe(false);
  await client.events.status(true);client.events.reveal(event);
  expect(a.revealed).toHaveBeenCalledTimes(1);
  a.session('other');await a.api.refresh();
  client.events.reveal({...event,id:'late'});expect(a.revealed).toHaveBeenCalledTimes(1);
 });
 it('only gathers after the requested private image was successfully shared',async()=>{
  const m=meeting(),gm=m.client('SL',true);await gm.api.refresh();
  expect(await gm.api.send('image','privat',async()=>false)).toBe(false);
  expect(m.messages).toHaveLength(0);
 });
});
