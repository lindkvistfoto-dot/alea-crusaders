// Navigation is a live broadcast. Presence reports users (multiple tabs count once).
export function createGather({identity, readSession, connect, publish, open, announce, changed, uuid}) {
 let binding=null, session=null, lookup=null, received=new Set(), latest=null, delivery=null, joined=false;
 let members={}, opened='', report=null, submitting=false;
 const same=(a,b)=>a?.campaign===b?.campaign&&a?.user===b?.user&&a?.gm===b?.gm;
 const current=b=>binding===b&&same(b,identity());
 function state(){
  return {ready:!!binding&&current(binding)&&joined,busy:submitting,session,
   online:Object.values(members).filter(tabs=>tabs.some(t=>t.player===true)).length,
   report:report&&{view:report.view,total:report.expected.size,opened:report.opened.size}};
 }
 function disconnect(){
  const old=delivery;delivery=null;joined=false;latest=null;received=new Set();
  members={};opened='';report=null;submitting=false;
  old?.close();
 }
 function reset(){
  binding=null;session=null;lookup=null;disconnect();changed(state());
 }
 function presence(rows){
  members=rows;
  if(report){
   for(const [user,tabs] of Object.entries(rows)){
    // Presence and broadcast arrive independently. A rendered receipt can arrive
    // before the sender has received this player's initial join.
    if(tabs.some(t=>t.player===true&&t.opened===report.id)){
     report.expected.add(user);report.opened.add(user);
    }
   }
  }
  changed(state());
 }
 async function receive(message,b,s,channel){
  if(!current(b)||session!==s||delivery!==channel||b.gm||!message?.id||
     !['map','image'].includes(message.view)||!message.target||received.has(message.id))return;
  received.add(message.id);latest=message.id;
  const valid=()=>current(b)&&session===s&&delivery===channel&&latest===message.id;
  try{
   if(await readSession(b.campaign)!==s||!valid())return;
   if(!await open(message,valid)||!valid())return;
   opened=message.id;await channel.track({player:true,opened});
  }catch(error){if(valid())announce('Kunde inte öppna spelarvyn. '+error.message);}
 }
 function refresh(){
  const value=identity();
  if(!value){if(binding)reset();return Promise.resolve();}
  if(!same(value,binding)){reset();binding=value;}
  if(lookup)return lookup;
  const b=binding;
  const pending=(async()=>{
   const s=await readSession(b.campaign);
   if(!current(b))return;
   if(s===session&&delivery){await delivery.refreshAuth();return;}
   disconnect();session=s;
   if(s){
    const channel=connect(s,b,{
     message:m=>void receive(m,b,s,channel),
     presence:rows=>{if(current(b)&&channel===delivery)presence(rows);},
     status:async ready=>{
      if(!current(b)||channel!==delivery)return;
      joined=ready;
      if(ready)await channel.track({player:!b.gm,opened});
      changed(state());
     }
    });
    delivery=channel;channel.start();
   }
   changed(state());
  })().catch(error=>{if(current(b))console.warn('Kunde inte ansluta till spelmötet',error.message);})
    .finally(()=>{if(lookup===pending)lookup=null;});
  lookup=pending;return pending;
 }
 async function send(view,target,prepare){
  const b=binding,s=session,channel=delivery;
  if(!b?.gm||!current(b)||!s||!channel||!joined||submitting||!target)return false;
  submitting=true;changed(state());
  const valid=()=>current(b)&&s===session&&channel===delivery;
  try{
   if(prepare&&!await prepare())return false;
   if(!valid())return false;
   const id=uuid();
   report={id,view,opened:new Set(),expected:new Set(Object.entries(members)
    .filter(([,tabs])=>tabs.some(t=>t.player===true)).map(([user])=>user))};
   if(await publish(b.campaign,s,view,target,id)!==id)throw Error('Servern bekräftade inte samlingen.');
   return valid();
  }catch(error){if(valid()){report=null;announce('Kunde inte samla spelarna. '+error.message);}return false;}
  finally{if(valid()){submitting=false;changed(state());}}
 }
 return {refresh,reset,state,send};
}
