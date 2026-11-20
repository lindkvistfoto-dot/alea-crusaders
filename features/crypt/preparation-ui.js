import '../map/object-library-geometry.js';
import {DEFAULT_CRYPT_MAP} from './scene.js';
import {prepareCryptMap, previewDoorFootprint} from './preparation.js';
import './preparation.css';

const ns = 'http://www.w3.org/2000/svg';
function draw(svg, name, attrs) {
  const el = document.createElementNS(ns, name);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  svg.append(el);
  return el;
}

export function openCryptPreparation(view, onApply) {
  const dialog = document.createElement('dialog');
  dialog.className = 'crypt-prep';
  dialog.setAttribute('aria-labelledby','crypt-prep-title');
  dialog.innerHTML = `<form><header><h2 id="crypt-prep-title">Förbered kryptan</h2><button type="button" data-close aria-label="Stäng">×</button></header>
    <p>Flytta skiljeväggen. Båda rummen möter samma dörr i gången.</p>
    <svg viewBox="0 0 1000 600" role="img" aria-label="Rumsindelning med dörr och referenssträcka"></svg>
    <label>Rumsdelning <input data-split type="range" min="430" max="570" step="1"></label>
    <label>Pröva dörrbredd <select data-footprint><option value="">Ingen figur</option><option value="single">1 hex</option><option value="triangle3">3 hexar</option><option value="giant7">7 hexar</option></select></label><p data-clearance></p>
    <fieldset><legend>Kalibrering</legend>
    <button data-measure type="button">Välj två mätpunkter</button>
    <label>Avstånd i meter <input data-metres type="number" step="any" min="0" required></label>
    <output aria-live="polite"></output></fieldset>
    <p class="crypt-prep-status" role="status"></p>
    <footer><button type="button" data-cancel>Avbryt</button><button type="submit">Använd rumsindelning</button></footer></form>`;
  const $ = s => dialog.querySelector(s);
  const svg = $('svg'), split = $('[data-split]'), metres = $('[data-metres]'), output = $('output');
  const submit = $('button[type="submit"]'), status = $('[role="status"]');
  split.value = String(view.door?.x ?? DEFAULT_CRYPT_MAP.door.x);
  let points = [{x:125,y:175},{x:285,y:175}], measuring = false, busy = false;
  metres.value = String(160/view.pixelsPerMeter);
  const scale = () => points.length === 2
    ? window.aleaMapObjectGeometry.calibrate(points[0],points[1],metres.valueAsNumber) : null;
  function render() {
    svg.replaceChildren();
    const ppm = scale();
    const draft = prepareCryptMap(DEFAULT_CRYPT_MAP,{splitX:split.valueAsNumber,pixelsPerMeter:ppm||view.pixelsPerMeter});
    for (const shape of [...draft.rooms,draft.corridor]) {
      const {x,y,width,height}=shape;
      draw(svg,'rect',{x,y,width,height,fill:'#48605d',stroke:'#85948c','stroke-width':3});
    }
    const {x,y,endX,endY}=draft.door;
    const shape=$('[data-footprint]').value;
    const clearance=$('[data-clearance]');
    clearance.hidden=!shape;
    if (shape) {
      const result=previewDoorFootprint(draft,shape,globalThis.aleaMapGrid);
      for (const polygon of result.polygons) draw(svg,'polygon',{points:polygon.map(p=>p.join(',')).join(' '),fill:result.fits?'#759e91':'#a36548',stroke:'#ddc196','stroke-width':2});
      const openingM=Math.abs(endY-y)/draft.pixelsPerMeter;
      clearance.textContent='Öppning '+openingM.toLocaleString('sv-SE',{maximumFractionDigits:2})+' m · Figuren '+(result.fits?'ryms':'är för bred')+' i denna riktning.';
    }
    draw(svg,'line',{x1:x,y1:y,x2:endX,y2:endY,stroke:'#fed383','stroke-width':10});
    if (points.length===2) draw(svg,'line',{x1:points[0].x,y1:points[0].y,x2:points[1].x,y2:points[1].y,stroke:'#eee6ce','stroke-dasharray':'8 6','stroke-width':4});
    for (const point of points) draw(svg,'circle',{cx:point.x,cy:point.y,r:8,fill:'#f9e5b6'});
    svg.classList.toggle('is-measuring',measuring);
    output.textContent=ppm ? ppm.toLocaleString('sv-SE',{maximumFractionDigits:2})+' px/m · 1,5 m mellan hexcentrum' : '';
    submit.disabled=busy||!ppm||measuring;
  }
  $('[data-measure]').onclick=()=>{points=[];measuring=true;status.textContent='Tryck på referenssträckans start och slut på kartan.';render();};
  svg.onclick=event=>{
    if (!measuring) return;
    const matrix=svg.getScreenCTM();
    if (!matrix) return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    points.push({x:Math.round(point.x),y:Math.round(point.y)});
    if (points.length===2) {measuring=false;status.textContent='Ange referenssträckans verkliga längd.';metres.focus();}
    render();
  };
  metres.oninput=split.oninput=render;
  $('[data-footprint]').onchange=render;
  const close=()=>{if (!busy) dialog.close();};
  $('[data-close]').onclick=$('[data-cancel]').onclick=close;
  dialog.addEventListener('cancel',event=>{if (busy) event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  $('form').onsubmit=async event=>{
    event.preventDefault();
    if (submit.disabled) return;
    busy=true;render();
    try {await onApply({splitX:split.valueAsNumber,pixelsPerMeter:scale()});dialog.close();}
    catch (error) {status.textContent=error.message;}
    finally {busy=false;render();}
  };
  document.body.append(dialog);render();dialog.showModal();
}
