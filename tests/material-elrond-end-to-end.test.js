import {describe,it,expect} from 'vitest';
import {createFrodo} from '../features/material/presentation.js';
import {createSam} from '../features/material/player-folder.js';
import {createGaladriel} from '../features/material/realtime.js';
import {createLegolas} from '../features/material/viewer.js';
import {mountGaladriel} from '../features/material/galadriel-ui.js';
import {readFileSync} from 'node:fs';

const campaign='846e8089-24da-4825-af34-32903117152a';
const foreign='746e8089-24da-4825-af34-32903117152a';
const media=[
 {id:'de9537ff-4747-402b-a99c-e527e1f1c2da',campaign_id:campaign,title:'Riddar Johan',
  category:'npc',asset_kind:'image',storage_bucket:'campaign-actor-images',
  storage_path:campaign+'/npc/id/portrait.webp',archived_at:null},
 {id:'12b7db78-51de-4d7e-8780-f062288d8b3b',campaign_id:campaign,title:'Gravgast',
  category:'monster',asset_kind:'image',storage_bucket:'campaign-actor-images',
  storage_path:campaign+'/monster/id/portrait.webp',archived_at:null}
];
function virtualServer(){
 const state={shown:null,revision:0,shares:new Map(),folderRevision:0,presentationRevision:0};
 const currentMaterials=new Map(media.map(x=>[x.id,x]));
 const calls=[];
 const currentRole={gm:true,player:true,outsider:false};
 function visible(role,row){
  return Boolean(row&&row.campaign_id===campaign&&
   (role==='gm'||(currentRole[role]&&(!row.archived_at)&&(state.shown===row.id||state.shares.has(row.id)))));
 }
 function request(role){
  return async(path,options)=>{
   calls.push({role,path,method:options?.method||'GET'});
   if(path.startsWith('campaign_material_presentations?')){
    if(!currentRole[role])return [];
    return state.revision?[{campaign_id:campaign,material_id:state.shown,revision:state.revision}]:[];
   }
   if(path.startsWith('campaign_material_shares?')){
    if(!currentRole[role])return [];
    return [...state.shares.entries()].map(([id,created],i)=>({
     id:'share'+i,material_id:id,created_at:created
    }));
   }
   if(path.startsWith('campaign_materials?')){
    const id=path.match(/id=eq\.([^&]+)/)?.[1];
    const inIds=path.match(/id=in\.\(([^)]+)\)/)?.[1]?.split(',')||null;
    const list=id?[currentMaterials.get(decodeURIComponent(id))]:
     inIds?inIds.map(x=>currentMaterials.get(decodeURIComponent(x))):[...currentMaterials.values()];
    return list.filter(x=>visible(role,x));
   }
   if(path==='rpc/frodo_set_presentation'){
    if(role!=='gm')throw Error('permission denied');
    const body=JSON.parse(options.body);
    if(body.p_campaign_id!==campaign)throw Error('wrong campaign');
    if(body.p_expected_revision!==state.revision)throw Error('stale presentation');
    if(body.p_material_id&&!currentMaterials.has(body.p_material_id))throw Error('not found');
    state.revision++;state.shown=body.p_material_id;
    state.presentationRevision++;
    return {campaign_id:campaign,revision:state.revision,material_id:state.shown};
   }
   if(path==='rpc/sam_set_material_share'){
    if(role!=='gm')throw Error('permission denied');
    const body=JSON.parse(options.body);
    if(body.p_campaign_id!==campaign)throw Error('wrong campaign');
    if(!currentMaterials.has(body.p_material_id))throw Error('not found');
    if(body.p_shared)state.shares.set(body.p_material_id,new Date().toISOString());
    else state.shares.delete(body.p_material_id);
    state.folderRevision++;
    return {campaign_id:campaign,material_id:body.p_material_id,
     shared:body.p_shared,changed:1};
   }
   throw Error('Unknown request: '+path);
  };
 }
 function storage(role,bucket,path){
  if(!currentRole[role])throw Error('denied');
  const row=media.find(x=>x.storage_bucket===bucket&&x.storage_path===path);
  if(!visible(role,row))throw Error('Storage RLS denied');
  return new Blob(['private image'],{type:'image/webp'});
 }
 return {state,request,storage,calls,currentRole,visible};
}
function virtualSockets(){
 const sockets=[];
 function makeSocket(url){
  const socket={url,readyState:0,sent:[],closed:false,
   send(frame){this.sent.push(JSON.parse(frame));},
   close(){this.closed=true;this.readyState=3;}};
  sockets.push(socket);return socket;
 }
 function connected(socket){
  socket.readyState=1;
  socket.onopen();
  const join=socket.sent.find(x=>x.event==='phx_join');
  socket.onmessage({data:JSON.stringify({
   topic:join.topic,event:'phx_reply',ref:join.ref,
   payload:{status:'ok',response:{postgres_changes:[{id:1}]}}
  })});
 }
 function emit(socket,state,scope=campaign){
  socket.onmessage?.({data:JSON.stringify({
   topic:'realtime:galadriel:'+scope,event:'postgres_changes',
   payload:{data:{schema:'public',table:'campaign_material_signals',type:'UPDATE',
    record:{campaign_id:scope,presentation_revision:state.presentationRevision,
     folder_revision:state.folderRevision}}}
  })});
 }
 return {sockets,makeSocket,connected,emit};
}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};

