// Only the host loads the world and rules. Each player invitation addresses one controlled hero.
import {openCryptWire} from './session-wire.js';

const HEROES = ['astrid','lyra','evalin'];
const encode = new TextEncoder();
const decode = new TextDecoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
const fromHex = s => Uint8Array.from(s.match(/../g), pair => parseInt(pair,16));
const derive = async (domain,secret) => hex(await crypto.subtle.digest('SHA-256',encode.encode(domain + ':' + secret)));
const randomSecret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const cipher = secret => crypto.subtle.importKey('raw',fromHex(secret),'AES-GCM',false,['encrypt','decrypt']);
function toBase64(bytes) {
  let binary = '';
  for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function transformBytes(bytes, transformer) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transformer)).arrayBuffer());
}
async function seal(key, data, allowCompression = false) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let plain = encode.encode(JSON.stringify(data));
  // Geometry repeats across spans and wall fragments; no dependency or codec is required for older clients.
  if (allowCompression && canZip && plain.length > 2048) plain = await transformBytes(plain,new CompressionStream('gzip'));
  const body = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
  return {nonce:hex(iv),body:toBase64(new Uint8Array(body))};
}
async function unseal(key, packet, allowCompression = false) {
  if (!packet || !/^[0-9a-f]{24}$/.test(packet.nonce) || typeof packet.body !== 'string') throw Error('Ogiltigt meddelande.');
  const bytes = Uint8Array.from(atob(packet.body),c=>c.charCodeAt(0));
  let plain = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(packet.nonce)},key,bytes));
  if (allowCompression && plain[0] === 0x1f && plain[1] === 0x8b) plain = await transformBytes(plain,new DecompressionStream('gzip'));
  return JSON.parse(decode.decode(plain));
}
async function playerChannel(id, secret) {
  return {id,secret,key:await cipher(secret),topic:'alea-crypt-' + await derive('channel/'+id,secret),seen:new Set()};
}
function roleLink(locationUrl) {
  const hash = new URLSearchParams(locationUrl.hash.slice(1));
  if (!locationUrl.hash) return {role:'gm',secret:randomSecret(),fresh:true};
  const gm = hash.get('gm'), player=hash.get('player'), actorId=hash.get('hero');
  if (!player && /^[0-9a-f]{64}$/.test(gm)) return {role:'gm',secret:gm};
  if (!gm && /^[0-9a-f]{64}$/.test(player) && HEROES.includes(actorId)) return {role:'player',secret:player,actorId};
  throw Error('Länken till spelmötet är ogiltig. Be spelledaren om en ny inbjudan.');
}
async function acquireHost(locks, name) {
  if (!locks) return () => {};
  let release, resolveLock;
  const ready = new Promise(resolve=>{resolveLock=resolve});
  const held = new Promise(resolve=>{release=resolve});
  const finished = locks.request(name,{ifAvailable:true},lock=>{
    resolveLock(Boolean(lock));
    return lock ? held : undefined;
  });
  if (!await Promise.race([ready,finished.then(()=>false)])) throw Error('Kryptan är redan öppen i en annan spelledarflik.');
  return release;
}

