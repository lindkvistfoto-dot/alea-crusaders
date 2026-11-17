import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../olympia-v2/session-client.js',import.meta.url),'utf8');
const issuer='https://wkiuyklzzroavclnsxna.supabase.co/auth/v1';
const jwt=(exp,iss=issuer)=>'head.'+Buffer.from(JSON.stringify({exp,iss})).toString('base64url')+'.sig';
const responseSession=(exp=Math.floor(Date.now()/1000)+3600)=>({access_token:jwt(exp)});
function makeWindow({embedded=false,stored=null,onParentMessage=null}={}){
 const listeners=new Set();
 const origin='https://lindkvistfoto-dot.github.io';
 const parent={postMessage:(message,targetOrigin)=>onParentMessage?.({message,targetOrigin,dispatch})};
 const localStorage={getItem:key=>key==='alea_supabase_session_dev'&&stored?JSON.stringify(stored):null};
 const win={
  location:{origin},
  parent:null,
  localStorage,
  crypto:{randomUUID:()=> 'request-1'},
  atob:value=>Buffer.from(value,'base64').toString('utf8'),
  addEventListener:(name,fn)=>{if(name==='message')listeners.add(fn)},
  removeEventListener:(name,fn)=>{if(name==='message')listeners.delete(fn)},
  setTimeout,
  clearTimeout,
 };
 function dispatch(event){for(const listener of [...listeners])listener(event)}
 win.parent=embedded?parent:win;
 runInNewContext(source,{window:win,Date,Math,Promise,Error,JSON,String,Number,Buffer,setTimeout,clearTimeout});
 return {win,dispatch,parent};
}
describe('OLYMPIA shared ALEA session client',()=>{
 it('requests a fresh access token from the same-origin ALEA parent',async()=>{
  const fresh=responseSession();
  const env=makeWindow({embedded:true,onParentMessage:({message,targetOrigin,dispatch,parent})=>{
   expect(message.type).toBe('ALEA_OLYMPIA_SESSION_REQUEST');
   expect(targetOrigin).toBe('https://lindkvistfoto-dot.github.io');
   queueMicrotask(()=>dispatch({origin:targetOrigin,source:parent,data:{type:'ALEA_OLYMPIA_SESSION_RESPONSE',requestId:message.requestId,ok:true,session:fresh}}));
  }});
  expect(await env.win.aleaOlympiaSessionClient.getSession()).toEqual(fresh);
 });
 it('rejects messages from a different source or origin and falls back only to a valid DEV session',async()=>{
  const local={access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'opaque'};
  const env=makeWindow({embedded:true,stored:local,onParentMessage:({message,dispatch})=>{
   queueMicrotask(()=>{
    dispatch({origin:'https://attacker.example',source:env?.parent,data:{type:'ALEA_OLYMPIA_SESSION_RESPONSE',requestId:message.requestId,ok:true,session:responseSession()}});
   });
  }});
  expect((await env.win.aleaOlympiaSessionClient.getSession()).access_token).toBe(local.access_token);
 });
 it('asks ALEA to refresh an expired session instead of reporting it as missing',async()=>{
  const stale={access_token:jwt(Math.floor(Date.now()/1000)-30),refresh_token:'opaque'};
  const env=makeWindow({stored:stale});
  await expect(env.win.aleaOlympiaSessionClient.getSession()).rejects.toThrow('ALEA_SESSION_REFRESH_REQUIRED');
 });
 it('rejects tokens issued by the LIVE Supabase project',async()=>{
  const wrongProject={access_token:jwt(Math.floor(Date.now()/1000)+3600,'https://wbmosmkirsitkonejzpg.supabase.co/auth/v1'),refresh_token:'opaque'};
  const env=makeWindow({stored:wrongProject});
  expect(await env.win.aleaOlympiaSessionClient.getSession()).toBeNull();
 });
});
