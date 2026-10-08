/* Frodo Bagger v0.34.85 — an explicit, versioned campaign presentation. */
const MATERIAL_SELECT='id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,created_at,archived_at';

export function createFrodo({
 getCampaign,isAuthenticated,isGM,request,
 onPresentation=()=>{},onCleared=()=>{},onChange=()=>{},onNotice=()=>{}
}){
 const state={
  campaign:'',revision:0,materialId:null,row:null,loaded:false,seenRevision:null,
  seq:0,busy:false,lastError:''
 };
 const campaign=()=>String(getCampaign()||'');
 const allowed=()=>Boolean(isAuthenticated()&&campaign());
 const gm=()=>allowed()&&isGM();
 const enc=x=>encodeURIComponent(String(x));
 const valid=scope=>scope===campaign()&&allowed();
 function reset(){
  state.seq++;state.campaign='';state.revision=0;state.materialId=null;
  state.row=null;state.loaded=false;state.seenRevision=null;state.busy=false;state.lastError='';
  onChange(state);
 }
 function syncScope(){
  if(state.campaign===campaign())return;
  reset();state.campaign=campaign();
 }
 function notify(message,error=false){state.lastError=error?message:'';onNotice(message,error);}
 async function refresh({autoOpen=false,silent=false}={}){
  if(!allowed()){reset();return null;}
  syncScope();
  const scope=campaign(),seq=++state.seq;
  try{
   const records=await request('campaign_material_presentations?campaign_id=eq.'+enc(scope)+
    '&select=campaign_id,material_id,revision&limit=1');
   if(seq!==state.seq||!valid(scope))return null;
   const record=Array.isArray(records)?records[0]:null;
   const revision=Number(record?.revision||0);
   const id=record?.material_id||null;
   if(!Number.isSafeInteger(revision)||revision<0)throw Error('Ogiltig revisionsinformation.');
   const changed=state.seenRevision!==revision||state.materialId!==id;
   let row=null;
   if(id){
    const materials=await request('campaign_materials?campaign_id=eq.'+enc(scope)+
     '&id=eq.'+enc(id)+'&archived_at=is.null&select='+MATERIAL_SELECT+'&limit=1');
    if(seq!==state.seq||!valid(scope))return null;
    row=(Array.isArray(materials)?materials:[]).find(x=>x.id===id&&x.campaign_id===scope&&!x.archived_at)||null;
   }
   if(seq!==state.seq||!valid(scope))return null;
   const hadMaterial=Boolean(state.materialId);
   state.revision=revision;state.materialId=row?.id||null;state.row=row;state.loaded=true;
   state.seenRevision=revision;
   onChange(state);
   if(!isGM()&&autoOpen&&changed){
    if(row)onPresentation(row);
    else if(hadMaterial)onCleared();
   }
   return state;
  }catch(error){
   if(seq===state.seq&&valid(scope)){
    if(!silent)notify('Kunde inte läsa aktuell visning: '+error.message,true);
   }
   return null;
  }
 }
 async function command(row){
  if(!gm()||state.busy)return null;
  syncScope();
  const scope=campaign();
  if(row&&(row.campaign_id!==scope||row.archived_at||!row.id)){
   notify('Bilden tillhör inte din aktuella kampanj eller är arkiverad.',true);return null;
  }
  if(!state.loaded){
   const current=await refresh();
   if(!current||!valid(scope))return null;
  }
  const seq=++state.seq;
  state.busy=true;onChange(state);
  try{
   const result=await request('rpc/frodo_set_presentation',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({p_campaign_id:scope,p_material_id:row?.id||null,p_expected_revision:state.revision})
   });
   if(!valid(scope)||seq!==state.seq)return null;
   const revision=Number(result?.revision);
   if(!Number.isSafeInteger(revision)||revision<=state.revision)
    throw Error('Servern lämnade inget giltigt versionsnummer.');
   state.revision=revision;state.materialId=row?.id||null;state.row=row||null;
   state.seenRevision=revision;state.loaded=true;
   notify(row?'Visas för deltagarna: '+row.title:'Visningen avslutad.');
   return result;
  }catch(error){
   if(seq===state.seq&&valid(scope)){
    notify('Kunde inte ändra visning: '+error.message+'. Uppdatera status och försök igen.',true);
    // Conflict detection must reload the current version before a new command.
    state.loaded=false;
   }
   return null;
  }finally{
   state.busy=false;onChange(state);
  }
 }
 async function show(row){return command(row);}
 async function stop(){return command(null);}
 function canShow(row){return gm()&&!state.busy&&row?.campaign_id===campaign()&&row?.id&&!row.archived_at;}
 return {state,reset,refresh,show,stop,canShow};
}
