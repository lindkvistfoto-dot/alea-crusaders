/* GM-only live material preview. No public or permanent file URLs. */
export function createLivePreview({read,makeUrl,revokeUrl,onChange=()=>{}}){
 let key='',url='',phase='empty',title='',generation=0;
 const state=()=>({key,url,phase,title});
 const emit=()=>onChange(state());
 function release(){
  generation++;
  if(url){const previous=url;url='';revokeUrl(previous);}
 }
 function clear(){
  release();key='';phase='empty';title='';emit();
 }
 function set(row,campaign){
  const valid=Boolean(row?.id&&row.campaign_id===campaign&&row.asset_kind==='image'&&
   typeof row.storage_path==='string'&&row.storage_path.startsWith(campaign+'/'));
  const next=valid?[campaign,row.id,row.storage_bucket,row.storage_path].join('|'):'';
  if(next===key)return;
  release();key=next;title=valid?String(row.title||'Bild'):'';
  phase=valid?'loading':'empty';emit();
  if(!valid)return;
  const token=generation;
  void (async()=>{
   try{
    // Legolas reads the same full-size private Storage object the player viewer uses.
    const blob=await read(row,false);
    if(token!==generation||next!==key)return;
    url=makeUrl(blob);
    phase='ready';emit();
   }catch(_){
    if(token!==generation||next!==key)return;
    phase='error';emit();
   }
  })();
 }
 return {set,clear,getState:state};
}
