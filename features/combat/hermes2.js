/* HERMES history and legacy icon rollback. New originals use the Drive queue. */
(function(){
 'use strict';
 const section=document.querySelector('[data-admin-section="spells"]');
 if(!section)return;
 const host=document.createElement('section');host.className='admin-subsection';
 host.innerHTML='<h3>HERMES · Bildöverföring</h3><p>Nya bilder publiceras från HERMES Google Drive-inkorg. Originaluppladdning och återförsök via HERMES 2.0 är stängda.</p><p role="status" aria-live="polite"></p><div></div>';
 section.appendChild(host);
 const status=host.querySelector('p[role="status"]'),list=host.querySelector('div');
 const requireAdmin=()=>typeof activeUser==='function'&&!!activeUser()?.admin;
 async function refresh(){
  host.hidden=!requireAdmin();if(host.hidden)return;
  try{
   const rows=await dbJson('hermes_jobs?select=id,kind,target_key,status&order=created_at.desc&limit=16');
   list.replaceChildren();
   for(const job of rows){
    const line=document.createElement('p');line.textContent=job.kind+' / '+job.target_key+' · '+job.status;
    if(job.status==='active'&&['spell','symbol'].includes(job.kind)){
     const button=document.createElement('button');button.type='button';button.textContent='Återställ föregående ikon';
     button.onclick=async()=>{
      if(!requireAdmin()||!window.confirm('Återställ tidigare ikon för '+job.target_key+'?'))return;
      button.disabled=true;
      try{
       const token=await freshSupabaseAccessToken();
       const response=await fetch(SUPABASE_URL+'/functions/v1/hermes-v2',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'rollback',job_id:job.id})});
       const result=await response.json();
       if(!response.ok||!result.ok)throw Error(result.message||result.error||'Återställning stoppad');
       status.textContent='Tidigare ikon återställd.';window.aleaMagicSymbolsAdmin?.refresh?.();await refresh();
      }catch(e){status.textContent=e.message}finally{button.disabled=false}
     };
     line.appendChild(button);
    }
    list.appendChild(line);
   }
  }catch(e){status.textContent='Kunde inte läsa HERMES-jobb: '+e.message}
 }
 new MutationObserver(()=>{if(!section.classList.contains('hidden'))void refresh()}).observe(section,{attributes:true,attributeFilter:['class']});
 if(!section.classList.contains('hidden'))void refresh();
})();
