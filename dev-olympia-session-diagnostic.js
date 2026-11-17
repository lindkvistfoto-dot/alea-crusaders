/* Temporary DEV-only, read-only session diagnostics. Never display token values. */
(()=>{
'use strict';
const ISS='https://wkiuyklzzroavclnsxna.supabase.co/auth/v1';
const names=['alea_supabase_session_dev','alea_supabase_session'];
function inspect(){
 const out=[];
 for(const name of names){
  try{
   const raw=localStorage.getItem(name);
   if(!raw){out.push(name+': saknas');continue}
   const s=JSON.parse(raw),jwt=String(s?.access_token||'').split('.');
   if(jwt.length<2){out.push(name+': finns, JWT saknas');continue}
   const payload=JSON.parse(atob(jwt[1].replace(/-/g,'+').replace(/_/g,'/')));
   const remaining=Math.floor((Number(payload.exp)*1000-Date.now())/1000);
   out.push(name+': finns, issuer '+(payload.iss===ISS?'DEV korrekt':'FEL')+', giltighet '+(remaining>0?remaining+' sek kvar':'UTGÅNGEN')+', refresh '+(s?.refresh_token?'finns':'saknas'));
  }catch(e){out.push(name+': kan inte läsas ('+e.name+')')}
 }
 return out;
}
function attach(){
 if(document.getElementById('olympia-dev-session-diagnostic'))return;
 const headings=[...document.querySelectorAll('h1,h2,h3')];
 const heading=headings.find(el=>/välkommen till alea/i.test(el.textContent||''));
 if(!heading)return;
 const panel=document.createElement('section');
 panel.id='olympia-dev-session-diagnostic';
 panel.style.cssText='margin:12px 0;padding:12px;border:1px solid #98784d;border-radius:9px;background:#241e18;color:#f2dfbd;font:14px/1.5 system-ui;white-space:pre-line';
 const label=document.createElement('strong');label.textContent='DEV – Sessionsdiagnostik (endast läsning)';
 const result=document.createElement('div');result.style.marginTop='6px';
 const btn=document.createElement('button');btn.type='button';btn.textContent='Kontrollera igen';btn.style.marginTop='8px';
 const run=()=>{
  result.textContent='ALEA localStorage:\n'+inspect().join('\n')+'\nOLYMPIA getSession(): testas i OLYMPIA-vyn (inte på startsidan).';
 };
 btn.addEventListener('click',run);panel.append(label,result,btn);
 heading.insertAdjacentElement('afterend',panel);run();
}
document.addEventListener('DOMContentLoaded',attach);
const observer=new MutationObserver(attach);
observer.observe(document.documentElement,{subtree:true,childList:true});
setTimeout(()=>observer.disconnect(),30000);
attach();
})();