/* Alea Crusaders v0.35.34 – campaign time realtime header sync. */
import {createDayRealtime} from './realtime.js?v=0.35.34';
let busy=false,queued=false;
const campaign=()=>String(centralCampaignId||'');
const authorized=()=>Boolean(supabaseSession?.access_token&&activeUser()&&campaign());
async function refreshCampaignClock(){
 if(!authorized())return;
 if(busy){queued=true;return}
 const id=campaign();busy=true;
 try{
  const rows=await dbJson('campaign_day_state?campaign_id=eq.'+encodeURIComponent(id)+
   '&select=campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,erf_enabled,started_at,time_of_day&limit=1');
  if(id!==campaign()||!Array.isArray(rows))return;
  const next=rows[0]||null;
  const oldDay=campaignDayState?.day_number;
  const changed=JSON.stringify(next)!==JSON.stringify(campaignDayState);
  if(changed){
   campaignDayState=next;
   if(oldDay!==next?.day_number&&next){
    await Promise.all([loadCampaignCharacterRestStates(),loadCampaignErfAwards()]);
   }
   renderCampaignDayHeader();
   if(!document.getElementById('campaignDayModal')?.classList.contains('hidden'))renderCampaignDayModal();
  }
 }catch(error){console.warn('Kunde inte synkronisera kampanjtid',error)}
 finally{busy=false;if(queued){queued=false;void refreshCampaignClock()}}
}
const sync=createDayRealtime({
 getCampaign:campaign,getToken:()=>supabaseSession?.access_token||'',
 isAuthenticated:authorized,supabaseUrl:SUPABASE_URL,publishableKey:SUPABASE_KEY,
 onRefresh:refreshCampaignClock,
 onStatus:(status,connected)=>{const btn=document.getElementById('campaignTimeBtn');
  if(btn)btn.dataset.sync=connected?'realtime':'fallback'}
});
function mount(){
 sync.start();
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){sync.tick();void refreshCampaignClock()}
 });
}
window.aleaCampaignTimeSync=Object.freeze({
 refresh:refreshCampaignClock,connected:sync.connected,status:sync.status
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