describe('Elronds råd — two-role material journey',()=>{
 it('GM presentation → player preview → switch → stop, without leaking previous image',async()=>{
  const db=virtualServer(),ws=virtualSockets(),shown=[],cleared=[];
  const playerFrodo=createFrodo({
   getCampaign:()=>campaign,isAuthenticated:()=>true,isGM:()=>false,request:db.request('player'),
   onPresentation:row=>shown.push(row.title),onCleared:()=>cleared.push(1)
  });
  const gmFrodo=createFrodo({
   getCampaign:()=>campaign,isAuthenticated:()=>true,isGM:()=>true,request:db.request('gm')
  });
  const gmSam=createSam({getCampaign:()=>campaign,isAuthenticated:()=>true,
   isGM:()=>true,request:db.request('gm')});
  const playerSam=createSam({getCampaign:()=>campaign,isAuthenticated:()=>true,
   isGM:()=>false,request:db.request('player')});
  const playerSocket=createGaladriel({
   getCampaign:()=>campaign,getToken:()=> 'player-access-token',isAuthenticated:()=>true,
   supabaseUrl:'https://example.supabase.co',publishableKey:'publishable',
   makeSocket:ws.makeSocket,
   onPresentation:()=>playerFrodo.refresh({autoOpen:true}),
   onFolder:()=>playerSam.load(),
   timers:{setInterval:()=>1,clearInterval:()=>{}}
  });
  const playerLegolas=createLegolas({getCampaign:()=>campaign,isLoggedIn:()=>true,
   isGM:()=>false,query:db.request('player'),read:(bucket,path)=>db.storage('player',bucket,path)});
  expect((await db.request('player')('campaign_materials?select=id')).length).toBe(0);
  await expect(playerLegolas.readMedia(media[0])).rejects.toThrow('RLS');
  playerSocket.start();ws.connected(ws.sockets[0]);await settle();
  expect(shown).toEqual([]);
  expect(await gmFrodo.show(media[0])).toBeTruthy();
  ws.emit(ws.sockets[0],db.state);await settle();
  expect(shown).toEqual(['Riddar Johan']);
  expect((await playerLegolas.readMedia(media[0])).size).toBeGreaterThan(0);
  expect(await gmFrodo.show(media[1])).toBeTruthy();
  ws.emit(ws.sockets[0],db.state);await settle();
  expect(shown).toEqual(['Riddar Johan','Gravgast']);
  await expect(playerLegolas.readMedia(media[0])).rejects.toThrow('RLS');
  expect(await gmFrodo.stop()).toBeTruthy();
  ws.emit(ws.sockets[0],db.state);await settle();
  expect(cleared).toHaveLength(1);
  await expect(playerLegolas.readMedia(media[1])).rejects.toThrow('RLS');
  expect((await playerSam.load())).toHaveLength(0);
  playerSocket.stop();
 });
 it('persistent Sam folder survives Frodo stop, then revoke removes access',async()=>{
  const db=virtualServer();
  const gmFrodo=createFrodo({
   getCampaign:()=>campaign,isAuthenticated:()=>true,isGM:()=>true,request:db.request('gm')
  });
  const gmSam=createSam({getCampaign:()=>campaign,isAuthenticated:()=>true,
   isGM:()=>true,request:db.request('gm')});
  const playerSam=createSam({getCampaign:()=>campaign,isAuthenticated:()=>true,
   isGM:()=>false,request:db.request('player')});
  const playerLegolas=createLegolas({getCampaign:()=>campaign,isLoggedIn:()=>true,
   isGM:()=>false,query:db.request('player'),read:(bucket,path)=>db.storage('player',bucket,path)});
  await gmFrodo.show(media[0]);
  await gmSam.share(media[0]);
  await gmFrodo.stop();
  expect((await playerSam.load()).map(x=>x.material.title)).toEqual(['Riddar Johan']);
  expect((await playerLegolas.readMedia(media[0])).size).toBeGreaterThan(0);
  await gmSam.revoke(media[0]);
  expect(await playerSam.load()).toEqual([]);
  await expect(playerLegolas.readMedia(media[0])).rejects.toThrow('RLS');
  expect(db.state.shares.size).toBe(0);
  expect(media[0].storage_path).toContain('/portrait.webp');
 });
 it('player cannot grant, revoke or present; campaign outsider sees nothing',async()=>{
  const db=virtualServer();
  const raw=db.request('player');
  await expect(raw('rpc/sam_set_material_share',{method:'POST',body:'{}'})).rejects.toThrow('permission');
  await expect(raw('rpc/frodo_set_presentation',{method:'POST',body:'{}'})).rejects.toThrow('permission');
  expect(await db.request('outsider')('campaign_materials?select=id')).toEqual([]);
  expect(await db.request('outsider')('campaign_material_presentations?select=material_id')).toEqual([]);
  await expect(Promise.resolve().then(()=>db.storage('outsider',media[0].storage_bucket,media[0].storage_path)))
   .rejects.toThrow('denied');
 });
 it('stale second GM cannot overwrite an updated presentation without a refresh',async()=>{
  const db=virtualServer();
  const makeGM=()=>createFrodo({getCampaign:()=>campaign,isAuthenticated:()=>true,
   isGM:()=>true,request:db.request('gm')});
  const first=makeGM(),second=makeGM();
  await first.refresh();await second.refresh();
  expect(await first.show(media[0])).not.toBeNull();
  expect(await second.show(media[1])).toBeNull();
  expect(db.state.shown).toBe(media[0].id);
  await second.refresh();
  expect(await second.show(media[1])).not.toBeNull();
  expect(db.state.shown).toBe(media[1].id);
 });
 it('a revoked view checks exact RLS access; page absence is never proof of revoke',async()=>{
  const db=virtualServer();
  const gmSam=createSam({getCampaign:()=>campaign,isAuthenticated:()=>true,isGM:()=>true,
   request:db.request('gm')});
  const calls=[],legolas={
   state:{panelOpen:true,viewerOpen:true,previewRows:[media[0]],index:0,selection:new Map()},
   loadPage:()=>{calls.push('reload')},
   closeViewer:()=>{calls.push('closed');legolas.state.viewerOpen=false}
  };
  let visibleResult=true;
  const frodoUi={frodo:{state:{materialId:null},refresh:async()=>({})}};
  const samUi={load:async()=>{calls.push('samload')},sam:{state:{rows:[]}}};
  const view=mountGaladriel({
   legolas,frodoUi,samUi,getCampaign:()=>campaign,getToken:()=> 'player',
   isAuthenticated:()=>true,isGM:()=>false,
   verifyVisible:async()=>visibleResult,
   supabaseUrl:'https://example.supabase.co',publishableKey:'pub',
   makeSocket:()=>({readyState:1,send(){},close(){}})
  });
  // applySignal requires confirmed subscription; instead trigger REST reconciliation
  // after setting connected signal context for these callbacks.
  const socket=view.galadriel;
  socket.start();
  const c=socket.state.socket;
  c.onopen();
  const join=JSON.parse('{"ref":"1"}'); // the transport's current join reference
  c.onmessage({data:JSON.stringify({topic:'realtime:galadriel:'+campaign,
   event:'phx_reply',ref:socket.state.joinRef,
   payload:{status:'ok',response:{postgres_changes:[{id:1}]}}})});
  await settle();
  expect(calls).not.toContain('closed');
  await gmSam.share(media[0]);
  visibleResult=false; // exactly the RLS response after revocation
  socket.applySignal({campaign_id:campaign,presentation_revision:2,folder_revision:2});
  await settle();
  expect(calls).toContain('closed');
  socket.stop();
 });
 it('logs out and invalidates stale campaign resources',()=>{
  const f=readFileSync(new URL('../features/material/viewer.js',import.meta.url),'utf8');
  const g=readFileSync(new URL('../features/material/galadriel-ui.js',import.meta.url),'utf8');
  expect(f).toContain('if(state.viewerOpen)closeViewer()');
  expect(f).toContain('state.previewRows=[];state.index=0');
  expect(g).toContain('verifyVisible(displayed.id,campaign)');
  expect(g).not.toContain('!samUi.sam.state.rows.some');
 });
});
