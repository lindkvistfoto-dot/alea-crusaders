'use strict';
const scene=document.getElementById('scene'),camera=document.getElementById('camera'),wall=document.getElementById('wall');
for(let i=1;i<=30;i++){const slot=document.createElement('span');slot.className='slot';slot.textContent=String(i);wall.append(slot)}
let zoom=1,x=0,y=0,drag=null;function draw(){camera.style.setProperty('--zoom',zoom);camera.style.setProperty('--x',x+'px');camera.style.setProperty('--y',y+'px');document.getElementById('reset').textContent=Math.round(zoom*100)+' %'}
function change(amount){zoom=Math.max(1,Math.min(4,zoom+amount));draw()}
document.getElementById('in').onclick=()=>change(.25);document.getElementById('out').onclick=()=>change(-.25);document.getElementById('reset').onclick=()=>{zoom=1;x=0;y=0;draw()};
scene.addEventListener('wheel',e=>{e.preventDefault();change(e.deltaY<0?.12:-.12)},{passive:false});
scene.addEventListener('pointerdown',e=>{drag={x:e.clientX-x,y:e.clientY-y};scene.setPointerCapture(e.pointerId)});
scene.addEventListener('pointermove',e=>{if(!drag)return;x=e.clientX-drag.x;y=e.clientY-drag.y;draw()});
for(const type of ['pointerup','pointercancel'])scene.addEventListener(type,()=>drag=null);
draw();
