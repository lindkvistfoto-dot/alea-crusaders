import {openDestination} from './gather-destination.js';
import {RealtimeClient} from '@supabase/realtime-js';
import {createGather} from './gather.js';

const byId=id=>document.getElementById(id);
const rpc=(name,values)=>dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(values)});
function identity(){
 const user=typeof supabaseSession!=='undefined'&&supabaseSession?.user?.id;
 return user&&centralCampaignId&&supabaseSession.access_token&&activeUser()
  ? {campaign:centralCampaignId,user,gm:!!(activeUser().admin||centralCampaignRole==='gm')} : null;
}
function connect(session,b,events){
 const socket=new RealtimeClient(SUPABASE_URL.replace(/^https:/,'wss:')+'/realtime/v1',{
  params:{apikey:SUPABASE_KEY},accessToken:async()=>supabaseSession?.access_token||null});
 const channel=socket.channel('gather:'+session,{config:{private:true,presence:{key:b.user}}});
 channel.on('broadcast',{event:'gather'},({payload})=>events.message(payload))
  .on('broadcast',{event:'arcane-reveal'},({payload})=>events.reveal(payload))
  .on('presence',{event:'sync'},()=>events.presence(channel.presenceState()));
 return {start:()=>channel.subscribe(status=>events.status(status==='SUBSCRIBED')),
  track:data=>channel.track(data),refreshAuth:()=>socket.setAuth(),
  close:()=>{void socket.removeChannel(channel).finally(()=>socket.disconnect());}};
}
function render(state){
 for(const button of document.querySelectorAll('[data-gather-view]')){
  const unavailable=button.dataset.gatherView==='map'?
    !activeCampaignMap?.player_visible||campaignActiveMapId!==activeCampaignMap.id:
    !window.aleaGatherGallery?.target(button.dataset.gatherView);
  button.disabled=!state.ready||state.busy||unavailable;
  button.title=!state.ready?'Samling kräver anslutning till ett pågående spelmöte':
    unavailable?(button.dataset.gatherView==='map'?'Gör först kartan aktuell för spelarna':'Välj en bild'):'Öppna vyn för spelmötets anslutna spelare';
 }
 for(const el of document.querySelectorAll('[data-gather-status]')){
  const r=state.report;
  el.textContent=r?.view===el.dataset.gatherStatus?
   r.total?r.opened+' av '+r.total+' spelare har öppnat '+(r.view==='map'?'kartan.':'bilden.'):'Inga spelare var anslutna.':
   state.ready&&identity()?.gm?(state.online===1?'1 spelare ansluten.':state.online+' spelare anslutna.'):'';
 }
}
const gather=createGather({identity,connect,open:openDestination,
 reveal:(session,event,valid)=>window.aleaExplorerGallery?.receive(session,event,valid),announce:m=>showBackupToast(m),
 readSession:campaign=>rpc('read_gather_session',{p_campaign_id:campaign}),
 publish:(campaign,session,view,target,id)=>rpc('send_session_gather',{p_campaign_id:campaign,p_session_id:session,p_view:view,p_target_id:target,p_command_id:id}),
 changed:render,uuid:()=>crypto.randomUUID()});
window.aleaGather={refresh:gather.refresh,render:()=>render(gather.state())};
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-gather-view]');
 if(!button||button.disabled)return;
 const view=button.dataset.gatherView;
 if(view==='map'){if(adventureCanManage()&&activeCampaignMap?.id===campaignActiveMapId)void gather.send('map',campaignActiveMapId);}
 else{
  const image=window.aleaGatherGallery?.target(view);
  if(image)void gather.send('image',image.id,image.prepare);
 }
});
window.addEventListener('pagehide',gather.reset);
window.addEventListener('offline',gather.reset);
window.addEventListener('online',gather.refresh);
window.addEventListener('pageshow',gather.refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void gather.refresh();});
new MutationObserver(()=>{if(!byId('loginScreen').classList.contains('hidden'))gather.reset();else void gather.refresh();})
 .observe(byId('loginScreen'),{attributes:true,attributeFilter:['class']});
void gather.refresh();
