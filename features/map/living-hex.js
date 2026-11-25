import {hexCenter} from './adventure-hex.js';

export const defaults={grid:'auto',actors:true,path:true,opacity:38,glow:65,motion:80};
const ns='http://www.w3.org/2000/svg';
function element(tag,attrs={}) {
  const node=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  return node;
}
export function hexPanel(state){
  const p=state.prefs;
  const options=[['auto','Automatiskt'],['always','Alltid'],['hidden','Dolt']];
  const checkbox=(key,label)=>'<label><input data-hex-setting="'+key+'" type="checkbox" '+(p[key]?'checked':'')+'> '+label+'</label>';
  const range=(key,label)=>'<label>'+label+'<input data-hex-setting="'+key+'" type="range" min="0" max="100" value="'+p[key]+'"></label>';
  return '<section class="slcb-module hex-settings"><h3>Living Hex</h3><div class="figure-picker">'+
    (state.round?'<button type="button" class="btn" data-hex-command="round">Nästa runda · '+state.round+'</button><button type="button" class="btn" data-hex-command="end">Avsluta strid</button>':'')+
    '</div><details><summary>Hexagonernas utseende</summary><label>Rutnät<select data-hex-setting="grid">'+
    options.map(([value,label])=>'<option value="'+value+'" '+(p.grid===value?'selected':'')+'>'+label+'</option>').join('')+
    '</select></label>'+checkbox('actors','Aktörshexagoner')+checkbox('path','Färdväg')+range('opacity','Rutnätets opacitet')+
    range('glow','Skenets intensitet')+range('motion','Animationernas intensitet')+'</details></section>';
}
export function livingHexLayer(parent,map,manager){
  const id='hex-'+crypto.randomUUID(), defs=element('defs');
  const pattern=element('pattern',{id,patternUnits:'userSpaceOnUse'});
  const lines=element('path',{class:'arcane-mesh-line'});pattern.append(lines);defs.append(pattern);
  const surface=element('g',{'pointer-events':'none','aria-hidden':'true'});
  const gridLayer=element('g',{'data-tactical-grid':''});
  const field=element('rect',{width:map.width,height:map.height,fill:'url(#'+id+')'});gridLayer.append(field);
  const glows=element('g'), trail=element('g'),preview=element('g');
  surface.append(gridLayer,glows,trail,preview);parent.append(defs,surface);
  // Black pixels in the server-projected raster include undisclosed overlaps. This mask
  // only modulates authorized artwork; it never asks the server for hidden boundaries.
  let projectedImage;
  if(!manager){
    const mask=element('mask',{id:id+'-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:map.width,height:map.height});
    const filter=element('filter',{id:id+'-lit','color-interpolation-filters':'sRGB'});
    filter.append(element('feColorMatrix',{type:'matrix',values:'255 255 255 0 0  255 255 255 0 0  255 255 255 0 0  0 0 0 1 0'}));
    projectedImage=element('image',{width:map.width,height:map.height,preserveAspectRatio:'none',filter:'url(#'+id+'-lit)'});
    mask.append(projectedImage);defs.append(filter,mask);surface.setAttribute('mask','url(#'+id+'-mask)');
  }
  let grid,prefs=defaults,lastGrid='',activeRound=0;const markers=new Map(),motions=new Map();
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||prefs.motion===0;
  function polygon(x,y,klass){
    return element('polygon',{class:klass,points:combatHexPoints(x,y,grid.size*.96)});
  }
  function update(v){
    grid=v.grid;prefs=v.hex.prefs;surface.style.display=grid?'':'none';
    if(!grid)return;
    if(projectedImage&&projectedImage.getAttribute('href')!==v.map.image_url)projectedImage.setAttribute('href',v.map.image_url);
    const w=grid.width,h=grid.size,p=grid.pitch;
    if(lastGrid!==w+','+p){
      lastGrid=w+','+p;pattern.setAttribute('width',w);pattern.setAttribute('height',2*p);
      // One rectangular period contains two staggered hex centers; trace each shared edge once.
      lines.setAttribute('d','M0 '+h+' L'+w/2+' '+h/2+' V0 M'+w/2+' '+h/2+' L'+w+' '+h+
        ' M0 '+h+' V'+(2*h)+' L'+w/2+' '+(2.5*h)+' L'+w+' '+(2*h)+' M'+w/2+' '+(2.5*h)+' V'+(3*h));
    }
    surface.style.setProperty('--hex-glow',prefs.glow/100);
    gridLayer.style.setProperty('--grid-opacity',prefs.opacity/100);
    gridLayer.style.setProperty('--fade-time',reduced()?'0ms':Math.round(1000*prefs.motion/100)+'ms');
    const visible=prefs.grid==='always'||(prefs.grid==='auto'&&v.hex.round>0);
    gridLayer.classList.toggle('awakened',visible);
    const entering=!activeRound&&v.hex.round>0;
    if(entering&&visible&&!reduced()){
      const actor=v.rows.find(r=>r.id===v.selected)||v.rows[0];
      const [x,y]=actor?hexCenter(grid,actor.q,actor.r):[map.width/2,map.height/2];
      const clip=element('clipPath',{id:id+'-wave'}),circle=element('circle',{cx:x,cy:y,r:0});
      const time=Math.round(700+4*prefs.motion),radius=Math.hypot(map.width,map.height);
      const anim=element('animate',{attributeName:'r',from:0,to:radius,dur:time+'ms',begin:'indefinite',fill:'freeze'});
      circle.append(anim);clip.append(circle);defs.append(clip);
      const wave=field.cloneNode();wave.classList.add('hex-impulse');wave.setAttribute('clip-path','url(#'+id+'-wave)');surface.insertBefore(wave,glows);
      anim.beginElement();wave.animate([{opacity:.95},{opacity:.08}],{duration:time});
      setTimeout(()=>{clip.remove();wave.remove();},time);
    }
    activeRound=v.hex.round;
    glows.style.display=prefs.actors?'':'none';
    if(!prefs.path){preview.replaceChildren();trail.replaceChildren();}
  }
  function actors(rows,selected,dispositions){
    if(!grid){glows.replaceChildren();markers.clear();return;}
    const keep=new Set();
    for(const row of rows){
      keep.add(row.id);
      let node=markers.get(row.id);
      if(!node){
        node=element('g',{'data-actor-hex':row.id});
        node.append(polygon(0,0,'hex-halo'),polygon(0,0,'hex-edge'));markers.set(row.id,node);glows.append(node);
      }else if(node.dataset.size!==String(grid.size)){
        for(const poly of node.children)poly.setAttribute('points',combatHexPoints(0,0,grid.size*.96));
      }
      node.dataset.size=grid.size;
      node.dataset.tone=row.character_id?'emerald':!manager?'unknown':dispositions?.[row.id]||(row.monster_id?'ruby':'amber');
      node.toggleAttribute('data-selected',row.id===selected);
      const [x,y]=hexCenter(grid,row.q,row.r);node.setAttribute('transform','translate('+x+' '+y+')');
    }
    for(const [k,n] of markers)if(!keep.has(k)){n.remove();markers.delete(k);}
  }
  function route(path,valid=true,budget=null){
    preview.replaceChildren();
    if(!grid||!path?.length||!prefs.path)return;
    path.forEach(({x,y,q,r},i)=>{
      const end=i===path.length-1,el=polygon(x,y,valid?'hex-path':'hex-invalid');
      if(valid&&budget){
        const actor={movement_max:budget.max,movement_remaining:budget.max-budget.spent};
        el.dataset.moveType=combatDestinationKeepsAction(actor,i+1)?'half':'full';
      }
      el.dataset.cell=q+','+r;if(end)el.dataset.destination='';
      if(!reduced())el.animate([{opacity:.08},{opacity:1}],{duration:190,delay:Math.min(i*22,200),fill:'backwards'});
      preview.append(el);
    });
  }
  function travel(row,path,piece){
    if(!grid||!piece||!path?.length||reduced())return;
    motions.get(row.id)?.forEach(a=>a.cancel());
    const cells=[row,...path],points=cells.map(c=>hexCenter(grid,c.q,c.r));
    const step=Math.min(240,1800/path.length)*(.5+prefs.motion/160),duration=step*path.length;
    // Keep stationary Hero Class originals on the native SVG surface at maximum zoom.
    if(!manager)piece.parentElement.setAttribute('mask','url(#'+id+'-mask)');
    const actorLayer=piece.parentElement;
    const keyframes=points.map(([x,y])=>({transform:'translate('+x+'px,'+y+'px)'}));
    const anims=[piece,markers.get(row.id)].filter(Boolean).map(n=>n.animate(keyframes,{duration,easing:'linear'}));
    motions.set(row.id,anims);
    anims[0].finished.catch(()=>{}).then(()=>{if(motions.get(row.id)===anims)motions.delete(row.id);if(!manager&&!motions.size)actorLayer.removeAttribute('mask');});
    if(!prefs.path)return;
    points.slice(1).forEach(([x,y],i)=>{
      const el=polygon(x,y,'hex-path');trail.append(el);
      const delay=step*i,tail=i===path.length-1?800:500;
      const a=el.animate([{opacity:.3},{opacity:1,offset:step/(step+tail)},{opacity:0}],{delay,duration:step+tail,fill:'both'});
      a.finished.catch(()=>{}).then(()=>el.remove());
    });
  }
  function reject(cell){
    if(!grid||!cell||!prefs.path)return;
    const el=polygon(cell.x,cell.y,'hex-invalid');trail.append(el);
    const fade=el.animate([{opacity:1},{opacity:0}],{duration:reduced()?100:320});
    fade.finished.catch(()=>{}).then(()=>el.remove());
  }
  return {update,actors,route,travel,reject,stop(id){motions.get(id)?.forEach(a=>a.cancel());},clear(){preview.replaceChildren();},destroy(){for(const list of motions.values())list.forEach(a=>a.cancel());surface.remove();defs.remove();}};
}
