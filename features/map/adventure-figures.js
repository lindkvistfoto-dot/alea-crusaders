import {currentEncounter,startEncounter,displayEncounter} from './adventure-encounter.js';
import {readPanelTurn,renderAdventurePanels} from './adventure-panels.js';
import {createObjectEditor} from './object-library.js';
import './adventure-figures.css';
import {defaults,hexPanel,livingHexLayer} from './living-hex.js';
import { adventureCell, adventureGrid, hexCenter, nearestHex, adventureRoute } from './adventure-hex.js';
import { mapPointer, mapScreenScale } from './polygon-edit-geometry.js';

const table = 'adventure_map_figures';
const columns = 'id,character_id,npc_character_id,npc_id,monster_id,name,race,gender,q,r,player_visible';
const sourceFields = ['character_id','npc_character_id','npc_id','monster_id'];
const ns = 'http://www.w3.org/2000/svg';
const board = document.getElementById('adventureSlBoard');
const modeSwitch=document.getElementById('adventureModeSwitch');
const status = document.getElementById('adventureFigureStatus');
const viewport = document.getElementById('mapViewport');
const page = document.getElementById('mapPage');
page.querySelector('.mapworkarea').before(modeSwitch);
const art = () => window.aleaCombatPaperDollMap;
const controls=document.getElementById('adventureControls');
let boardOpen=false;
let view, drag, press, ghost, swallowClick = false;

