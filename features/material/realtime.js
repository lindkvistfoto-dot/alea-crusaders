/* Galadriel v0.34.87: RLS-scoped PostgreSQL change notifications.
 * No secrets are sent in change payloads: only revision counters.
 */
export const GALADRIEL_TABLE='campaign_material_signals';
export function galadrielSocketUrl(base,key){
 if(!/^https:\/\//.test(String(base||''))||!key)throw Error('Säker Supabase-adress krävs.');
 return base.replace(/^https:/,'wss:').replace(/\/+$/,'')+
  '/realtime/v1/websocket?apikey='+encodeURIComponent(key)+'&vsn=1.0.0';
}
export function galadrielPostgresConfig(campaign){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(campaign||'')))
  throw Error('Ogiltigt kampanj-ID.');
 return {event:'*',schema:'public',table:GALADRIEL_TABLE,
  filter:'campaign_id=eq.'+campaign,
  select:['campaign_id','presentation_revision','folder_revision']};
}
export function createGaladriel({
 getCampaign,getToken,isAuthenticated,supabaseUrl,publishableKey,
 onPresentation=()=>{},onFolder=()=>{},onStatus=()=>{},
 makeSocket=url=>new WebSocket(url),clock=()=>Date.now(),
 timers={setInterval,clearInterval}
}){
 const state={started:false,connected:false,connecting:false,scope:'',socket:null,
  sessionToken:'',lastPresentation:-1,lastFolder:-1,joinRef:null,serial:0,ref:0,
  nextAttempt:0,retryMs:1000,heartbeat:null,lifecycle:null,joinStarted:0,
  lastReconcile:0,lastFallback:0,status:'Vilande'};
 const scope=()=>String(getCampaign()||'');
 const credentials=()=>Boolean(isAuthenticated()&&scope()&&getToken());
 const topic=campaign=>'realtime:galadriel:'+campaign;
 function emitStatus(label){
  state.status=label;try{onStatus(label,state.connected)}catch(_){}
 }
 function send(topicName,event,payload={},joinRef=null){
  if(!state.socket||state.socket.readyState!==1)return null;
  const ref=String(++state.ref);
  state.socket.send(JSON.stringify({topic:topicName,event,payload,ref,join_ref:joinRef}));
  return ref;
 }
 function closeSocket(){
  state.serial++;state.connected=false;state.connecting=false;
  if(state.heartbeat){timers.clearInterval(state.heartbeat);state.heartbeat=null;}
  const socket=state.socket;state.socket=null;
  if(socket){
   socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;
   try{socket.close(1000,'Galadriel reset');}catch(_){}
  }
  state.joinRef=null;state.sessionToken='';state.joinStarted=0;
 }
 function reset(){
  closeSocket();state.scope='';state.lastPresentation=-1;state.lastFolder=-1;
  state.retryMs=1000;state.nextAttempt=0;state.lastReconcile=0;state.lastFallback=0;
  emitStatus('Vilande');
 }
 function call(action){
  try{const result=action();if(result?.catch)result.catch(()=>{});}catch(_){}
 }
 function reconcile(){
  if(!credentials())return;
  state.lastReconcile=clock();
  call(onPresentation);call(onFolder);
 }
 function applySignal(row,source='postgres_changes'){
  if(!state.connected||!credentials()||state.scope!==scope()||row?.campaign_id!==scope())return false;
  const presentation=Number(row.presentation_revision),folder=Number(row.folder_revision);
  if(!Number.isSafeInteger(presentation)||presentation<0||
     !Number.isSafeInteger(folder)||folder<0)return false;
  if(presentation>state.lastPresentation){
   state.lastPresentation=presentation;
   if(source==='postgres_changes')call(onPresentation);
  }
  if(folder>state.lastFolder){
   state.lastFolder=folder;
   if(source==='postgres_changes')call(onFolder);
  }
  return true;
 }
 function reconnect(){
  closeSocket();
  if(!credentials()){emitStatus('Vilande');return;}
  state.nextAttempt=clock()+state.retryMs;
  state.retryMs=Math.min(30000,state.retryMs*2);
  emitStatus('Reservläge · återansluter');
 }
 function onFrame(event,serial){
  if(serial!==state.serial||!credentials()||state.scope!==scope())return;
  let frame;try{frame=JSON.parse(event.data)}catch(_){return;}
  if(!frame||Array.isArray(frame)||typeof frame!=='object')return;
  if(frame.topic===topic(state.scope)&&frame.event==='phx_reply'&&frame.ref===state.joinRef){
   if(frame.payload?.status==='ok'&&Array.isArray(frame.payload?.response?.postgres_changes)&&
     frame.payload.response.postgres_changes.length){
    state.connected=true;state.connecting=false;state.retryMs=1000;
    state.lastPresentation=-1;state.lastFolder=-1;
    emitStatus('Ansluten · realtid');reconcile();
   }else{emitStatus('Prenumerationen nekades · reservläge');reconnect();}
   return;
  }
  if(frame.topic===topic(state.scope)&&frame.event==='postgres_changes'){
   const data=frame.payload?.data;
   if(data?.schema==='public'&&data?.table===GALADRIEL_TABLE&&
      (data.type==='INSERT'||data.type==='UPDATE'))applySignal(data.record);
  }else if(frame.event==='phx_error'||frame.event==='phx_close'){
   reconnect();
  }
 }
 function connect(){
  if(!state.started||!credentials()||state.socket||state.connecting)return false;
  const campaign=scope(),token=getToken();
  let url,configuration;try{
   url=galadrielSocketUrl(supabaseUrl,publishableKey);
   configuration=galadrielPostgresConfig(campaign);
  }catch(_){emitStatus('Realtime saknas · reservläge');return false;}
  let socket;try{socket=makeSocket(url)}catch(_){reconnect();return false;}
  state.socket=socket;state.scope=campaign;state.sessionToken=token;
  state.connecting=true;state.connected=false;state.joinStarted=clock();state.lastFallback=clock();
  const serial=++state.serial;
  emitStatus('Ansluter till Galadriel…');
  socket.onopen=()=>{
   if(serial!==state.serial||!credentials()||state.scope!==scope())return;
   state.joinRef=send(topic(campaign),'phx_join',{
    config:{broadcast:{ack:false,self:false},presence:{enabled:false},
     postgres_changes:[configuration],private:false},
    access_token:token
   });
   if(state.heartbeat)timers.clearInterval(state.heartbeat);
   state.heartbeat=timers.setInterval(()=>{
    if(serial!==state.serial||!credentials()){reconnect();return;}
    const latest=getToken();
    if(latest&&latest!==state.sessionToken){
     state.sessionToken=latest;
     send(topic(campaign),'access_token',{access_token:latest},state.joinRef);
    }
    send('phoenix','heartbeat',{},null);
   },20000);
  };
  socket.onmessage=event=>onFrame(event,serial);
  socket.onerror=()=>{if(serial===state.serial)emitStatus('Nätverksfel · reservläge')};
  socket.onclose=()=>{if(serial===state.serial)reconnect()};
  return true;
 }
 function tick(){
  if(!state.started)return;
  if(!credentials()){
   if(state.scope||state.socket||state.connected)reset();
   return;
  }
  if(state.scope&&state.scope!==scope())reset();
  if(state.connecting&&state.joinStarted&&clock()-state.joinStarted>=15000)reconnect();
  if(!state.socket&&clock()>=state.nextAttempt)connect();
  const now=clock();
  if(!state.connected){
   if(now-state.lastFallback>=15000){state.lastFallback=now;reconcile();}
  }else if(now-state.lastReconcile>=60000)reconcile();
 }
 function start(){
  if(state.started)return;
  state.started=true;tick();
  state.lifecycle=timers.setInterval(tick,5000);
 }
 function stop(){
  state.started=false;
  if(state.lifecycle){timers.clearInterval(state.lifecycle);state.lifecycle=null;}
  reset();
 }
 return {state,start,stop,reset,tick,reconcile,applySignal,
  status:()=>({connected:state.connected,scope:state.scope,status:state.status})};
}