export async function openCryptSession({
  onView=()=>{}, onStatus=()=>{}, onError=()=>{},
  url=location.href, replaceUrl=value=>history.replaceState(null,'',value),
  storage, locks=globalThis.navigator?.locks, wireFactory=openCryptWire,
  loadWorld=()=>import('./world.js'),
}={}) {
  const locationUrl=new URL(url);
  const {role,secret,actorId=null,fresh}=roleLink(locationUrl);
  const gm = role === 'gm';
  const clientId=crypto.randomUUID();
  let view=null, status='', online=false, received=0, closed=false, api, state, hostKey, storageKey, checkpoint=null;
  let generation=0, latestRevision=-1, releaseHost=()=>{}, work=Promise.resolve(), wire;
  const pending=new Map(), connected=new Set(), delivered=new Map();
  const channels=await Promise.all((gm?HEROES:[actorId]).map(async id=>
    playerChannel(id,gm?await derive('hero/'+id,secret):secret)));
  const byTopic=new Map(channels.map(ch=>[ch.topic,ch]));
  const player=channels[0];

  function setStatus() {
    const net=online?'Flera enheter':'Lokala flikar';
    const hostPresent=Date.now()-received<15_000;
    const message=gm?('Spelledare · '+net):!received?'Väntar på spelledaren · '+net:
      hostPresent?'Ansluten · '+net:'Spelledaren är frånkopplad';
    if (!gm && received && !hostPresent && view) show(null);
    if (message !== status) {
      status = message;
      onStatus(status);
    }
  }
  function show(next) {view=next;onView(next);}
  function queue(task) {
    const next=work.then(()=>{if(closed)throw Error('Spelmötet är stängt.');return task();});
    work=next.catch(()=>{});
    return next;
  }
  async function save(next, epoch) {
    const value=JSON.stringify(await seal(hostKey,{version:1,generation:epoch,state:next}));
    if (storage.getItem(storageKey) !== checkpoint) throw Error('Spelmötet har ändrats i en annan flik. Ladda om kartan.');
    try {storage.setItem(storageKey,value);checkpoint=value;}
    catch {throw Error('Spelmötet kunde inte sparas i den här webbläsaren.');}
  }
  async function send(ch, data) {
    const packet=await seal(ch.key,data,gm && ch.zip===true);
    if (!closed) wire?.send(ch.topic,packet);
  }
  async function publish(ch, force=false) {
    const projection=api.projectWorld(state,{role:'player',actorId:ch.id});
    const previous=delivered.get(ch.id);
    const stamp=generation+':'+projection.revision;
    if (!force && previous===stamp) return;
    delivered.set(ch.id,stamp);
    await send(ch,{type:'view',generation,view:projection});
  }
  async function update(command, credentials) {
    const next=await api.applyCommand(state,command,credentials);
    if (next!==state) {
      await save(next,generation);
      state=next;
      show(api.projectWorld(state,{role:'gm'}));
      await Promise.all(channels.filter(ch=>connected.has(ch.id)).map(ch=>publish(ch)));
    }
  }
  function viewIsNewer(epoch,next) {
    return epoch > generation || (epoch === generation && next.revision >= latestRevision);
  }
  function acceptView(epoch,next) {
    if (next && Number.isSafeInteger(next.revision) && Number.isSafeInteger(epoch) && viewIsNewer(epoch,next)) {
      const changed=!view || epoch!==generation || next.revision!==view.revision;
      generation = epoch;
      latestRevision = next.revision;
      if (changed) show(next);
    }
  }
  async function handleHost(ch,msg) {
    if (msg.type==='hello') {
      // Capability is negotiated per link. Keep plain JSON if any peer on that link needs it.
      ch.zip = ch.zip !== false && msg.zip === true;
      connected.add(ch.id);
      if (msg.generation!==generation || msg.revision!==api.projectWorld(state,{role:'player',actorId:ch.id}).revision) {
        await publish(ch,true);
      } else {
        await send(ch,{type:'alive'});
      }
      return;
    }
    if (msg.type!=='command' || typeof msg.client!=='string' || !msg.command || !/^[a-z0-9-]{1,72}$/i.test(msg.command.id||'')) return;
    let error;
    try {
      if (msg.generation!==generation) throw Error('Scenen har återställts. Välj handlingen igen.');
      // The invite determines the role and actor; sender-supplied authority is never used.
      if (msg.command.actorId && msg.command.actorId!==ch.id) throw Error('Du styr en annan rollperson.');
      const command={...msg.command,actorId:ch.id,id:ch.id+'-'+msg.command.id};
      await update(command,{role:'player',actorId:ch.id});
    } catch(reason) {error=reason.message||'Handlingen kunde inte genomföras.';}
    await send(ch,{type:'receipt',client:msg.client,id:msg.command.id,generation,
      view:api.projectWorld(state,{role:'player',actorId:ch.id}),...(error?{error}:{})});
  }
  function handlePlayer(msg) {
    if (!['view','alive','receipt'].includes(msg.type)) return;
    received=Date.now();setStatus();
    if (msg.type==='view') {acceptView(msg.generation,msg.view);return;}
    if (msg.type==='receipt' && msg.client===clientId) {
      const request=pending.get(msg.id);
      if (!request) return;
      clearInterval(request.retry);pending.delete(msg.id);
      acceptView(msg.generation,msg.view);
      if (msg.error) request.reject(Error(msg.error)); else request.resolve(view);
    }
  }
  async function receive(topic,packet) {
    const ch=byTopic.get(topic);
    if (!ch || closed || ch.seen.has(packet?.nonce)) return;
    let msg;
    try {msg=await unseal(ch.key,packet,!gm);} catch {return;}
    // Same-browser peers can receive the same authenticated frame locally and again from the relay.
    if (!msg || closed || ch.seen.has(packet.nonce)) return;
    ch.seen.add(packet.nonce);
    if (ch.seen.size > 128) ch.seen.delete(ch.seen.values().next().value);
    if (gm) {
      if (msg.type==='hello'||msg.type==='command') queue(()=>handleHost(ch,msg)).catch(onError);
    } else handlePlayer(msg);
  }
  function hello() {
    if (!gm && !closed) send(player,{type:'hello',generation,revision:view?.revision??-1,zip:canZip}).catch(onError);
  }
  const initialized=async()=>{
    if (gm) {
      storage??=globalThis.localStorage;
      if (!storage) throw Error('Lokal lagring krävs för spelledarens spelmöte.');
      storageKey='alea.crypt.v1.'+await derive('save',secret);
      releaseHost=await acquireHost(locks,storageKey);
      hostKey=await cipher(secret);
      api=await loadWorld();
      const saved=storage.getItem(storageKey);
      if (saved) {
        let record;
        try {record=await unseal(hostKey,JSON.parse(saved));} catch {throw Error('Det sparade spelmötet kunde inte öppnas.');}
        if (record.version!==1) throw Error('Det sparade spelmötet har en annan version.');
        state=record.state;generation=record.generation;checkpoint=saved;
      } else {
        if (!fresh) throw Error('Det här spelmötet finns på den enhet där spelledaren startade kryptan.');
        state=await api.createWorld();generation=1;
        await save(state,generation);
      }
      if (fresh) {locationUrl.hash='gm='+secret;replaceUrl(locationUrl.href);}
      show(api.projectWorld(state,{role:'gm'}));
    }
    wire=wireFactory(channels.map(ch=>ch.topic),receive,ready=>{online=ready;setStatus();if(ready)hello();});
    setStatus();hello();
  };
  try {await initialized();} catch(error){releaseHost();wire?.close();throw error;}
  // A pasted invitation can be a same-document hash navigation. Drop the old authority before joining.
  const reloadRole = () => {
    if (globalThis.location.hash !== locationUrl.hash) globalThis.location.reload();
  };
  globalThis.window?.addEventListener('hashchange', reloadRole);
  const timer = gm ? null : setInterval(() => { setStatus(); hello(); }, 3500);
  return {
    role,actorId,
    get status(){return status;},get view(){return view;},
    invite(id) {
      const ch=channels.find(channel=>channel.id===id);
      if(!gm||!ch)throw Error('Endast spelledaren kan bjuda in spelare.');
      const link=new URL(locationUrl);link.hash=new URLSearchParams({player:ch.secret,hero:id}).toString();return link.href;
    },
    playerView() {return gm?api.projectWorld(state,{role:'player'}):view;},
    async command(input) {
      if (!view||closed) throw Error('Väntar på spelledaren.');
      const command={...input,id:input.id||crypto.randomUUID(),expectedRevision:input.expectedRevision??view.revision};
      if(gm)return queue(async()=>{await update(command,{role:'gm'});return view;});
      if(Date.now()-received>=15_000)throw Error('Spelledaren är frånkopplad.');
      if(pending.has(command.id))return pending.get(command.id).promise;
      const message={type:'command',client:clientId,generation,command};
      const request={};request.promise=new Promise((resolve,reject)=>Object.assign(request,{resolve,reject}));
      pending.set(command.id,request);
      let remaining=3;
      const attempt=()=>{
        if(remaining-- >0){send(player,message).catch(onError);return;}
        clearInterval(request.retry);pending.delete(command.id);request.reject(Error('Spelledaren svarade inte. Kontrollera läget innan du försöker igen.'));hello();
      };
      request.retry=setInterval(attempt,2000);attempt();
      return request.promise;
    },
    async reset() {
      if(!gm)throw Error('Endast spelledaren kan återställa scenen.');
      return queue(async()=>{
        const next=await api.createWorld(),epoch=generation+1;
        await save(next,epoch);state=next;generation=epoch;
        show(api.projectWorld(state,{role:'gm'}));
        await Promise.all(channels.filter(ch=>connected.has(ch.id)).map(ch=>publish(ch,true)));
        return view;
      });
    },
    close() {
      if (closed) return;
      closed = true;
      globalThis.window?.removeEventListener('hashchange', reloadRole);
      clearInterval(timer);
      wire.close();
      for(const r of pending.values()){clearInterval(r.retry);r.reject(Error('Spelmötet har stängts.'));}
      pending.clear();work.finally(releaseHost);
    },
  };
}