function svg(tag, attrs = {}) {
  const el = document.createElementNS(ns, tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
  return el;
}
function notice(message = '') { status.textContent = message; }
function scope(v) {
  return 'campaign_id=eq.'+v.campaign+'&session_id=eq.'+v.session+'&map_id=eq.'+v.map.id;
}
function sourceField(row) { return sourceFields.find(field => row[field]); }
function actor(row, prefix = 'map') {
  const field = sourceField(row);
  return { id: prefix+'-'+(row.character_id || row.id || row[field]), source_id:row[field], name_snapshot:row.name,
    source_type: field === 'monster_id' ? 'monster' : field === 'npc_id' ? 'npc' : 'character',
    side:field === 'monster_id' ? 'enemies' : field === 'character_id' ? 'heroes' : 'neutral',
    race:row.race, gender:row.gender };
}
function sources(category) {
  if (category === 'monster') return campaignMonsters.filter(m=>m.active!==false).map(m=>({monster_id:m.id,name:m.name,race:m.race,gender:m.gender}));
  const people = chars.filter(c=>c._dbId && !!c.isNpc === (category === 'npc')).map(c=>({
    [category === 'npc' ? 'npc_character_id' : 'character_id']:c._dbId, name:c.identity?.namn || c.name || 'Namnlös',
    race:c.identity?.ras, gender:c.identity?.kon }));
  if (category === 'npc') people.push(...campaignNpcs.filter(n=>n.active!==false).map(n=>({npc_id:n.id,name:n.name,race:n.race,gender:n.gender})));
  return people;
}
function tokenArt(row, width, prefix) { return art()?.renderAdventureToken(actor(row,prefix),width) || ''; }
function renderPieces(v, landingId) {
  const rows = v.pending ? [...v.rows.filter(r=>r.id!==v.pending.id), v.pending] : v.rows;
  v.hexLayer.actors(rows,v.selected,v.hex.dispositions);
  if (!v.grid) { v.pieces.replaceChildren();return; }
  const remaining=new Map([...v.pieces.children].map(el=>[el.dataset.pieceKey,el]));
  let previous=null;
  // Depth order and stable DOM identity survive the server acknowledgement,
  // including the first hero upsert where the server allocates its row ID.
  for (const row of rows.slice().sort((a,b)=>a.r-b.r || a.q-b.q)) {
    const [x,y] = hexCenter(v.grid,row.q,row.r), w = v.grid.width;
    const key=row.character_id||row.id, drawing=tokenArt(row,w,row.character_id?'hero':'map');
    const piece=remaining.get(key)||svg('g',{'data-piece-key':key});
    remaining.delete(key);
    piece.dataset.figureId=row.id;
    piece.toggleAttribute('data-selected',v.selected===row.id);
    piece.setAttribute('transform','translate('+x+' '+y+')');
    const signature=[row.name,row.player_visible,w,drawing].join('|');
    if(piece.artSignature!==signature){
      piece.artSignature=signature;
      const title=svg('title'); title.textContent=row.name+(row.player_visible?'':' · dold för spelarna');
      const face = svg('g',{'data-face':''});
      if (drawing) face.innerHTML = drawing;
      else { const label=svg('text',{'text-anchor':'middle',fill:'ivory','font-size':w*.2}); label.textContent=row.name; face.append(label); }
      piece.replaceChildren(title,svg('rect',{x:-.47*w,y:-.85*w,width:.94*w,height:w,fill:'transparent'}),face);
      piece.toggleAttribute('data-concealed',!row.player_visible);
      if (!row.player_visible) piece.append(svg('circle',{class:'figure-secret',cx:w*.37,cy:w*.17,r:w*.065}));
    }
    const next=previous?previous.nextElementSibling:v.pieces.firstElementChild;
    if(piece!==next)v.pieces.insertBefore(piece,next);
    previous=piece;
    if (row.id===landingId && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      piece.querySelector('[data-face]').animate([{transform:'translateY(-8px) scale(1.08)'},{transform:'translateY(0) scale(.98)',offset:.75},{transform:'scale(1)'}],{duration:185,easing:'ease-out'});
  }
  for(const el of remaining.values())el.remove();
}
function toolPanel(v) {
  if (v.session===undefined) return '<p>Läser spelmötet…</p>';
  if (!v.session) return '<p>Starta eller återuppta ett spelmöte för att placera figurer.</p><button class="btn" type="button" data-action="session">Öppna Spelmöte</button>';
  const choices=sources(v.category);
  if (!choices.some(r=>r[sourceField(r)]===v.choice)) v.choice=choices[0]?.[sourceField(choices[0])];
  const select=(value,label,selected)=>'<option value="'+escAttr(value)+'"'+(selected?' selected':'')+'>'+escAttr(label)+'</option>';
  const allowance=row=>{
    const b=v.hex.budgets[row.id];
    if(!v.hex.round||!b)return '';
    const remaining=Math.max(0,b.max-b.spent);
    const keeps=combatDestinationKeepsAction({movement_max:b.max,movement_remaining:remaining},0);
    return ' · Förflyttning '+remaining+' / '+b.max+(keeps?' · Handling kvar':' · Hel förflyttning');
  };
  const disposition=row=>{
    if(row.character_id)return '';
    const tone=v.hex.dispositions?.[row.id]||(row.monster_id?'ruby':'amber');
    return '<label>Tillhörighet (SL)<select data-disposition="'+escAttr(row.id)+'">'+
      [['sapphire','Allierad'],['amber','Neutral'],['ruby','Fientlig'],['unknown','Okänd']].map(([value,label])=>select(value,label,value===tone)).join('')+'</select></label>';
  };
  const list=v.rows.map(r=>'<div class="slcb-visibility-row" data-instance="'+escAttr(r.id)+'"><span><b>'+escAttr(r.name)+'</b><small>Hex '+r.q+', '+r.r+allowance(r)+' · '+(r.player_visible?'Synlig':'Dold')+'</small></span>'+disposition(r)+'<div>'+
    '<button type="button" class="btn" data-action="move">Flytta</button> <button type="button" class="btn" data-action="visibility">'+(r.player_visible?'Dölj':'Visa')+'</button> <button type="button" class="btn" data-action="remove">Ta bort från kartan</button></div></div>').join('');
  return '<div class="figure-picker"><label>Typ<select data-field="category">'+[['character','Rollpersoner'],['npc','SLP'],['monster','Fiender']].map(([key,label])=>select(key,label,v.category===key)).join('')+'</select></label>'+
    '<label>Figur<select data-field="choice">'+choices.map(r=>select(r[sourceField(r)],r.name,r[sourceField(r)]===v.choice)).join('')+'</select></label>'+
    (v.category==='character'?'':'<label><input type="checkbox" data-field="hidden"'+(v.hidden?' checked':'')+'> Dold för spelarna</label>')+
    '<button type="button" class="btn" data-action="place"'+(!choices.length||!v.ready||!v.grid?' disabled':'')+'>Placera på kartan</button></div>'+
    (list?'<h4>På kartan</h4><div class="slcb-visibility-list">'+list+'</div>':'');
}
function renderBoard(v) {
  displayEncounter(v);
  renderAdventurePanels(v);
  modeSwitch.hidden=!(v?.gm && v.session && ((v.hexLoaded && v.grid) || v.encounter));
  for(const button of modeSwitch.querySelectorAll('button')){
    const selected=(button.dataset.mode==='battle')===Boolean(v?.encounter || v?.hex.round);
    if(button.dataset.mode==='battle')button.textContent=v?.pausedEncounter?'Återuppta strid':'Strid';
    button.setAttribute('aria-pressed',String(selected));
    button.disabled=selected || !v?.ready || v.busy;
  }
  const owner=canManageCampaignMaps();
  const context=adventurePlayerPreview?'Spelarvy':v?.map.name||'Karta';
  const scenes=v?.gm&&!v.rows.length?(v.scenes||[]):[];
  const selectScene=scenes.length?'<label>Startpositioner<select data-field="seedScene"><option value="">Välj stridsscen</option>'+
    scenes.map(scene=>'<option value="'+escAttr(scene.id)+'" '+(v.seedScene===scene.id?'selected':'')+'>'+escAttr(scene.name)+'</option>').join('')+'</select></label>':'';
  const fightButton=v?.gm && v.ready && v.session && !v.encounter && !v.pausedEncounter && v.grid ?
    selectScene+'<button class="btn" data-action="start-encounter" '+(v.busy?'disabled':'')+'>'+(v.seedScene&&!v.rows.length?'Flytta scenens figurer hit och starta strid':'Starta strid på kartan')+'</button>':'';
  const content='<div data-map-controls></div>'+fightButton+(v?.gm?'<section class="slcb-module"><button class="btn" type="button" data-objects-toggle aria-expanded="'+Boolean(v.objects?.active)+'">'+(v.objects?.active?'Avsluta objektredigering':'Objekt')+'</button><div data-object-panel></div></section><section class="slcb-module"><h3>Figurer</h3>'+toolPanel(v)+'</section>'+(v.session&&v.hexLoaded?hexPanel(v.hex):''):'');
  const html=owner?slControlBoardHtml({open:boardOpen,panelId:'adventureFigurePanel',toggle:'aleaAdventureFigures.toggle()',context,panel:boardOpen?content:''}):'<div data-map-controls></div>';
  if(board.htmlSignature!==html){
    const hexExpanded=board.querySelector('.hex-settings details')?.open;
    if(board.contains(controls))board.after(controls);
    board.innerHTML=html;board.htmlSignature=html;
    if(hexExpanded)board.querySelector('.hex-settings details')?.setAttribute('open','');
    board.querySelector('[data-map-controls]')?.append(controls);
  }
  const objectHost=board.querySelector('[data-object-panel]');
  if(objectHost&&v?.objects){
    objectHost.hidden=!v.objects.active;
    if(!objectHost.contains(v.objects.panel))objectHost.append(v.objects.panel);
  }
  controls.hidden=owner&&!boardOpen;
  const preview=document.getElementById('adventurePreview');
  preview.classList.toggle('hidden',!owner);
  preview.textContent=adventurePlayerPreview?'Återgå till SL-vy':'Visa spelarvy';
  preview.setAttribute('aria-pressed',String(adventurePlayerPreview));
  const picker=document.getElementById('adventureZoomPreset');
  for(const option of picker.options){
    const missing=option.value==='room'&&!mapSelectedAreaId?'Välj ett rum':option.value==='group'&&!v?.rows.some(r=>r.character_id)?'Placera en rollperson':option.value==='person'&&!v?.rows.some(r=>r.id===v.selected)?'Välj en figur':'';
    option.disabled=!!option.value&&(!v||!!missing);
    option.label=option.textContent+(missing?' · '+missing:'');
  }
}
function toggle() {boardOpen=!boardOpen;if(!boardOpen)view?.objects?.closeLibrary();renderBoard(view);}
function selectPiece(v,id){v.selected=id;renderPieces(v);renderBoard(v);}
function zoomTo(mode){
 const v=view;if(!v||!mode)return;
 if(mode==='all'){resetMapView();return;}
 const grid=v.grid||adventureGrid(v.map,null);
 const selected=v.rows.find(r=>r.id===v.selected),room=campaignMapAreas.find(a=>a.id===mapSelectedAreaId);
 const d=room?.shape_data;
 const roomPoints=room?.shape_type==='rect'?[[d.x,d.y],[d.x+d.width,d.y+d.height]]:d?.points||[];
 const group=v.rows.filter(r=>r.character_id).map(r=>hexCenter(grid,r.q,r.r));
 let points=mode==='room'?roomPoints:mode==='group'?group:selected?[hexCenter(grid,selected.q,selected.r)]:[];
 if(mode==='battle'&&!points.length)points=group.length?group:roomPoints;
 if(mode==='battle'&&!points.length)points=[[-mapView.x/mapView.scale,-mapView.y/mapView.scale]];
 if(!points.length)return;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const pad=mode==='room'?grid.width*.35:grid.width;
 const span=mode==='battle'?grid.width*9:mode==='person'?grid.width*4:0;
 const width=span||Math.max(grid.width*2,x1-x0+2*pad),height=span||Math.max(grid.pitch*2,y1-y0+2*pad);
 const scale=Math.min(6,viewport.clientWidth/width,viewport.clientHeight/height);
 mapView.fitted=false;mapView.scale=scale;mapView.x=-(x0+x1)*scale/2;mapView.y=-(y0+y1)*scale/2;applyMapTransform();
}
document.getElementById('adventureZoomPreset').addEventListener('change',e=>{zoomTo(e.target.value);e.target.value='';});
function close() {
  cancel();
  view?.hexLayer.destroy();view?.objects?.destroy();
  view?.layer.remove(); view=null;
  renderBoard(null); notice();
}
function sync(map) {
  if (!map?.image_url || !centralCampaignId || page.classList.contains('hidden')) { if(view)close();else renderBoard(null); return; }
  const gm=adventureCanManage(), campaign=centralCampaignId;
  if (view?.map.id===map.id && view.gm===gm && view.campaign===campaign) { view.map=map;renderBoard(view);return; }
  close();
  const layer=svg('svg',{class:'adventure-figure-layer',width:'100%',height:'100%'});
  const bounds=svg('svg',{width:map.width,height:map.height,overflow:'hidden'});
  const lights=svg('g'),pieces=svg('g');
  const hexLayer=livingHexLayer(lights,map,gm);
  bounds.append(lights,pieces); layer.append(bounds); viewport.append(layer);
  view={map,campaign,gm,layer,pieces,lights,hexLayer,hex:{prefs:{...defaults},round:0,epoch:0,budgets:{}},session:undefined,rows:[],open:false,ready:false,version:0,category:'character',hidden:true,prepared:new Set()};
  const v=view;
  v.objects=createObjectEditor({map,parent:bounds,before:lights,live:true,manager:gm,areas:()=>campaignMapAreas,
    getScale:()=>Number(v.config?.pixelsPerMeter)||Number(v.map.pixels_per_meter)||0,onEnter:cancel,
    onPick:()=>viewport.scrollIntoView({block:'nearest'})});
  syncCamera();renderBoard(view);
  void refresh();
}
function syncCamera() {
  if (!view) return;
  const {width,height,x,y,scale} = adventureCameraFrame();
  if (!width || !height) return;
  view.layer.setAttribute('viewBox', [-x/scale,-y/scale,width/scale,height/scale].join(' '));
  updatePointer();
}
function setGeometry(map,config) {
  if (view?.map.id!==map.id) return;
  if (view.grid && view.config===config && view.scale===map.pixels_per_meter) return;
  view.config=config; view.scale=map.pixels_per_meter; view.grid=adventureGrid(map,config);
  view.hexLayer.update(view);view.objects.updateScale();renderPieces(view);renderBoard(view);updatePointer();
}
function geometryError(map) {
  if(view?.map.id!==map.id)return;
  cancel();view.grid=null;view.hexLayer.update(view);renderPieces(view);renderBoard(view);
  if(view.gm)notice('Kartans placeringsyta kunde inte läsas.');
}
async function prepare(v,rows) {
  if (!rows.length)return;
  await (v.artReady ??= art().loadMapTokens());
  if(view!==v)return;
  const fresh=rows.filter(row=>{
    const key=sourceField(row)+':'+row[sourceField(row)];
    if(v.prepared.has(key))return false;
    v.prepared.add(key);return true;
  });
  if(fresh.length){
    const activeSources=fresh.map(row=>row.npc_id?campaignNpcs.find(n=>n.id===row.npc_id):
      row.monster_id?campaignMonsters.find(m=>m.id===row.monster_id):null).filter(Boolean);
    if(activeSources.length)await preloadNpcPortraits(activeSources);
    if(view!==v)return;
    await Promise.all(fresh.map(row=>art().prepareAdventureToken(actor(row))));
  }
  if(view===v && fresh.length)renderPieces(v);
}
async function readRows(v) {
  const version=++v.version;
  if(!v.session)return;
  try {
    const [hex,rows]=await Promise.all([hexRead(v),v.gm?dbJson(table+'?'+scope(v)+'&select='+columns+'&order=r,q'):dbJson('rpc/read_adventure_player_figures',{method:'POST',body:JSON.stringify({p_map_id:v.map.id,p_session_id:v.session})})]);
    if(view!==v||v.version!==version)return;
    if(v.gm && !rows.length && !v.scenes){
      v.scenes=await dbJson('campaign_combat_scenes?campaign_id=eq.'+v.campaign+'&select=id,name&order=name');
    }
    const encounter=await currentEncounter(v);
    // Older map visits may already have a scoped encounter and saved tactical
    // round. Keep their pause/resume path. New map fights enter via the Board.
    const turn=!encounter && rows.length ? await readPanelTurn(v,rows).catch(()=>({unavailable:true})) : null;
    if(view!==v||v.version!==version)return;
    v.panelTurn=turn;
    v.pausedEncounter=encounter?.status==='paused'?encounter.id:null;
    v.encounter=v.pausedEncounter?null:encounter?.id;
    const previous=v.rows;
    v.rows=rows;setHex(v,hex);v.ready=true;
    v.layer.toggleAttribute('data-gm',v.gm);
    renderPieces(v);renderBoard(v);
    if(!v.gm)for(const row of rows){
      const before=previous.find(r=>r.id===row.id),trail=hex?.trails?.[row.id];
      if(before&&trail?.length>1&&before.q===trail[0][0]&&before.r===trail[0][1]&&(before.q!==row.q||before.r!==row.r))
        animateMove(v,before,trail.slice(1).map(([q,r])=>({q,r})));
    }
    await prepare(v,v.gm?[...rows,...sources('character')]:rows);
  } catch(error) {
    if(view!==v||v.version!==version)return;
    cancel();v.ready=false;v.rows=[];v.layer.removeAttribute('data-gm');renderPieces(v);renderBoard(v);
    notice('Figurerna kunde inte läsas. '+error.message);
  }
}
function sessionChanged(campaign,id) {
  const v=view;
  if (!v||v.campaign!==campaign||v.session===id)return;
  cancel();notice();v.hexLoaded=false;v.session=id;setHex(v,null);v.pending=null;v.busy=false;v.ready=false;v.rows=[];v.layer.removeAttribute('data-gm');
  renderPieces(v);renderBoard(v);v.reading=readRows(v);
}
async function refresh() {
  const v=view;if(!v)return;
  const previous=v.session;
  try {
    const session=await window.aleaReadAdventureSession();
    if(view!==v)return;
    sessionChanged(v.campaign,session?.status==='active'?session.id:null);
    if(previous===v.session && !v.busy) await readRows(v);
    else await v.reading;
  } catch(error) {
    if(view===v){sessionChanged(v.campaign,null);notice('Spelmötet kunde inte läsas. '+error.message);}
  }
}
function stopPress() {
  clearTimeout(press?.timer);
  if(press?.loading)notice();
  press=null;
}
function cancel() {
  stopPress();drag?.v.hexLayer.clear();ghost?.remove();ghost=null;drag=null;
  if(status.querySelector('[data-cancel]'))notice();
}
function hexRead(v){
  return dbJson('rpc/read_adventure_hex',{method:'POST',body:JSON.stringify({p_map:v.map.id,p_session:v.session,p_manager:v.gm})});
}
function setHex(v,state){
  v.hexLoaded=Boolean(state&&Number.isInteger(state.epoch));
  v.hex={round:0,epoch:0,budgets:{},...state,prefs:{...defaults,...state?.prefs}};
  v.hexLayer.update(v);
}
function hexCommand(v,action,values={}){
  return dbJson('rpc/command_adventure_hex',{method:'POST',body:JSON.stringify({p_map:v.map.id,p_session:v.session,p_epoch:v.hex.epoch,p_action:action,p_values:values})});
}
async function command(v,action,values){
  if(!ready(v)||!v.hexLoaded)return;
  const session=v.session;
  cancel();v.busy=true;renderBoard(v);
  try{
    const state=await hexCommand(v,action,values);
    if(view!==v||v.session!==session)return;
    if(action==='end'){
      boardOpen=false;renderBoard(v);viewport.scrollIntoView({block:'nearest',behavior:'instant'});
    }
    setHex(v,state);
  }
  catch(e){if(view===v)notice(e.message);}
  finally{if(view===v&&v.session===session){v.busy=false;await readRows(v);}}
}
function animateMove(v,row,path){
  v.hexLayer.travel(row,path,v.pieces.querySelector('[data-figure-id="'+CSS.escape(row.id)+'"]'));
}
function ready(v) {return v && v.gm && v.ready && v.grid && v.session && !v.busy && !page.classList.contains('hidden');}
function existing(v,row) {return row.id ? row : row.character_id ? v.rows.find(r=>r.character_id===row.character_id) : null;}
function begin(v,row,mode,point,pointerId) {
  if(v.objects?.active){v.objects.editing(false);renderBoard(v);}
  if(!ready(v)||!row||!v.hexLoaded)return false;
  cancel();
  const placed=existing(v,row);
  const drawing=tokenArt(placed||row,100,'lift');
  if(!drawing){notice('Figurbilden är inte tillgänglig ännu.');return false;}
  drag={v,row:placed||row,mode,point,pointerId,cell:null};
  ghost=svg('svg',{class:'adventure-figure-ghost',viewBox:'-100 -145 200 200','aria-hidden':'true'});
  ghost.innerHTML=drawing;ghost.style.display='none';document.body.append(ghost);
  if(mode==='armed') {
    notice(row.name+' · Tryck på en ledig hex.');
    const button=document.createElement('button');button.type='button';button.className='smallbtn';button.dataset.cancel='';button.textContent='Avbryt';button.onclick=cancel;status.append(button);
  }
  updatePointer();return true;
}
function updatePointer() {
  if(!drag?.point||!ghost)return;
  const {v,point,row}=drag;
  if(!ready(v)){cancel();return;}
  const over=viewport.contains(document.elementFromPoint(point.clientX,point.clientY));
  const at=over?mapPointer(point,v.layer):null;
  const width=over?v.grid.width*mapScreenScale(v.layer).scaleX:54;
  ghost.style.display=over||drag.mode==='held'?'block':'none';
  ghost.style.width=width*2+'px';ghost.style.height=width*2+'px';
  ghost.style.transform='translate3d('+(point.clientX-width)+'px,'+(point.clientY-width*1.45-4)+'px,0)';
  const axial=nearestHex(v.grid,at),key=axial?axial.q+','+axial.r:null;
  if(key===drag.targetKey)return;
  drag.targetKey=key;drag.cell=null;drag.route=null;drag.search=null;
  v.hexLayer.clear();if(!axial)return;
  const token=drag,cell=adventureCell(v.map,v.grid,at,v.rows,row.id);
  const [x,y]=hexCenter(v.grid,axial.q,axial.r);
  token.rejected={x,y};
  const invalid=()=>v.hexLayer.route([{...axial,x,y}],false);
  if(!cell||v.objects.blocks([cell.x,cell.y])){invalid();return;}
  if(!row.id){drag.cell=cell;drag.route=[cell];v.hexLayer.route([cell]);return;}
  const budget=v.hex.budgets[row.id];
  const limit=v.hex.round?Math.max(0,(budget?.max??0)-(budget?.spent??0)):Infinity;
  const occupied=new Set(v.rows.filter(other=>other.id!==row.id).map(other=>other.q+','+other.r));
  const search=adventureRoute(v.map,v.grid,row,cell,occupied,v.objects.blocks,limit,combatHexNeighbors,combatAxialDistance);
  function advance(){
    if(drag!==token||token.targetKey!==key)return;
    const end=performance.now()+5;
    do{
      const next=search.next();
      if(next.done){
        token.search=null;
        if(next.value?.length){token.cell=cell;token.route=next.value;v.hexLayer.route(next.value,true,v.hex.round?budget:null);}
        else invalid();
        if(token.released)persist();
        return;
      }
    }while(performance.now()<end);
    token.search=requestAnimationFrame(advance);
  }
  advance();
}
async function change(v,request,optimistic,journey) {
  if(!ready(v))return;
  const session=v.session;
  v.busy=true;v.version++;
  if(optimistic){v.pending=optimistic;renderPieces(v,journey?null:optimistic.id);if(journey)animateMove(v,journey.row,journey.path);}
  try {
    const result=await request();
    if(!result?.length)throw Error('Figurens läge har ändrats.');
    if(view===v&&v.session===session){
      // Keep the landed piece in place while the authoritative list reloads.
      if(optimistic){
        const saved={...optimistic,id:result[0].id};
        v.rows=[...v.rows.filter(r=>r.id!==saved.id && !(saved.character_id && r.character_id===saved.character_id)),saved];
      }
      notice();
    }
  } catch(error) {
    if(journey)v.hexLayer.stop(journey.row.id);
    if(view===v&&v.session===session)notice(/duplicate key/.test(error.message)?'Hexagonen är upptagen.':'Kunde inte spara. '+error.message);
  } finally {
    if(view===v&&v.session===session){v.pending=null;v.busy=false;renderPieces(v);await readRows(v);}
  }
}
function persist() {
  const {v,row,cell,route}=drag;
  if(!cell)v.hexLayer.reject(drag.rejected);
  cancel();if(!cell||!ready(v)||v.objects.blocks([cell.x,cell.y]))return;
  const position={q:cell.q,r:cell.r},headers={Prefer:'return=representation'};
  const record={player_visible:true,...row,...position,id:row.id||crypto.randomUUID()};
  if(row.id)void change(v,()=>hexCommand(v,'move',{id:row.id,from:[row.q,row.r],path:route.map(c=>[c.q,c.r])}),record,{row,path:route});
  else {
    const body={...row,...position,campaign_id:v.campaign,session_id:v.session,map_id:v.map.id};
    // Omit id and visibility on hero upsert. A second GM dragging the
    // same hero preserves its existing identity and visibility.
    if(row.character_id){delete body.player_visible;headers.Prefer+=',resolution=merge-duplicates';}
    else body.id=record.id;
    const url=table+'?select=id'+(row.character_id?'&on_conflict=session_id,character_id':'');
    void change(v,()=>dbJson(url,{method:'POST',headers,body:JSON.stringify(body)}),record);
  }
}
async function arm(row) {
  const v=view;if(!ready(v)||!row)return;
  const session=v.session;
  try {await prepare(v,[row]);} catch {if(view===v)notice('Figurbilden kunde inte laddas.');return;}
  if(view!==v||v.session!==session||!begin(v,row,'armed',null,null))return;
  boardOpen=false;renderBoard(v);
  viewport.scrollIntoView({block:'nearest',behavior:'instant'});
}
async function changeEncounterPause(v,id,paused){
  if(view!==v || v.busy || !v.gm || (paused?v.encounter:v.pausedEncounter)!==id)return;
  v.busy=true;renderBoard(v);
  try {
    await dbJson('rpc/set_adventure_encounter_paused',{method:'POST',body:JSON.stringify({p_encounter:id,p_paused:paused})});
  } catch(error){window.alert(error.message);}
  finally{if(view===v){v.busy=false;await readRows(v);}}
}
function chooseExploration(v){
  if(page.querySelector('[data-encounter-choice]'))return;
  const id=v.encounter;
  const dialog=document.createElement('dialog');
  dialog.dataset.encounterChoice='';
  dialog.setAttribute('aria-labelledby','encounterChoiceTitle');
  dialog.innerHTML='<form method="dialog"><h2 id="encounterChoiceTitle">Vad vill du göra med den pågående striden?</h2>'+
    '<button class="btn primary" value="pause" autofocus>Pausa och utforska</button> '+
    '<button class="btn" value="stay">Stanna kvar i strid</button> '+
    '<button class="btn" value="finish">Avsluta strid</button></form>';
  page.append(dialog);
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(view!==v || v.encounter!==id)return;
    if(dialog.returnValue==='pause')void changeEncounterPause(v,id,true);
    if(dialog.returnValue==='finish')page.querySelector('.adventure-encounter-frame')?.contentWindow?.aleaReturnToExploration?.();
  },{once:true});
  dialog.showModal();
}
modeSwitch.addEventListener('click',event=>{
  const mode=event.target.closest('button')?.dataset.mode;
  if(!mode || !ready(view))return;
  if(view.encounter){
    if(mode==='exploration')chooseExploration(view);
    return;
  }
  if(view.pausedEncounter){
    if(mode==='battle')void changeEncounterPause(view,view.pausedEncounter,false);
    return;
  }
  if(!view.hexLoaded)return;
  if(mode==='battle' && !view.hex.round){
    if(view.panelTurn?.participants?.length)void command(view,'begin',{});
    else{
      boardOpen=true;renderBoard(view);
      const control=board.querySelector('[data-field=seedScene], [data-action=start-encounter]');
      control?.scrollIntoView({block:'center'});control?.focus({preventScroll:true});
    }
  }
  if(mode==='exploration' && view.hex.round)void command(view,'pause',{});
});
board.addEventListener('change',e=>{
  const v=view,field=e.target.dataset.field,key=e.target.dataset.hexSetting;
  if(v?.gm&&e.target.dataset.disposition){void command(v,'disposition',{id:e.target.dataset.disposition,tone:e.target.value});return;}
  if(v?.gm&&key){const el=e.target;void command(v,'setting',{key,value:el.type==='checkbox'?el.checked:el.type==='range'?el.valueAsNumber:el.value});return;}
  if(!v?.gm||!field)return;
  v[field]=field==='hidden'?e.target.checked:e.target.value;
  renderBoard(v);
});
board.addEventListener('click',async e=>{
  if(e.target.closest('[data-objects-toggle]')&&view?.gm){
    view.objects.editing(!view.objects.active);renderBoard(view);return;
  }
  const action=e.target.closest('[data-action]')?.dataset.action,v=view;
  const mode=e.target.closest('[data-hex-command]')?.dataset.hexCommand;
  if(mode&&v?.gm){void command(v,mode,{});return;}
  if(!action||!v?.gm)return;
  if(action==='session'){window.openGameSessionPanel();return;}
  if(!ready(v))return;
  if(action==='start-encounter'){
    v.busy=true;renderBoard(v);
    try {await startEncounter(v);}
    catch(error){if(view===v)notice(error.message);}
    finally {if(view===v){v.busy=false;await readRows(v);}}
    return;
  }
  if(action==='place'){
    const row=sources(v.category).find(r=>r[sourceField(r)]===v.choice);
    if(row)void arm({...row,player_visible:v.category==='character'||!v.hidden});
    return;
  }
  const row=v.rows.find(r=>r.id===e.target.closest('[data-instance]')?.dataset.instance);
  if(!row)return;
  if(action==='move'){selectPiece(v,row.id);void arm(row);return;}
  const url=table+'?'+scope(v)+'&id=eq.'+row.id+'&select=id',headers={Prefer:'return=representation'};
  void change(v,()=>dbJson(url,action==='remove'?{method:'DELETE',headers}:{method:'PATCH',headers,body:JSON.stringify({player_visible:!row.player_visible})}));
});
async function lift(p) {
  if(press!==p||p.loading)return;
  const field=sourceField(p.row);
  if(!p.v.prepared.has(field+':'+p.row[field])||!tokenArt(p.row,100,'lift')){
    p.loading=true;
    notice('Laddar '+p.row.name+'…');
    try {await prepare(p.v,[p.row]);}
    catch {if(press===p)notice('Figurbilden kunde inte laddas.');return;}
    if(press!==p)return;
    notice();
  }
  const ok=begin(p.v,p.row,'held',p.point,p.id);
  if(ok){swallowClick=true;document.documentElement.setPointerCapture?.(p.id);}
}
document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(!e.isPrimary){if(drag||press){cancel();swallowClick=true;e.preventDefault();e.stopPropagation();}return;}
  swallowClick=false;
  const v=view;
  if(!v?.ready || (v.objects?.active&&viewport.contains(e.target)))return;
  const point={clientX:e.clientX,clientY:e.clientY};
  if(!v.gm){
    const piece=e.target.closest('[data-figure-id]');
    if(piece&&v.layer.contains(piece)){e.preventDefault();e.stopPropagation();swallowClick=true;selectPiece(v,piece.dataset.figureId);}
    return;
  }
  if(!ready(v))return;
  if(drag?.mode==='armed'&&viewport.contains(e.target)){
    e.stopPropagation();e.preventDefault();drag.point=point;drag.pointerId=e.pointerId;drag.start=point;
    document.documentElement.setPointerCapture?.(e.pointerId);updatePointer();
    drag.pressedKey=drag.targetKey;
    return;
  }
  const portrait=e.target.closest('.arcane-character-rail [data-character]');
  let token=e.target.closest('[data-figure-id]');
  if(!token&&e.pointerType==='touch'&&viewport.contains(e.target)){
    let nearest=22;
    for(const piece of v.pieces.children){
      const r=piece.getBoundingClientRect(),distance=Math.hypot(e.clientX-(r.left+r.width/2),e.clientY-(r.top+r.height/2));
      if(distance<nearest){token=piece;nearest=distance;}
    }
  }
  const row=portrait?sources('character').find(r=>r.character_id===portrait.dataset.character):
    token&&v.layer.contains(token)?v.rows.find(r=>r.id===token.dataset.figureId):null;
  if(!row)return;
  cancel();e.stopPropagation(); // Ordinary short portrait clicks still open the character sheet.
  if(token){e.preventDefault();swallowClick=true;closeMapStatusMenu();selectPiece(v,row.id);}
  const p=press={v,row,token,id:e.pointerId,point,start:point};
  p.timer=setTimeout(()=>lift(p),170);
},true);
document.addEventListener('dragstart',e=>{if(press||drag)e.preventDefault();},true);
document.addEventListener('pointermove',e=>{
  const point={clientX:e.clientX,clientY:e.clientY};
  if(press?.id===e.pointerId){
    press.point=point;
    if(Math.hypot(point.clientX-press.start.clientX,point.clientY-press.start.clientY)>4)lift(press);
  }
  if(!drag||drag.released||(drag.pointerId!=null&&drag.pointerId!==e.pointerId))return;
  if(drag.start&&Math.hypot(point.clientX-drag.start.clientX,point.clientY-drag.start.clientY)>10){cancel();return;}
  drag.point=point;updatePointer();
},true);
document.addEventListener('pointerup',e=>{
  if(press?.id===e.pointerId){
    if(press.token){e.stopPropagation();e.preventDefault();swallowClick=true;notice(press.row.name+' vald');}
    stopPress();
  }
  if(!drag||e.pointerId!==drag.pointerId)return;
  e.stopPropagation();e.preventDefault();swallowClick=true;
  drag.point={clientX:e.clientX,clientY:e.clientY};updatePointer();
  if(!drag)return;
  if(drag.mode==='armed'&&(!drag.pressedKey||drag.targetKey!==drag.pressedKey)){cancel();return;}
  if(drag.search){drag.released=true;drag.pointerId=null;return;}
  persist();
},true);
document.addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointercancel',cancel,true);
document.addEventListener('lostpointercapture',e=>{if(drag?.pointerId===e.pointerId && e.target===document.documentElement)cancel();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
window.addEventListener('blur',cancel);
window.addEventListener('scroll',updatePointer,true);
window.addEventListener('resize',updatePointer);
new MutationObserver(()=>{if(page.classList.contains('hidden')){adventureRequestedMap=null;close();}}).observe(page,{attributes:true,attributeFilter:['class']});
function mountRoomObjects(panel,area){
  if(!view?.gm||!adventureCanManage()||view.map.id!==activeCampaignMap?.id)return;
  const host=document.createElement('section');host.className='map-location-section living-room-objects';
  panel.append(host);view.objects.room(host,area);
}
window.aleaAdventureFigures=Object.freeze({sync,syncCamera,refresh,sessionChanged,setGeometry,geometryError,close,toggle,mountRoomObjects});
if(typeof activeCampaignMap!=='undefined' && !page.classList.contains('hidden'))renderMapPanel();

const header=document.querySelector('.alea-app-header');
if(header)new ResizeObserver(()=>page.style.setProperty('--adventure-header',header.offsetHeight+'px')).observe(header);

new ResizeObserver(()=>{if(view&&mapView.fitted)resetMapView();else syncCamera();}).observe(viewport);

document.getElementById('sharedMapList').addEventListener('click',event=>{
  const id=event.target.closest('[data-shared-map]')?.dataset.sharedMap;
  if(id&&campaignMaps.some(m=>m.id===id&&m.player_visible))void selectAdventureMap(id);
});
