/* Alea Crusaders v0.35.23 – authenticated, campaign-scoped audio Realtime.
 * State changes and one-shot sound identifiers contain no secret data.
 */
import {galadrielSocketUrl} from '../material/realtime.js?v=0.34.94';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AUDIO_STATE_TABLE='campaign_audio_state';
export const AUDIO_EVENTS_TABLE='campaign_audio_events';
export function audioRealtimeConfig(campaign){
 if(!UUID.test(String(campaign||'')))throw Error('Ogiltigt kampanj-ID.');
 return [AUDIO_STATE_TABLE,AUDIO_EVENTS_TABLE].map(table=>({
  event:'*',schema:'public',table,filter:'campaign_id=eq.'+campaign
 }))
}
export function createAudioRealtime({
 getCampaign,getToken,isAuthenticated,supabaseUrl,publishableKey,
 onState=()=>{},onEvent=()=>{},onConnected=()=>{},onStatus=()=>{},
 makeSocket=url=>new WebSocket(url),clock=()=>Date.now(),
 timers={setInterval,clearInterval}
}){
 const state={started:false,connected:false,connecting:false,scope:'',socket:null,
  serial:0,ref:0,joinRef:null,token:'',heartbeat:null,lifecycle:null,
  retryMs:1000,nextAttempt:0,joinStarted:0,status:'Vilande'};
 const campaign=()=>String(getCampaign()||'');
 const authorized=()=>Boolean(isAuthenticated()&&getToken()&&UUID.test(campaign()));
 const topic=id=>'realtime:alea-audio:'+id;
 const notify=(message)=>{state.status=message;onStatus(message,state.connected)};
 function send(target,event,payload={},joinRef=null){
  if(!state.socket||state.socket.readyState!==1)return null;
  const ref=String(++state.ref);
  state.socket.send(JSON.stringify({topic:target,event,payload,ref,join_ref:joinRef}));
  return ref
 }
 function close(){
  state.serial++;state.connected=false;state.connecting=false;
  if(state.heartbeat){timers.clearInterval(state.heartbeat);state.heartbeat=null}
  if(state.socket){
   const socket=state.socket;state.socket=null;
   socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;
   try{socket.close(1000,'Alea audio reset')}catch(_error){}
  }
  state.joinRef=null;state.joinStarted=0;state.token=''
 }
 function reset(){
  close();state.scope='';state.retryMs=1000;state.nextAttempt=0;notify('Vilande')
 }
 function reconnect(){
  close();
  if(!authorized()){notify('Frånkopplad');return}
  state.nextAttempt=clock()+state.retryMs;
  state.retryMs=Math.min(30000,state.retryMs*2);
  notify('Reservsynk · återansluter')
 }
 function onFrame(event,serial){
  if(serial!==state.serial||!authorized()||state.scope!==campaign())return;
  let frame;try{frame=JSON.parse(event.data)}catch(_error){return}
  if(!frame||Array.isArray(frame)||typeof frame!=='object'||frame.topic!==topic(state.scope))return;
  if(frame.event==='phx_reply'&&frame.ref===state.joinRef){
   const accepted=frame.payload?.status==='ok'&&
    Array.isArray(frame.payload?.response?.postgres_changes)&&
    frame.payload.response.postgres_changes.length===2;
   if(accepted){
    state.connected=true;state.connecting=false;state.retryMs=1000;
    notify('Ljud synkat · realtid');onConnected()
   }else reconnect();
   return
  }
  if(frame.event==='postgres_changes'&&state.connected){
   const data=frame.payload?.data,row=data?.record;
   if(data?.schema!=='public'||!row||row.campaign_id!==state.scope)return;
   if(data.table===AUDIO_STATE_TABLE&&['INSERT','UPDATE'].includes(data.type))onState(row);
   if(data.table===AUDIO_EVENTS_TABLE&&data.type==='INSERT')onEvent(row)
  }else if(frame.event==='phx_close'||frame.event==='phx_error')reconnect()
 }
 function connect(){
  if(!state.started||!authorized()||state.socket||state.connecting)return;
  const scope=campaign(),token=getToken();
  let socket;try{socket=makeSocket(galadrielSocketUrl(supabaseUrl,publishableKey))}catch(_error){reconnect();return}
  state.scope=scope;state.socket=socket;state.connecting=true;state.joinStarted=clock();state.token=token;
  const serial=++state.serial;
  notify('Ansluter ljud…');
  socket.onopen=()=>{
   if(serial!==state.serial||!authorized()||scope!==campaign())return;
   state.joinRef=send(topic(scope),'phx_join',{
    config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:audioRealtimeConfig(scope),private:false},
    access_token:token
   });
   state.heartbeat=timers.setInterval(()=>{
    if(serial!==state.serial||!authorized()){reconnect();return}
    const fresh=getToken();
    if(fresh!==state.token){state.token=fresh;send(topic(scope),'access_token',{access_token:fresh},state.joinRef)}
    send('phoenix','heartbeat',{},null)
   },20000)
  };
  socket.onmessage=event=>onFrame(event,serial);
  socket.onerror=()=>notify('Reservsynk · nätverksfel');
  socket.onclose=()=>{if(serial===state.serial)reconnect()}
 }
 function tick(){
  if(!state.started)return;
  if(!authorized()){if(state.scope||state.socket)reset();return}
  if(state.scope&&state.scope!==campaign())reset();
  if(state.connecting&&clock()-state.joinStarted>=15000)reconnect();
  if(!state.socket&&clock()>=state.nextAttempt)connect()
 }
 function start(){if(state.started)return;state.started=true;tick();state.lifecycle=timers.setInterval(tick,5000)}
 function stop(){
  state.started=false;
  if(state.lifecycle){timers.clearInterval(state.lifecycle);state.lifecycle=null}
  reset()
 }
 return {state,start,stop,tick,connected:()=>state.connected,status:()=>state.status}
}
