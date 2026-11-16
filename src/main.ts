import {Application, Container, Sprite, Graphics, Texture} from 'pixi.js';
import {effects} from './water';
import './style.css';
type Point={x:number;y:number};
type Region={id:number;points:Point[];effect:'water';speed:number;strength:number;direction:number;enabled:boolean};
type Scene={format:'arcane-workshop';version:1;image:{name:string;data:string};regions:Region[];view:{x:number;y:number;zoom:number};running:boolean};
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
$('app').innerHTML=`<header><div><small>ALEA CRUSADERS · EXPERIMENTELL SANDBOX</small><h1>✦ ARCANE <span>PIXIJS WORKSHOP</span></h1></div><b>V0.1</b></header>
<main><aside><section><h2>01 <span>Kartbild</span></h2><label class="file">Öppna kartbild<input id="upload" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="demo">Testkarta</button><p id="mapname">Testkarta</p></section>
<section><h2>02 <span>Markera ett område</span></h2><div class="buttons"><button id="pan" class="active">Panorera</button><button id="draw">Ny polygon</button><button id="edit">Redigera punkter</button><button id="finish">Slutför polygon</button><button id="undo">Ångra punkt</button></div><p class="hint">Rita längs vattnet och slutför. Redigera genom att dra punkterna. Två fingrar zoomar och flyttar kartan.</p><label for="regions">Områden</label><select id="regions"><option value="">Inga områden</option></select><button id="delete">Radera valt område</button></section>
<section><h2>03 <span>Effektbibliotek</span></h2><label for="effect">Effekt</label><select id="effect"><option>Flowing Water</option></select><label class="check"><input id="enabled" type="checkbox" checked> Effekt aktiv i valt område</label>
<label for="speed">Hastighet <output id="speedVal">1</output></label><input id="speed" type="range" min="0" max="4" step="0.1" value="1">
<label for="strength">Styrka <output id="strengthVal">8</output></label><input id="strength" type="range" min="0" max="24" step="1" value="8">
<label for="direction">Riktning <output id="directionVal">90°</output></label><input id="direction" type="range" min="0" max="360" step="5" value="90"><p class="hint">0° → · 90° ↓ · 180° ← · 270° ↑</p>
<button id="toggle">Pausa animation</button><label class="check"><input id="contours" type="checkbox" checked> Visa konturer</label></section>
<section><h2>04 <span>Scen</span></h2><button id="save">Spara scen</button><label class="file">Öppna scen<input id="load" type="file" accept=".json,application/json"></label><p class="hint">Kartbild, områden, effekter och vy följer med i en portabel JSON-fil. Bilder behandlas lokalt i din webbläsare.</p></section></aside>
<div class="workspace"><div class="toolbar"><span id="status" role="status">Startar PixiJS…</span><div><button id="minus" aria-label="Zooma ut">−</button><button id="plus" aria-label="Zooma in">+</button><button id="reset">Återställ vy</button></div></div><div id="stage"></div><div class="footer"><span id="engine">WebGL · PixiJS 8</span><span id="view">100%</span></div><p id="error" role="alert"></p></div></main>`;
const stage=$('stage'), app=new Application();
await app.init({resizeTo:stage,background:'#10191e',antialias:true,preference:'webgl',resolution:Math.min(devicePixelRatio,2),autoDensity:true});
stage.appendChild(app.canvas);
const world=new Container(), layers=new Container(), outlines=new Graphics();app.stage.addChild(world);world.addChild(layers,outlines);
let base:Sprite|undefined,image={name:'',data:''},regions:Region[]=[],selected=0,draft:Point[]=[],mode:'pan'|'draw'|'edit'='pan',running=true,clock=0;
let rendered:{region:Region;filter:ReturnType<typeof effects.water.create>}[]=[];
function report(s:string){$('status').textContent=s;}
function fail(e:unknown){$('error').textContent=String(e);console.error(e);}
function current(){return regions.find(r=>r.id===selected);}
function local(p:Point){const q=world.toLocal(p);return{x:q.x,y:q.y};}
function clampPoint(p:Point){return{x:Math.max(0,Math.min(base!.width,p.x)),y:Math.max(0,Math.min(base!.height,p.y))};}
function drawOutlines(){outlines.clear();if(!$<HTMLInputElement>('contours').checked&&mode!=='draw'&&mode!=='edit')return;
 for(const r of regions){outlines.poly(r.points.flatMap(p=>[p.x,p.y]),true).stroke({color:r.id===selected?0xffd387:0x7facb7,width:1.5/world.scale.x});if(mode==='edit'&&r.id===selected)for(const p of r.points)outlines.circle(p.x,p.y,6/world.scale.x).fill(0xffd387);}
 if(draft.length){outlines.poly(draft.flatMap(p=>[p.x,p.y]),false).stroke({color:0xffd387,width:2/world.scale.x});for(const p of draft)outlines.circle(p.x,p.y,4/world.scale.x).fill(0xffd387);}}
