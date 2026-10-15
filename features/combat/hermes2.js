/* HERMES 2.0 — optional Admin > Besvärjelser transfer console.
 * Existing editors and paths continue to work. The client cannot activate an unverified asset.
 */
(function(){
 'use strict';
 const section=document.querySelector('[data-admin-section="spells"]');
 if(!section)return;
 const style=document.createElement('style');
 style.textContent='.hermes2-panel{margin:14px 0;padding:14px;border:1px solid rgba(210,171,107,.4);border-radius:12px;background:rgba(30,25,20,.3)}.hermes2-panel h3{margin:0 0 5px}.hermes2-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end;margin:12px 0}.hermes2-controls label{display:flex;flex-direction:column;gap:5px;font-size:13px}.hermes2-controls select,.hermes2-controls input{min-width:0;width:100%;box-sizing:border-box}.hermes2-status{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.hermes2-job{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;border-top:1px solid rgba(200,170,120,.2);font-size:12px}.hermes2-job .status{opacity:.75;margin-left:auto}.hermes2-job button{font-size:12px}.hermes2-error{color:#f4ac97;overflow-wrap:anywhere;flex-basis:100%}';
 document.head.appendChild(style);
 const host=document.createElement('section');
 host.className='hermes2-panel';host.setAttribute('aria-label','HERMES 2.0 filöverföring');
 host.innerHTML='<h3>HERMES 2.0 · Bildöverföring</h3><p class="muted">Pilot för ARCANE IVORY. Original-PNG bevaras; en ny ikon aktiveras först efter verifierad GitHub-arkivering, filhämtning och databaskoppling.</p><form id="hermes2Form" class="hermes2-controls"><label>Register<select id="hermes2Kind"><option value="symbol">Magiska symboler</option><option value="spell">Besvärjelser</option></select></label><label>Objekt<select id="hermes2Target" required></select></label><label>PNG-original<input id="hermes2File" type="file" accept="image/png,.png" required></label><button id="hermes2Submit" class="smallbtn" type="submit">Överför via HERMES</button></form><p class="hermes2-status" role="status" aria-live="polite" id="hermes2Status"></p><div id="hermes2Jobs"></div>';
 const symbolTable=document.getElementById('adminMagicSymbolTable');
 const parent=symbolTable?.closest('.admin-subsection')||section;
 parent.parentNode.insertBefore(host,parent);
 const $=id=>host.querySelector('#'+id);
 const status=$('hermes2Status'),btn=$('hermes2Submit');
 let options={symbol:[],spell:[]},submitting=false,loaded=false;
 const safe=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const requireAdmin=()=>typeof activeUser==='function'&&!!activeUser()?.admin;
 const out=(message,isError=false)=>{status.textContent=message;status.style.color=isError?'#f4ac97':''};
 function targets(){
  const kind=$('hermes2Kind').value,select=$('hermes2Target');
  select.replaceChildren();
  for(const row of options[kind]){
   const option=document.createElement('option');option.value=row.key;option.textContent=row.name+' · '+row.key;
   select.appendChild(option);
  }
 }
 const digest=async(buffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const toWebp=(canvas,quality)=>new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('WebP-export misslyckades')),'image/webp',quality));
 async function prepare(file){
  if(!file||file.size>8*1024*1024||file.size<100)throw Error('Original-PNG måste vara 100 B–8 MiB.');
  const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(signature.join(',')!=='137,80,78,71,13,10,26,10')throw Error('Detta är ingen äkta PNG.');
  const image=await createImageBitmap(file);
  try{
   if(image.width!==image.height||image.width<640||image.width>4096)throw Error('ARCANE IVORY kräver kvadratisk PNG mellan 640 och 4096 px.');
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)throw Error('Canvas saknas i webbläsaren.');
   ctx.clearRect(0,0,640,640);ctx.drawImage(image,0,0,640,640);
   const original=ctx.getImageData(0,0,640,640).data;
   let visible=false,transparent=false;
   for(let i=3;i<original.length;i+=4){if(original[i]<255)transparent=true;if(original[i]>0)visible=true;if(visible&&transparent)break;}
   if(!visible||!transparent)throw Error('Bilden måste ha riktig transparens utanför ramen och synligt motiv.');
   let blob=null;
   for(const quality of [.90,.87,.84,.80,.76]){
    blob=await toWebp(canvas,quality);
    if(blob.size<=500000)break;
   }
   if(!blob||blob.size>500000)throw Error('Bilden kan inte optimeras under 500 kB utan för stor kvalitetsförlust.');
   const converted=await createImageBitmap(blob);
   try{
    if(converted.width!==640||converted.height!==640)throw Error('Felaktig WebP-storlek.');
    const checker=document.createElement('canvas');checker.width=640;checker.height=640;
    const cc=checker.getContext('2d',{willReadFrequently:true});cc.drawImage(converted,0,0);
    const alpha=cc.getImageData(0,0,640,640).data;
    for(let i=3;i<alpha.length;i+=4)if(original[i]!==alpha[i])throw Error('Alfakanalen ändrades vid optimering. Ingen fil har laddats upp.');
   }finally{converted.close?.()}
   return blob;
  }finally{image.close?.()}
 }
 async function request(formOrObject){
  const token=await freshSupabaseAccessToken();
  const multipart=formOrObject instanceof FormData;
  const r=await fetch(SUPABASE_URL+'/functions/v1/hermes-v2',{
   method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token,...(multipart?{}:{'Content-Type':'application/json'})},
   body:multipart?formOrObject:JSON.stringify(formOrObject)
  });
  const data=await r.json().catch(()=>({error:'INVALID_RESPONSE'}));
  if(!r.ok)throw Error(data.message||data.error||'HERMES API '+r.status);
  return data;
 }
 function label(s){return ({active:'Aktiv och verifierad',awaiting_archive:'Väntar på GitHub',failed:'Misslyckad',archived:'Arkiverad',verified:'Verifierad',staged:'Mottagen'})[s]||s}
 async function jobs(){
  if(!requireAdmin())return;
  try{
   const rows=await dbJson('hermes_jobs?select=id,kind,target_key,status,error_message,github_commit_sha,created_at&order=created_at.desc&limit=16');
   const container=$('hermes2Jobs');container.replaceChildren();
   const title=document.createElement('h4');title.textContent='Senaste överföringar';container.appendChild(title);
   if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='Inga HERMES 2.0-jobb ännu.';container.appendChild(p);}
   for(const item of rows){
    const line=document.createElement('div');line.className='hermes2-job';
    const name=document.createElement('strong');name.textContent=item.target_key;
    const type=document.createElement('span');type.textContent=item.kind==='symbol'?'Symbol':'Besvärjelse';
    const state=document.createElement('span');state.className='status';state.textContent=label(item.status);
    line.append(name,type,state);
    if(item.status!=='active'){
     const retry=document.createElement('button');retry.type='button';retry.className='smallbtn';retry.textContent='Försök igen';
     retry.onclick=async()=>{retry.disabled=true;out('Återupptar '+item.target_key+' …');
      try{const res=await request({action:'retry',job_id:item.id});out(res.ok?'Verifierat och aktiverat: '+item.target_key:'Väntar: '+(res.error||res.status),!res.ok);await jobs();if(res.ok)window.aleaMagicSymbolsAdmin?.refresh?.()}
      catch(e){out(e.message,true)}finally{retry.disabled=false}};
     line.appendChild(retry);
    }
    if(item.error_message){const err=document.createElement('span');err.className='hermes2-error';err.textContent=item.error_message;line.appendChild(err)}
    container.appendChild(line);
   }
  }catch(e){out('Kunde inte läsa jobbregistret: '+e.message,true)}
 }
 async function init(){
  if(!requireAdmin()){host.hidden=true;return}
  host.hidden=false;if(loaded)return;
  try{
   const [symbols,spells]=await Promise.all([
    dbJson('rule_magic_symbols?select=symbol_key,name&order=name.asc'),
    dbJson('rule_spells?select=spell_key,name&order=name.asc')
   ]);
   options={symbol:symbols.map(x=>({key:x.symbol_key,name:x.name})),spell:spells.map(x=>({key:x.spell_key,name:x.name}))};
   targets();loaded=true;await jobs();
  }catch(e){out('Kunde inte läsa masterregistren: '+e.message,true)}
 }
 $('hermes2Kind').addEventListener('change',targets);
 $('hermes2Form').addEventListener('submit',async ev=>{
  ev.preventDefault();if(submitting||!requireAdmin())return;
  const file=$('hermes2File').files?.[0],kind=$('hermes2Kind').value,key=$('hermes2Target').value;
  if(!file||!key)return;
  submitting=true;btn.disabled=true;
  try{
   out('Kontrollerar PNG, optimerar WebP och jämför alfakanal …');
   const optimized=await prepare(file);
   const originalHash=await digest(await file.arrayBuffer());
   out('Överför original och appfil (SHA-256 '+originalHash.slice(0,12)+'…) …');
   const form=new FormData();form.append('kind',kind);form.append('key',key);form.append('source',file,'original.png');form.append('app',optimized,'optimized.webp');
   const result=await request(form);
   if(result.ok){
    out('Klart och verifierat: '+key+'. GitHub, publicerad WebP och databas har kontrollerats.');
    $('hermes2File').value='';
    window.aleaMagicSymbolsAdmin?.refresh?.();
   }else out('Överföringen är sparad men inte aktiverad: '+(result.error||result.status)+'. Befintlig bild är oförändrad.',true);
   await jobs();
  }catch(e){out('Överföringen avbröts: '+e.message,true)}
  finally{submitting=false;btn.disabled=false}
 });
 const observer=new MutationObserver(()=>{if(!section.classList.contains('hidden'))void init()});
 observer.observe(section,{attributes:true,attributeFilter:['class']});
 if(!section.classList.contains('hidden'))void init();
})();
