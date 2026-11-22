import './adventure-figures.css';
import { adventureCell, adventureGrid, hexCenter } from './adventure-hex.js';
import { mapPointer, mapScreenScale } from './polygon-edit-geometry.js';

const table = 'adventure_map_figures';
const columns = 'id,character_id,npc_character_id,npc_id,monster_id,name,race,gender,q,r,player_visible';
const sourceFields = ['character_id','npc_character_id','npc_id','monster_id'];
const ns = 'http://www.w3.org/2000/svg';
const board = document.getElementById('adventureSlBoard');
const status = document.getElementById('adventureFigureStatus');
const viewport = document.getElementById('mapViewport');
const page = document.getElementById('mapPage');
const art = () => window.aleaCombatPaperDollMap;
let view, drag, press, ghost, highlight, swallowClick = false;

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
  return { id: prefix+'-'+(row.id || row[field]), source_id:row[field], name_snapshot:row.name,
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
  v.pieces.replaceChildren();
  if (!v.grid) return;
  // A figure farther down the map stands in front of its northern neighbour.
  for (const row of rows.slice().sort((a,b)=>a.r-b.r || a.q-b.q)) {
    const [x,y] = hexCenter(v.grid,row.q,row.r), w = v.grid.width;
    const piece = svg('g',{'data-figure-id':row.id,transform:'translate('+x+' '+y+')'});
    const title=svg('title'); title.textContent=row.name+(row.player_visible?'':' · dold för spelarna');
    piece.append(title);
    const face = svg('g'), drawing = tokenArt(row,w);
    if (drawing) face.innerHTML = drawing;
    else { const label=svg('text',{'text-anchor':'middle',fill:'ivory','font-size':w*.2}); label.textContent=row.name; face.append(label); }
    piece.append(svg('ellipse',{cx:0,cy:-.17*w,rx:w*.48,ry:w*.59,fill:'transparent'}),face);
    if (!row.player_visible) {
      piece.dataset.concealed = '';
      piece.append(svg('circle',{class:'figure-secret',cx:w*.37,cy:w*.17,r:w*.065}));
    }
    v.pieces.append(piece);
    if (row.id===landingId && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      face.animate([{transform:'translateY(-8px) scale(1.08)'},{transform:'translateY(0) scale(.98)',offset:.75},{transform:'scale(1)'}],{duration:185,easing:'ease-out'});
  }
}
function toolPanel(v) {
  if (!v.session) return '<p>Starta eller återuppta ett spelmöte för att placera figurer.</p><button class="btn" type="button" data-action="session">Öppna Spelmöte</button>';
  const choices=sources(v.category);
  if (!choices.some(r=>r[sourceField(r)]===v.choice)) v.choice=choices[0]?.[sourceField(choices[0])];
  const select=(value,label,selected)=>'<option value="'+escAttr(value)+'"'+(selected?' selected':'')+'>'+escAttr(label)+'</option>';
  const list=v.rows.map(r=>'<div class="slcb-visibility-row" data-instance="'+escAttr(r.id)+'"><span><b>'+escAttr(r.name)+'</b><small>Hex '+r.q+', '+r.r+' · '+(r.player_visible?'Synlig':'Dold')+'</small></span><div>'+
    '<button type="button" class="btn" data-action="move">Flytta</button> <button type="button" class="btn" data-action="visibility">'+(r.player_visible?'Dölj':'Visa')+'</button> <button type="button" class="btn" data-action="remove">Ta bort från kartan</button></div></div>').join('');
  return '<div class="figure-picker"><label>Typ<select data-field="category">'+[['character','Rollpersoner'],['npc','SLP'],['monster','Fiender']].map(([key,label])=>select(key,label,v.category===key)).join('')+'</select></label>'+
    '<label>Figur<select data-field="choice">'+choices.map(r=>select(r[sourceField(r)],r.name,r[sourceField(r)]===v.choice)).join('')+'</select></label>'+
    (v.category==='character'?'':'<label><input type="checkbox" data-field="hidden"'+(v.hidden?' checked':'')+'> Dold för spelarna</label>')+
    '<button type="button" class="btn" data-action="place"'+(!choices.length||!v.ready||!v.grid?' disabled':'')+'>Placera på kartan</button></div>'+
    (list?'<h4>På kartan</h4><div class="slcb-visibility-list">'+list+'</div>':'');
}
function renderBoard(v) {
  const html=v.gm ? slControlBoardHtml({open:v.open,panelId:'adventureFigurePanel',toggle:'aleaAdventureFigures.toggle()',
    context:'Figurer · '+v.map.name,panel:v.open?'<section class="slcb-module"><h3>Figurer</h3>'+toolPanel(v)+'</section>':''}) : '';
  if (html!==v.boardHtml) { board.innerHTML=html; v.boardHtml=html; }
}
function toggle() { if(view?.gm){ view.open=!view.open; renderBoard(view); } }
function close() {
  cancel();
  view?.layer.remove(); view=null;
  board.replaceChildren(); notice();
}
function sync(map) {
  if (!map?.image_url || !centralCampaignId || page.classList.contains('hidden')) { if(view)close(); return; }
  const gm=canManageCampaignMaps(), campaign=centralCampaignId;
  if (view?.map.id===map.id && view.gm===gm && view.campaign===campaign) { view.map=map;renderBoard(view);return; }
  close();
  const layer=svg('svg',{class:'adventure-figure-layer',viewBox:'0 0 '+map.width+' '+map.height,width:map.width,height:map.height});
  const lights=svg('g'),pieces=svg('g');
  layer.append(lights,pieces); document.getElementById('mapCanvas').append(layer);
  view={map,campaign,gm,layer,pieces,lights,session:undefined,rows:[],open:false,ready:false,version:0,category:'character',hidden:true,prepared:new Set()};
  renderBoard(view);
  void refresh();
}
function setGeometry(map,config) {
  if (view?.map.id!==map.id) return;
  if (view.grid && view.config===config && view.scale===map.pixels_per_meter) return;
  view.config=config; view.scale=map.pixels_per_meter; view.grid=adventureGrid(map,config);
  renderPieces(view);renderBoard(view);updatePointer();
}
function geometryError(map) {
  if(view?.map.id!==map.id)return;
  cancel();view.grid=null;renderPieces(view);renderBoard(view);
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
  if(fresh.length)await Promise.all(fresh.map(row=>art().prepareAdventureToken(actor(row))));
  if(view===v && fresh.length)renderPieces(v);
}
async function readRows(v) {
  const version=++v.version;
  if(!v.session)return;
  try {
    const rows=await dbJson(table+'?'+scope(v)+'&select='+columns+'&order=r,q');
    if(view!==v||v.version!==version)return;
    v.rows=rows; v.ready=true;
    v.layer.toggleAttribute('data-gm',v.gm);
    renderPieces(v);renderBoard(v);
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
  cancel();notice();v.session=id;v.pending=null;v.busy=false;v.ready=false;v.rows=[];v.layer.removeAttribute('data-gm');
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
function stopPress() { clearTimeout(press?.timer);press=null; }
function clearLight() {
  if(!highlight)return;
  const el=highlight; highlight=null;el.dataset.fading='';setTimeout(()=>el.remove(),140);
}
function cancel() {
  stopPress(); clearLight(); ghost?.remove();ghost=null;drag=null;
  if(status.querySelector('[data-cancel]'))notice();
}
function ready(v) {return v && v.gm && v.ready && v.grid && v.session && !v.busy && !page.classList.contains('hidden');}
function existing(v,row) {return row.id ? row : row.character_id ? v.rows.find(r=>r.character_id===row.character_id) : null;}
function begin(v,row,mode,point,pointerId) {
  if(!ready(v)||!row)return false;
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
  const cell=over?adventureCell(v.map,v.grid,mapPointer(point,v.layer),v.rows,row.id):null;
  const width=over?v.grid.width*mapScreenScale(v.layer).scaleX:54;
  ghost.style.display=over||drag.mode==='held'?'block':'none';
  ghost.style.width=width*2+'px';ghost.style.height=width*2+'px';
  ghost.style.transform='translate3d('+(point.clientX-width)+'px,'+(point.clientY-width*1.45-4)+'px,0)';
  if(cell?.q===drag.cell?.q && cell?.r===drag.cell?.r)return;
  clearLight();drag.cell=cell;
  if(cell){highlight=svg('polygon',{class:'adventure-hex-light',points:combatHexPoints(cell.x,cell.y,v.grid.size*.97),'data-cell':cell.q+','+cell.r});v.lights.append(highlight);}
}
async function change(v,request,optimistic) {
  if(!ready(v))return;
  const session=v.session;
  v.busy=true;v.version++;
  if(optimistic){v.pending=optimistic;renderPieces(v,optimistic.id);}
  try {
    const result=await request();
    if(!result?.length)throw Error('Figurens läge har ändrats.');
    if(view===v&&v.session===session)notice();
  } catch(error) {
    if(view===v&&v.session===session)notice(/duplicate key/.test(error.message)?'Hexagonen är upptagen.':'Kunde inte spara. '+error.message);
  } finally {
    if(view===v&&v.session===session){v.pending=null;v.busy=false;renderPieces(v);await readRows(v);}
  }
}
function persist() {
  const {v,row,cell}=drag;
  cancel();if(!cell||!ready(v))return;
  const position={q:cell.q,r:cell.r},headers={Prefer:'return=representation'};
  const query=table+'?'+scope(v)+'&id=eq.'+row.id+'&select=id';
  const record={...row,...position,id:row.id||crypto.randomUUID()};
  if(row.id)void change(v,()=>dbJson(query,{method:'PATCH',headers,body:JSON.stringify(position)}),record);
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
  v.open=false;renderBoard(v);viewport.scrollIntoView({block:'nearest'});
}
board.addEventListener('change',e=>{
  const v=view,field=e.target.dataset.field;
  if(!v?.gm||!field)return;
  v[field]=field==='hidden'?e.target.checked:e.target.value;
  renderBoard(v);
});
board.addEventListener('click',e=>{
  const action=e.target.closest('[data-action]')?.dataset.action,v=view;
  if(!action||!v?.gm)return;
  if(action==='session'){window.openGameSessionPanel();return;}
  if(!ready(v))return;
  if(action==='place'){
    const row=sources(v.category).find(r=>r[sourceField(r)]===v.choice);
    if(row)void arm({...row,player_visible:v.category==='character'||!v.hidden});
    return;
  }
  const row=v.rows.find(r=>r.id===e.target.closest('[data-instance]')?.dataset.instance);
  if(!row)return;
  if(action==='move'){void arm(row);return;}
  const url=table+'?'+scope(v)+'&id=eq.'+row.id+'&select=id',headers={Prefer:'return=representation'};
  void change(v,()=>dbJson(url,action==='remove'?{method:'DELETE',headers}:{method:'PATCH',headers,body:JSON.stringify({player_visible:!row.player_visible})}));
});
function lift(p) {
  if(press!==p)return;
  const ok=begin(p.v,p.row,'held',p.point,p.id);
  if(ok){swallowClick=true;document.documentElement.setPointerCapture?.(p.id);}
}
document.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(!e.isPrimary){if(drag||press)cancel();return;}
  swallowClick=false;
  const v=view;
  if(!ready(v))return;
  const point={clientX:e.clientX,clientY:e.clientY};
  if(drag?.mode==='armed'&&viewport.contains(e.target)){
    e.stopPropagation();e.preventDefault();drag.point=point;drag.pointerId=e.pointerId;drag.start=point;
    document.documentElement.setPointerCapture?.(e.pointerId);updatePointer();return;
  }
  const portrait=e.target.closest('.arcane-character-rail [data-character]');
  const token=e.target.closest('[data-figure-id]');
  const row=portrait?sources('character').find(r=>r.character_id===portrait.dataset.character):
    token&&v.layer.contains(token)?v.rows.find(r=>r.id===token.dataset.figureId):null;
  if(!row)return;
  cancel();e.stopPropagation(); // Ordinary short portrait clicks still open the character sheet.
  const p=press={v,row,id:e.pointerId,point,start:point};
  p.timer=setTimeout(()=>lift(p),170);
},true);
document.addEventListener('dragstart',e=>{if(press||drag)e.preventDefault();},true);
document.addEventListener('pointermove',e=>{
  const point={clientX:e.clientX,clientY:e.clientY};
  if(press?.id===e.pointerId){
    press.point=point;
    if(Math.hypot(point.clientX-press.start.clientX,point.clientY-press.start.clientY)>4)lift(press);
  }
  if(!drag||(drag.pointerId!=null&&drag.pointerId!==e.pointerId))return;
  if(drag.start&&Math.hypot(point.clientX-drag.start.clientX,point.clientY-drag.start.clientY)>10){cancel();return;}
  drag.point=point;updatePointer();
},true);
document.addEventListener('pointerup',e=>{
  if(press?.id===e.pointerId)stopPress();
  if(!drag||e.pointerId!==drag.pointerId)return;
  e.stopPropagation();e.preventDefault();swallowClick=true;
  drag.point={clientX:e.clientX,clientY:e.clientY};updatePointer();if(drag)persist();
},true);
document.addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointercancel',cancel,true);
document.addEventListener('lostpointercapture',e=>{if(drag?.pointerId===e.pointerId && e.target===document.documentElement)cancel();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
window.addEventListener('blur',cancel);
window.addEventListener('scroll',updatePointer,true);
window.addEventListener('resize',updatePointer);
new MutationObserver(updatePointer).observe(document.getElementById('mapCanvas'),{attributes:true,attributeFilter:['style']});
new MutationObserver(()=>{if(page.classList.contains('hidden'))close();}).observe(page,{attributes:true,attributeFilter:['class']});
window.aleaAdventureFigures=Object.freeze({sync,refresh,sessionChanged,setGeometry,geometryError,close,toggle});
if(typeof activeCampaignMap!=='undefined' && !page.classList.contains('hidden'))renderMapPanel();
