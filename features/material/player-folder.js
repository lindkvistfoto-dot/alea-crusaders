/* Sam Gamgi v0.34.86 — private persistent player folder, explicit sharing. */
export const SAM_PAGE_SIZE=24;
export function createSam({
 getCampaign,isAuthenticated,isGM,request
}){
 const state={campaign:'',rows:[],sharedIds:new Set(),page:0,hasNext:false,loading:false,busy:false,seq:0,notice:''};
 const campaign=()=>String(getCampaign()||'');
 const authorized=()=>Boolean(isAuthenticated()&&campaign());
 const gm=()=>authorized()&&isGM();
 const enc=x=>encodeURIComponent(String(x));
 function reset(){
  state.seq++;state.campaign='';state.rows=[];state.sharedIds.clear();
  state.page=0;state.hasNext=false;state.loading=false;state.busy=false;state.notice='';
 }
 function sync(){
  if(state.campaign!==campaign()){reset();state.campaign=campaign();}
 }
 async function load(){
  if(!authorized()){reset();return [];}
  sync();const seq=++state.seq,scope=campaign();
  state.loading=true;
  try{
   const shares=await request('campaign_material_shares?campaign_id=eq.'+enc(scope)+
    '&revoked_at=is.null&select=id,material_id,created_at&order=created_at.desc'+
    '&limit='+(SAM_PAGE_SIZE+1)+'&offset='+(state.page*SAM_PAGE_SIZE));
   if(seq!==state.seq||!authorized()||scope!==campaign())return [];
   state.hasNext=Array.isArray(shares)&&shares.length>SAM_PAGE_SIZE;
   const visible=(Array.isArray(shares)?shares:[]).slice(0,SAM_PAGE_SIZE);
   const ids=[...new Set(visible.map(s=>s.material_id).filter(Boolean))];
   let materials=[];
   if(ids.length){
    materials=await request('campaign_materials?campaign_id=eq.'+enc(scope)+
     '&id=in.('+ids.map(enc).join(',')+')&archived_at=is.null'+
     '&select=id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,created_at&limit='+SAM_PAGE_SIZE);
   }
   if(seq!==state.seq||!authorized()||scope!==campaign())return [];
   const map=new Map((Array.isArray(materials)?materials:[]).map(r=>[r.id,r]));
   state.rows=visible.map(s=>({...s,material:map.get(s.material_id)||null})).filter(s=>s.material);
   state.sharedIds=new Set(state.rows.map(s=>s.material_id));
   state.notice='';
   return state.rows;
  }catch(error){
   if(seq===state.seq&&scope===campaign()){state.notice=error.message;state.rows=[];state.hasNext=false;}
   return [];
  }finally{if(seq===state.seq)state.loading=false;}
 }
 async function change(row,shared){
  if(!gm()||state.busy)return null;
  sync();
  if(!row||row.campaign_id!==campaign()||!row.id||row.archived_at){
   state.notice='Materialet tillhör inte den aktuella kampanjen eller är arkiverat.';return null;
  }
  const scope=campaign(),seq=++state.seq;
  state.busy=true;
  try{
   const result=await request('rpc/sam_set_material_share',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({p_campaign_id:scope,p_material_id:row.id,p_shared:shared})
   });
   if(seq!==state.seq||scope!==campaign())return null;
   if(result?.campaign_id!==scope||result?.material_id!==row.id||result?.shared!==shared)
    throw Error('Servern bekräftade inte delningen.');
   if(shared)state.sharedIds.add(row.id);else state.sharedIds.delete(row.id);
   state.notice=shared?
    (result.changed?'Materialet lades till i spelarmappen.':'Materialet finns redan i spelarmappen.'):
    (result.changed?'Delningen återkallades.':'Materialet var redan återkallat.');
   return result;
  }catch(error){
   if(seq===state.seq&&scope===campaign())state.notice='Delningen misslyckades: '+error.message;
   return null;
  }finally{state.busy=false;}
 }
 async function share(row){return change(row,true);}
 async function revoke(row){return change(row,false);}
 async function shareMany(rows){
  if(!gm())return {shared:0,failed:0};
  let count=0,failed=0;
  for(const row of rows){
   if(!gm()||!authorized())break;
   const result=await share(row);
   if(result)count++;else failed++;
  }
  return {shared:count,failed};
 }
 async function page(delta){
  const next=state.page+delta;
  if(next<0||(delta>0&&!state.hasNext)||state.loading)return state.rows;
  state.page=next;
  return load();
 }
 return {state,reset,load,share,revoke,shareMany,page};
}
