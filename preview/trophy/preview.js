'use strict';
const scene=document.getElementById('scene'),camera=document.getElementById('camera'),wall=document.getElementById('wall');
for(let i=1;i<=30;i++){const slot=document.createElement('span');slot.className='slot';slot.textContent=String(i);wall.append(slot)}
let zoom=1,x=0,y=0,drag=null;function draw(){camera.style.setProperty('--zoom',zoom);camera.style.setProperty('--x',x+'px');camera.style.setProperty('--y',y+'px');document.getElementById('reset').textContent=Math.round(zoom*100)+' %'}
function change(amount){zoom=Math.max(1,Math.min(4,zoom+amount));draw()}
document.getElementById('in').onclick=()=>change(.25);document.getElementById('out').onclick=()=>change(-.25);document.getElementById('reset').onclick=()=>{zoom=1;x=0;y=0;draw()};
scene.addEventListener('wheel',e=>{e.preventDefault();change(e.deltaY<0?.12:-.12)},{passive:false});
scene.addEventListener('pointerdown',e=>{if(e.target.closest('#wall'))return;drag={x:e.clientX-x,y:e.clientY-y};scene.setPointerCapture(e.pointerId)});
scene.addEventListener('pointermove',e=>{if(!drag)return;x=e.clientX-drag.x;y=e.clientY-drag.y;draw()});
for(const type of ['pointerup','pointercancel'])scene.addEventListener(type,()=>drag=null);
draw();

const bounds={left:31,top:24,width:38,height:27};
function renderBounds(){Object.assign(wall.style,{left:bounds.left+'%',top:bounds.top+'%',width:bounds.width+'%',height:bounds.height+'%'});document.getElementById('coords').textContent=JSON.stringify({reference:'1280x720',columns:6,rows:5,...Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,Number(v.toFixed(2))]))})}
let editing=null;
wall.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const r=wall.getBoundingClientRect();editing={resize:e.clientX>r.right-35&&e.clientY>r.bottom-35,sx:e.clientX,sy:e.clientY,initial:{...bounds}};wall.setPointerCapture(e.pointerId)});
wall.addEventListener('pointermove',e=>{if(!editing)return;const rect=scene.getBoundingClientRect(),factor=zoom||1;const dx=(e.clientX-editing.sx)/(rect.width*factor)*100,dy=(e.clientY-editing.sy)/(rect.height*factor)*100;const b=editing.initial;if(editing.resize){bounds.width=Math.max(10,Math.min(100-b.left,b.width+dx));bounds.height=Math.max(10,Math.min(100-b.top,b.height+dy))}else{bounds.left=Math.max(0,Math.min(100-b.width,b.left+dx));bounds.top=Math.max(0,Math.min(100-b.height,b.top+dy))}renderBounds()});
for(const type of ['pointerup','pointercancel'])wall.addEventListener(type,()=>editing=null);
document.getElementById('send').addEventListener('click',async()=>{const value=document.getElementById('coords').textContent;try{await navigator.clipboard.writeText(value);document.getElementById('send').textContent='Kopierat – klistra in i ChatGPT'}catch{document.getElementById('send').textContent='Kopiera koordinaterna nedan'}});
renderBounds();