function rebuild(){for(const child of layers.removeChildren())child.destroy({children:true});for(const r of rendered)r.filter.destroy();rendered=[];
 if(base)for(const r of regions){const group=new Container(),sprite=new Sprite(base.texture),mask=new Graphics().poly(r.points.flatMap(p=>[p.x,p.y])).fill(0xffffff);const filter=effects[r.effect].create();sprite.filters=[filter];group.addChild(sprite);layers.addChild(group,mask);group.mask=mask;group.visible=r.enabled;rendered.push({region:r,filter});}
 drawOutlines();}
function sync(){const select=$<HTMLSelectElement>('regions');select.replaceChildren();for(const r of regions)select.add(new Option(`Område ${r.id} · ${effects[r.effect].name}`,String(r.id)));if(!regions.length)select.add(new Option('Inga områden',''));select.value=String(selected);
 const r=current();for(const key of ['speed','strength','direction'] as const){const val=r?.[key]??({speed:1,strength:8,direction:90}[key]);$<HTMLInputElement>(key).value=String(val);$(key+'Val').textContent=String(val)+(key==='direction'?'°':'');}$<HTMLInputElement>('enabled').checked=r?.enabled??true;}
function tool(next:typeof mode){mode=next;for(const id of ['pan','draw','edit'])$(id).classList.toggle('active',id===next);drawOutlines();}
function view(){ $('view').textContent=`${Math.round(world.scale.x*100)}%`;drawOutlines();}
function fit(){if(!base)return;const z=Math.min(stage.clientWidth/base.width,stage.clientHeight/base.height)*.92;world.scale.set(z);world.position.set((stage.clientWidth-base.width*z)/2,(stage.clientHeight-base.height*z)/2);view();}
async function setMap(data:string,name:string){const img=new Image();img.src=data;await img.decode();const texture=Texture.from(img);const next=new Sprite(texture);if(base){world.removeChild(base);base.destroy({texture:true,textureSource:true});}base=next;world.addChildAt(base,0);image={name,data};regions=[];selected=0;draft=[];rebuild();sync();fit();$('mapname').textContent=name;report('Kartan är klar. Välj Ny polygon och markera vattnet.');$('error').textContent='';}
function dataURL(file:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});}
async function demo(){const response=await fetch(`${import.meta.env.BASE_URL}test-map.svg`);await setMap(await dataURL(await response.blob()),'Inbyggd testkarta');}
$('upload').onchange=async()=>{const f=$<HTMLInputElement>('upload').files?.[0];if(f)try{await setMap(await dataURL(f),f.name);}catch(e){fail(e);}};
$('demo').onclick=()=>demo().catch(fail);
$('draw').onclick=()=>{draft=[];tool('draw');report('Klicka eller tryck längs området. Avsluta med Slutför polygon.');};$('pan').onclick=()=>tool('pan');$('edit').onclick=()=>{tool('edit');report('Dra de gyllene punkterna för att ändra valt område.');};
$('finish').onclick=()=>{if(draft.length<3){report('Minst tre punkter behövs.');return;}const r:Region={id:Math.max(0,...regions.map(r=>r.id))+1,points:draft,effect:'water',speed:1,strength:8,direction:90,enabled:true};regions.push(r);selected=r.id;draft=[];tool('pan');rebuild();sync();report('Flowing Water aktiv. Justera effekten i panelen.');};
$('undo').onclick=()=>{draft.pop();drawOutlines();};$('delete').onclick=()=>{regions=regions.filter(r=>r.id!==selected);selected=regions[0]?.id??0;rebuild();sync();};$('regions').onchange=()=>{selected=Number($<HTMLSelectElement>('regions').value);sync();drawOutlines();};
for(const key of ['speed','strength','direction'] as const)$(key).oninput=()=>{const value=Number($<HTMLInputElement>(key).value);const r=current();if(r)r[key]=value;$(key+'Val').textContent=String(value)+(key==='direction'?'°':'');};
$('enabled').onchange=()=>{const r=current();if(r){r.enabled=$<HTMLInputElement>('enabled').checked;rebuild();}};$('contours').onchange=drawOutlines;
$('toggle').onclick=()=>{running=!running;$('toggle').textContent=running?'Pausa animation':'Starta animation';};$('reset').onclick=fit;
app.ticker.add(t=>{if(running)clock+=t.deltaMS/1000;for(const {region:r,filter} of rendered){const u=filter.resources.waterUniforms.uniforms;u.uTime=clock;u.uSpeed=r.speed;u.uStrength=r.strength;u.uDirection=r.direction*Math.PI/180;u.uZoom=world.scale.x;}});
function zoom(factor:number,p={x:stage.clientWidth/2,y:stage.clientHeight/2}){const q=local(p),z=Math.max(.03,Math.min(12,world.scale.x*factor));world.scale.set(z);world.position.set(p.x-q.x*z,p.y-q.y*z);view();}
$('plus').onclick=()=>zoom(1.25);$('minus').onclick=()=>zoom(.8);
const pointers=new Map<number,Point>();let last:Point|undefined,editIndex=-1,pinch:{distance:number;center:Point}|undefined;
function pos(e:PointerEvent){const b=app.canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
function gesture(){const [a,b]=[...pointers.values()];return{distance:Math.hypot(b.x-a.x,b.y-a.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}
stage.onpointerdown=e=>{const p=pos(e);pointers.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);if(pointers.size===2){pinch=gesture();return;}last=p;editIndex=-1;if(mode==='draw'){draft.push(clampPoint(local(p)));drawOutlines();}if(mode==='edit'){const q=local(p),r=current();editIndex=r?.points.findIndex(v=>Math.hypot(v.x-q.x,v.y-q.y)<14/world.scale.x)??-1;}};
stage.onpointermove=e=>{if(!pointers.has(e.pointerId))return;const p=pos(e);pointers.set(e.pointerId,p);if(pointers.size===2){const g=gesture();if(pinch){zoom(g.distance/Math.max(pinch.distance,1),pinch.center);world.x+=g.center.x-pinch.center.x;world.y+=g.center.y-pinch.center.y;}pinch=g;return;}if(mode==='pan'&&last){world.x+=p.x-last.x;world.y+=p.y-last.y;}else if(mode==='edit'&&editIndex>=0){current()!.points[editIndex]=clampPoint(local(p));rebuild();}last=p;};
function release(e:PointerEvent){pointers.delete(e.pointerId);pinch=undefined;last=[...pointers.values()][0];editIndex=-1;}stage.onpointerup=release;stage.onpointercancel=release;
stage.addEventListener('wheel',e=>{e.preventDefault();const b=stage.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-b.left,y:e.clientY-b.top});},{passive:false});
$('save').onclick=()=>{const scene:Scene={format:'arcane-workshop',version:1,image,regions,view:{x:world.x,y:world.y,zoom:world.scale.x},running};const href=URL.createObjectURL(new Blob([JSON.stringify(scene)],{type:'application/json'}));const a=document.createElement('a');a.href=href;a.download='arcane-scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);report('Scen sparad med kartbild och samtliga områden.');};
$('load').onchange=async()=>{const f=$<HTMLInputElement>('load').files?.[0];if(!f)return;try{const s=JSON.parse(await f.text()) as Scene;if(s.format!=='arcane-workshop'||s.version!==1||!s.image?.data?.startsWith('data:image/')||!Array.isArray(s.regions)||s.regions.some(r=>r.effect!=='water'||r.points.length<3||r.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||![r.id,r.speed,r.strength,r.direction].every(Number.isFinite))||![s.view?.x,s.view?.y,s.view?.zoom].every(Number.isFinite)||s.view.zoom<=0)throw Error('Ogiltig scenfil');await setMap(s.image.data,s.image.name);regions=s.regions;selected=regions[0]?.id??0;running=s.running;$('toggle').textContent=running?'Pausa animation':'Starta animation';world.scale.set(s.view.zoom);world.position.set(s.view.x,s.view.y);rebuild();sync();view();report('Scen återöppnad med kartbild, polygoner och inställningar.');}catch(e){fail(e);}finally{$<HTMLInputElement>('load').value='';}};
new ResizeObserver(()=>{app.resize();view();}).observe(stage);
await demo();
