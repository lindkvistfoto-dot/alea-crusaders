import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('legacy/app.js');
const artSource=read('features/equipment/art.js');
const begin=source.indexOf('/* v0.35.69 — keep the JWT fresh');
const end=source.indexOf('async function loadProfile()',begin);
const code=source.slice(begin,end);
const makeJwt=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature';
const now=()=>Math.floor(Date.now()/1000);
const makeResponse=(status,data={},message='')=>({
 status,ok:status>=200&&status<300,
 json:async()=>data,
 clone:()=>({text:async()=>message})
});
function makeAuth(fetch,expiresIn=-30){
 const scope={
  supabaseSession:{
   access_token:makeJwt(now()+expiresIn),refresh_token:'refresh-old',
   user:{id:'user1'}
  },
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_KEY:'publishable-test',
  fetch,
  atob:s=>Buffer.from(s,'base64').toString('utf8')
 };
 scope.storeSession=value=>{scope.supabaseSession=value};
 runInNewContext(code+';globalThis.api={authFetch,freshSupabaseAccessToken};',scope);
 return scope;
}
function makeArt(fetch){
 const window={},id='f53b9568-81ec-4623-ac6d-dd452177a769';
 let index=0;
 const ImageStub=class{
  constructor(){this.naturalWidth=450;this.naturalHeight=450}
  set src(url){Promise.resolve().then(()=>this.onload())}
 };
 const scope={
  window,fetch,crypto:{randomUUID:()=>id},
  URL:{createObjectURL:()=>('blob:test-'+(++index)),revokeObjectURL(){}},
  Image:ImageStub,
  document:{
   getElementById:()=>null,
   createElement:()=>({
    getContext:()=>({clearRect(){},drawImage(){}}),
    toBlob:(callback,type)=>callback({type,size:5000})
   })
  },
  alert:msg=>{throw Error(msg)}
 };
 runInNewContext(artSource,scope);
 window.aleaEquipmentArt.configure('https://example.supabase.co');
 return {art:window.aleaEquipmentArt,id};
}

describe('Supabase access-token renewal',()=>{
 it('refreshes an already expired access token before writing to PostgREST',async()=>{
  let refreshes=0;
  const sent=[];
  const scope=makeAuth(async(url,opts)=>{
   if(url.includes('/auth/v1/token?grant_type=refresh_token')){
    refreshes++;
    return makeResponse(200,{access_token:makeJwt(now()+3600),refresh_token:'refresh-new',expires_at:now()+3600});
   }
   sent.push(opts.headers.Authorization);
   return makeResponse(200,{saved:true});
  });
  const res=await scope.api.authFetch('/rest/v1/rule_weapons',{
   method:'PATCH',headers:{Authorization:'Bearer '+makeJwt(now()-30)},body:'{}'
  });
  expect(res.ok).toBe(true);
  expect(refreshes).toBe(1);
  expect(sent).toEqual(['Bearer '+scope.supabaseSession.access_token]);
  expect(scope.supabaseSession.refresh_token).toBe('refresh-new');
 });
 it('retries once after an auth rejection between expiry check and save',async()=>{
  let writes=0,refreshes=0;
  const scope=makeAuth(async(url,opts)=>{
   if(url.includes('grant_type=refresh_token')){
    refreshes++;
    return makeResponse(200,{access_token:makeJwt(now()+3600),refresh_token:'refresh-new'});
   }
   writes++;
   return writes===1?makeResponse(401):makeResponse(200,{saved:true});
  },3600);
  const result=await scope.api.authFetch('/rest/v1/rule_weapons',{
   method:'PATCH',headers:{Authorization:'Bearer '+scope.supabaseSession.access_token},body:'{}'
  });
  expect(result.ok).toBe(true);
  expect(refreshes).toBe(1);
  expect(writes).toBe(2);
 });
 it('shares one refresh among simultaneous saving requests',async()=>{
  let refreshes=0,writes=0;
  const scope=makeAuth(async(url,opts)=>{
   if(url.includes('grant_type=refresh_token')){
    refreshes++;
    return makeResponse(200,{access_token:makeJwt(now()+3600),refresh_token:'refresh-new'});
   }
   writes++;
   return makeResponse(200);
  });
  const headers={Authorization:'Bearer '+scope.supabaseSession.access_token};
  await Promise.all([
   scope.api.authFetch('/rest/v1/rule_weapons',{headers}),
   scope.api.authFetch('/rest/v1/rule_shields',{headers})
  ]);
  expect(refreshes).toBe(1);
  expect(writes).toBe(2);
 });
 it('keeps selected image in editor and retries the upload with new credentials',async()=>{
  const requests=[],tokens=[];
  const {art,id}=makeArt(async(url,opts)=>{
   requests.push({url,auth:opts.headers.Authorization});
   return requests.length===1?makeResponse(401):makeResponse(200);
  });
  art.start('weapon',{});
  await art.choose({type:'image/png',size:15000});
  const result=await art.prepare('weapon',id,{
   key:'publishable-test',token:'expired-token',
   getToken:async(force,failed)=>{tokens.push({force,failed});return force?'renewed-token':'expired-token'}
  });
  expect(result.uploaded).toContain('weapon/'+id+'/');
  expect(tokens).toEqual([{force:undefined,failed:undefined},{force:true,failed:'expired-token'}]);
  expect(requests).toHaveLength(2);
  expect(requests.map(r=>r.auth)).toEqual(['Bearer expired-token','Bearer renewed-token']);
 });
 it('does not retry non-auth storage errors or discard the selected image',async()=>{
  let requests=0;
  const {art,id}=makeArt(async()=>{
   requests++;
   return makeResponse(403,{message:'Forbidden'},'permission denied');
  });
  art.start('weapon',{});
  await art.choose({type:'image/png',size:15000});
  const ctx={key:'publishable-test',token:'valid',getToken:async()=>'valid'};
  await expect(art.prepare('weapon',id,ctx)).rejects.toThrow('Forbidden');
  expect(requests).toBe(1);
  // The draft remains available for a later save attempt.
  await expect(art.prepare('weapon',id,ctx)).rejects.toThrow('Forbidden');
  expect(requests).toBe(2);
 });
});
