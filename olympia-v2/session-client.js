(function(root){
'use strict';
const PROJECT_ISSUER='https://wkiuyklzzroavclnsxna.supabase.co/auth/v1';
const REQUEST='ALEA_OLYMPIA_SESSION_REQUEST';
const RESPONSE='ALEA_OLYMPIA_SESSION_RESPONSE';
function createAleaOlympiaSessionClient(win=root){
 function issuerMatches(value){
  try{
   const part=String(value?.access_token||'').split('.')[1];
   if(!part)return false;
   const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
   const payload=JSON.parse(win.atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')));
   return payload.iss===PROJECT_ISSUER;
  }catch(_){return false}
 }
 function isUsable(value){
  try{
   const part=String(value?.access_token||'').split('.')[1];
   if(!part)return false;
   const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
   const payload=JSON.parse(win.atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')));
   return payload.iss===PROJECT_ISSUER&&Number(payload.exp)*1000>Date.now()+15000;
  }catch(_){return false}
 }
 function storedSession(){
  for(const name of ['alea_supabase_session_dev','alea_supabase_session']){
   try{const value=JSON.parse(win.localStorage.getItem(name)||'null');if(issuerMatches(value))return value}catch(_){}
  }
  return null;
 }
 function requestFromAlea(){
  const origin=win.location?.origin;
  if(!origin||!win.parent||win.parent===win)return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
   const requestId=(win.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
   let finished=false;
   const finish=(value,error)=>{
    if(finished)return;
    finished=true;win.clearTimeout(timer);win.removeEventListener('message',receive);
    if(error)reject(error);else resolve(value);
   };
   const receive=event=>{
    if(event.origin!==origin||event.source!==win.parent||event.data?.type!==RESPONSE||event.data?.requestId!==requestId)return;
    if(event.data.ok===true&&isUsable(event.data.session))finish(event.data.session);
    else if(event.data.ok===false)finish(null,new Error(String(event.data.code||'ALEA_SESSION_UNAVAILABLE')));
   };
   win.addEventListener('message',receive);
   const timer=win.setTimeout(()=>finish(null,new Error('ALEA_SESSION_BRIDGE_TIMEOUT')),4000);
   try{win.parent.postMessage({type:REQUEST,requestId},origin)}catch(error){finish(null,error)}
  });
 }
 async function getSession(){
  let parentError=null;
  if(win.parent&&win.parent!==win){
   try{const session=await requestFromAlea();if(session)return session}catch(error){parentError=error}
  }
  const local=storedSession();
  if(isUsable(local))return local;
  if(local?.refresh_token||parentError?.message==='ALEA_SESSION_REFRESH_FAILED')
   throw new Error('ALEA_SESSION_REFRESH_REQUIRED');
  if(parentError&&parentError.message!=='ALEA_SESSION_BRIDGE_TIMEOUT')
   throw parentError;
  return null;
 }
 return {getSession};
}
root.createAleaOlympiaSessionClient=createAleaOlympiaSessionClient;
if(root&&root.localStorage&&root.location)root.aleaOlympiaSessionClient=createAleaOlympiaSessionClient(root);
})(window);
