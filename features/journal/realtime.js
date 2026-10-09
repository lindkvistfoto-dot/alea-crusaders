/* Alea Crusaders v0.34.95 – safe campaign journal revision notifications.
 * Only campaign_id + revision are transported over Realtime.
 * The viewer always fetches its own RLS-filtered journal data.
 */
import {galadrielSocketUrl} from '../material/realtime.js?v=0.34.94';

export const JOURNAL_SIGNAL_TABLE='campaign_journal_entries';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function journalSignalConfig(campaign){
 if(!UUID.test(String(campaign||'')))throw Error('Ogiltigt kampanj-ID.');
 return {event:'INSERT',schema:'public',table:JOURNAL_SIGNAL_TABLE,
  filter:'campaign_id=eq.'+campaign};
}

export function createJournalRealtime({
 getCampaign,getToken,isAuthenticated,supabaseUrl,publishableKey,
 onRefresh=()=>{},onStatus=()=>{},makeSocket=url=>new WebSocket(url),
 clock=()=>Date.now(),timers={setInterval,clearInterval}
}){
 const state={started:false,connected:false,connecting:false,scope:'',socket:null,
  serial:0,ref:0,joinRef:null,sessionToken:'',revision:-1,
  retryMs:1000,nextAttempt:0,joinStarted:0,heartbeat:null,lifecycle:null,
  lastReconcile:0,lastFallback:0,status:'Vilande'};
 const scope=()=>String(getCampaign()||'');
 const authorized=()=>Boolean(isAuthenticated()&&scope()&&getToken());
 const topic=campaign=>'realtime:journal-sync:'+campaign;
 function emitStatus(label){
  state.status=label;
  try{onStatus(label,state.connected)}catch(_){}
 }
 function requestRefresh(){
  if(!authorized())return;
  state.lastReconcile=clock();
  try{const result=onRefresh();if(result?.catch)result.catch(error=>console.warn('Kartsynk misslyckades',error))}
  catch(error){console.warn('Kartsynk misslyckades',error)}
 }
 function send(name,event,payload={},joinRef=null){
  if(!state.socket||state.socket.readyState!==1)return null;
  const ref=String(++state.ref);
  state.socket.send(JSON.stringify({topic:name,event,payload,ref,join_ref:joinRef}));
  return ref;
 }
 function closeSocket(){
  state.serial++;
  state.connected=false;state.connecting=false;
  if(state.heartbeat){timers.clearInterval(state.heartbeat);state.heartbeat=null}
  const ws=state.socket;state.socket=null;
  if(ws){
   ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;
   try{ws.close(1000,'Journal sync reset')}catch(_){}
  }
  state.joinRef=null;state.joinStarted=0;state.sessionToken='';
 }
 function reset(){
  closeSocket();state.scope='';state.revision=-1;
  state.retryMs=1000;state.nextAttempt=0;state.lastReconcile=0;state.lastFallback=0;
  emitStatus('Vilande');
 }
 function reconnect(){
  closeSocket();
  if(!authorized()){emitStatus('Vilande');return}
  state.nextAttempt=clock()+state.retryMs;
  state.retryMs=Math.min(30000,state.retryMs*2);
  emitStatus('Reservsynk · återansluter');
 }
 function applySignal(row){
  if(!state.connected||!authorized()||state.scope!==scope()||
    row?.campaign_id!==state.scope)return false;
  if(typeof row.id!=='string')return false;
  requestRefresh();
  return true;
 }
 function onFrame(event,serial){
  if(serial!==state.serial||!authorized()||state.scope!==scope())return;
  let frame;try{frame=JSON.parse(event.data)}catch(_){return}
  if(!frame||Array.isArray(frame)||typeof frame!=='object')return;
  if(frame.topic===topic(state.scope)&&frame.event==='phx_reply'&&
     frame.ref===state.joinRef){
   if(frame.payload?.status==='ok'&&
      Array.isArray(frame.payload?.response?.postgres_changes)&&
      frame.payload.response.postgres_changes.length){
    state.connected=true;state.connecting=false;state.retryMs=1000;
    state.revision=-1;emitStatus('Ansluten · realtid');
    requestRefresh();
   }else{
    reconnect();
   }
   return;
  }
  if(frame.topic===topic(state.scope)&&frame.event==='postgres_changes'){
   const data=frame.payload?.data;
   if(data?.schema==='public'&&data?.table===JOURNAL_SIGNAL_TABLE&&
     data.type==='INSERT'){
    applySignal(data.record);
   }
  }else if(frame.topic===topic(state.scope)&&
    (frame.event==='phx_error'||frame.event==='phx_close')){
   reconnect();
  }
 }
 function connect(){
  if(!state.started||!authorized()||state.socket||state.connecting)return false;
  const campaign=scope(),token=getToken();
  let url,config;try{
   url=galadrielSocketUrl(supabaseUrl,publishableKey);
   config=journalSignalConfig(campaign);
  }catch(_){emitStatus('Reservsynk · Realtime saknas');return false}
  let ws;try{ws=makeSocket(url)}catch(_){reconnect();return false}
  state.socket=ws;state.scope=campaign;state.sessionToken=token;
  state.connected=false;state.connecting=true;
  state.joinStarted=clock();state.lastFallback=clock();
  const serial=++state.serial;
  emitStatus('Ansluter kartsynk…');
  ws.onopen=()=>{
   if(serial!==state.serial||!authorized()||state.scope!==scope())return;
   state.joinRef=send(topic(campaign),'phx_join',{
    config:{broadcast:{ack:false,self:false},presence:{enabled:false},
     postgres_changes:[config],private:false},
    access_token:token
   });
   if(state.heartbeat)timers.clearInterval(state.heartbeat);
   state.heartbeat=timers.setInterval(()=>{
    if(serial!==state.serial||!authorized()){reconnect();return}
    const latest=getToken();
    if(latest&&latest!==state.sessionToken){
     state.sessionToken=latest;
     send(topic(campaign),'access_token',{access_token:latest},state.joinRef);
    }
    send('phoenix','heartbeat',{},null);
   },20000);
  };
  ws.onmessage=event=>onFrame(event,serial);
  ws.onerror=()=>{if(serial===state.serial)emitStatus('Nätverksfel · reservsynk')};
  ws.onclose=()=>{if(serial===state.serial)reconnect()};
  return true;
 }
 function tick(){
  if(!state.started)return;
  if(!authorized()){
   if(state.scope||state.socket||state.connected)reset();
   return;
  }
  if(state.scope&&state.scope!==scope())reset();
  if(state.connecting&&state.joinStarted&&clock()-state.joinStarted>=15000)
   reconnect();
  if(!state.socket&&clock()>=state.nextAttempt)connect();
  const now=clock();
  if(!state.connected){
   if(now-state.lastFallback>=15000){
    state.lastFallback=now;requestRefresh();
   }
  }else if(now-state.lastReconcile>=60000)requestRefresh();
 }
 function start(){
  if(state.started)return;
  state.started=true;tick();
  state.lifecycle=timers.setInterval(tick,5000);
 }
 function stop(){
  state.started=false;
  if(state.lifecycle){timers.clearInterval(state.lifecycle);state.lifecycle=null}
  reset();
 }
 return {state,start,stop,tick,reconcile:requestRefresh,applySignal,
  connected:()=>state.connected,status:()=>state.status};
}
