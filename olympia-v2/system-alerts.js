(()=>{'use strict';
const panel=document.getElementById('system-alerts');
if(!panel)return;
const indicator=document.getElementById('system-alert-indicator');
const list=document.getElementById('system-alert-list');
const health=document.getElementById('system-alert-health');
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=value=>{if(!value)return'—';const date=new Date(value);return Number.isNaN(date.valueOf())?'—':date.toLocaleString('sv-SE')};
const labelStatus={active:'Aktivt',acknowledged:'Kvitterat · fortfarande aktivt',resolved:'Löst'};
const labelSeverity={critical:'KRITISKT',warning:'VARNING'};
function render(data){
 const alerts=Array.isArray(data.alerts)?data.alerts:[];
 const open=alerts.filter(a=>a.status==='active'||a.status==='acknowledged');
 const critical=open.some(a=>a.severity==='critical');
 indicator.hidden=open.length===0;
 indicator.classList.toggle('critical-active',critical);
 indicator.textContent=open.length?('⚠ '+open.length+' aktivt larm'+(open.length===1?'':'')+' · Visa'): 'Inga aktiva larm';
 indicator.setAttribute('aria-expanded',String(!list.hidden));
 panel.hidden=!open.length&&!alerts.some(a=>a.status==='resolved');
 list.innerHTML=open.map(a=>{
   const affected=a.affected&&typeof a.affected==='object'?JSON.stringify(a.affected):String(a.affected||'');
   const history=Array.isArray(a.history)?a.history:[];
   const ack=a.status==='active'?'<button type="button" data-ack="'+safe(a.id)+'">Kvittera</button>':a.status==='acknowledged'?'<span class="alert-acknowledged">Kvitterat; inväntar återkontroll</span>':'';
   return '<article class="system-alert '+(a.severity==='critical'?'is-critical':'is-warning')+'">'+
     '<div class="system-alert-heading"><strong>'+safe(labelSeverity[a.severity]||a.severity)+' · '+safe(a.environment)+'</strong><span>'+safe(labelStatus[a.status]||a.status)+'</span></div>'+
     '<p><b>'+safe(a.system)+' / '+safe(a.component)+'</b> · <code>'+safe(a.error_code)+'</code></p>'+
     '<p>'+safe(a.description)+'</p>'+
     '<p class="system-alert-meta">Uppstod: '+safe(localTime(a.occurred_at))+' · Senaste kontroll: '+safe(localTime(a.last_checked_at))+'</p>'+
     (affected?'<details><summary>Berörda jobb eller objekt</summary><pre>'+safe(affected)+'</pre></details>':'')+
     (a.recommended_action?'<p><b>Åtgärd:</b> '+safe(a.recommended_action)+'</p>':'')+
     '<details><summary>Larmlogg ('+history.length+')</summary><ul>'+history.map(h=>'<li>'+safe(h.event)+' · '+safe(localTime(h.at))+(h.code?' · '+safe(h.code):'')+'</li>').join('')+'</ul></details>'+
     '<div class="system-alert-actions">'+ack+'</div></article>';
 }).join('')||'<p>Inga aktiva larm.</p>';
 list.querySelectorAll('[data-ack]').forEach(button=>button.addEventListener('click',async()=>{
   button.disabled=true;
   try{await window.olympiaV2Request({action:'system_alert_ack',alert_id:button.dataset.ack});await refresh()}
   catch(error){button.disabled=false;button.textContent='Kunde inte kvittera · försök igen';}
 }));
 const runs=Array.isArray(data.health)?data.health:[];
 health.innerHTML='<h3>Senaste körningar</h3>'+runs.map(run=>'<p><b>'+safe(run.environment)+' · '+safe(run.system)+' / '+safe(run.component)+'</b> · '+safe(run.status==='success'?'OK':'FEL')+' · senaste lyckade kontroll '+safe(localTime(run.last_success_at))+(run.error_code?' · '+safe(run.error_code):'')+'</p>').join('')||'<p>Ingen körhistorik rapporterad ännu.</p>';
}
async function refresh(){
 if(!window.olympiaV2Request)return;
 try{render(await window.olympiaV2Request({action:'system_alert_list'}));}
 catch(error){panel.hidden=false;list.textContent='Larmstatus kunde inte läsas: '+(error.message||'anslutningsfel');}
}
indicator.addEventListener('click',()=>{list.hidden=!list.hidden;indicator.setAttribute('aria-expanded',String(!list.hidden));if(!list.hidden)list.scrollIntoView({block:'nearest'});});
refresh();
setInterval(()=>{if(!document.hidden)refresh()},90000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();