import './object-library.css';
import {mapPointer} from './polygon-edit-geometry.js';
import hermesAlea from '../hermes-alea/asset-resolver.js';

const svgNS = 'http://www.w3.org/2000/svg';
const editors = new Set();
const cropCache = new Map();
const category = type => ({table:'Bord',chair:'Stolar',chest:'Kistor'}[type] || type);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = value => Number(value).toLocaleString('sv-SE',{maximumFractionDigits:3});
const rpc = (name,args) => dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
const geometry = () => window.aleaMapObjectGeometry;
function svg(tag,attributes={}) {
  const node=document.createElementNS(svgNS,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}

async function imageBounds(url) {
  if(!cropCache.has(url)) {
    const pending=(async()=>{
      const img=new Image();img.crossOrigin='anonymous';img.src=url;await img.decode();
      const canvas=document.createElement('canvas');
      const w=canvas.width=img.naturalWidth,h=canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      const rgba=ctx.getImageData(0,0,w,h).data;
      let x0=w,y0=h,x1=-1,y1=-1;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>0) {
        x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      }
      return x1<0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1,canvasWidth:w,canvasHeight:h};
    })();
    cropCache.set(url,pending);pending.catch(()=>cropCache.delete(url));
  }
  return cropCache.get(url);
}
async function loadArt(definitions) {
  const keys=[...new Set(definitions.map(d=>d.image_asset_key))];
  const core=keys.filter(k=>/^arcane-[a-z0-9-]+$/.test(k));
  const [assets]=await Promise.all([
    core.length?dbJson('arcane_system_assets?select=asset_key,asset_path,width,height&asset_key=in.('+core.join(',')+')'):[],
    keys.some(k=>k.startsWith('hermes-alea:'))?hermesAlea.load():null,
  ]);
  const registry=new Map(assets.map(a=>[a.asset_key,a]));
  return Promise.all(definitions.map(async d=>{
    const a=registry.get(d.image_asset_key);
    const url=a && /^hermes\/system-asset\/[\w.-]+\/[a-f0-9]{64}\.webp$/.test(a.asset_path)
      ?SUPABASE_URL+'/storage/v1/object/public/alea-hermes-public/'+a.asset_path:hermesAlea.url(d.image_asset_key);
    const crop=d.image_crop;
    // V1 stored pixel crops on a 1254-square master. Its full-canvas default
    // represented an unmeasured image, so resolve alpha bounds in that case.
    const measured=crop?.width && crop?.height && (crop.canvasWidth || crop.x || crop.y || crop.width!==1254 || crop.height!==1254);
    const bounds=measured?{canvasWidth:1254,canvasHeight:1254,...crop}:url?await imageBounds(url).catch(()=>null):null;
    return {...d,url,bounds};
  }));
}
function objectArt(d,row,ppm) {
  const size=geometry().pixelSize(d,ppm*Number(row.scale_factor ?? 1));
  const crop=d?.bounds;
  if(!size||!d.url||!crop?.canvasWidth||!crop?.canvasHeight)return null;
  const w=size.width,h=size.depth;
  const group=svg('g',{transform:'translate('+row.x+' '+row.y+') rotate('+row.rotation+')'});
  const art=svg('svg',{x:-w/2,y:-h/2,width:w,height:h,viewBox:[crop.x,crop.y,crop.width,crop.height].join(' '),preserveAspectRatio:'none',overflow:'hidden'});
  art.append(svg('image',{href:d.url,width:crop.canvasWidth,height:crop.canvasHeight,preserveAspectRatio:'none'}));
  group.append(art);
  return {group,w,h};
}

export function createObjectEditor({map,parent,before,live,manager,getScale,areas=()=>[],onEnter=()=>{},onPick=()=>{}}) {
  const layer=svg('g',{'data-map-objects':'','pointer-events':'none'});
  parent.insertBefore(layer,before);
  const surface=svg('rect',{width:map.width,height:map.height,fill:'transparent','pointer-events':'all'});
  const pieces=svg('g');
  const mask=svg('mask',{id:'object-fog-'+crypto.randomUUID(),maskUnits:'userSpaceOnUse',x:0,y:0,width:map.width,height:map.height});
  const preview=svg('g',{opacity:.74,'pointer-events':'none'});
  const inputLayer=svg('g',{'pointer-events':'none',class:'living-editing'});
  const hitTargets=svg('g');
  inputLayer.append(surface,hitTargets,preview);
  layer.append(mask,pieces);
  parent.append(inputLayer);
  const panel=document.createElement('section');panel.className='living-objects';
  panel.innerHTML='<label>Sök objekt<input type="search" placeholder="Namn eller kategori" data-search></label><div class="living-catalog" data-catalog></div><div data-inspector></div><p role="status" aria-live="polite"></p>';
  const catalog=panel.querySelector('[data-catalog]'), inspector=panel.querySelector('[data-inspector]');
  const search=panel.querySelector('[data-search]'), status=panel.querySelector('[role=status]');
  let definitions=new Map(),rows=[],selected=null,armed=null,gesture=null,active=false,shown=true;
  let request=0,pending=false,disposed=false,loaded=false,templateId=null,lastScale;
  const events=new AbortController();
  const on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:events.signal});
  const notify=message=>{status.textContent=message;};
  const rowById=id=>rows.find(row=>row.id===id);
  const valid=p=>p && p[0]>=0 && p[1]>=0 && p[0]<=map.width && p[1]<=map.height;
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  const pos=e=>mapPointer(e,layer);
  function entry(id) { return definitions.get(id); }
  function available(d) {return d?.url && d.bounds && [d.width_m,d.depth_m,d.height_m].every(n=>Number(n)>0) && getScale()>0;}
  function cancel() {gesture=null;armed=null;preview.replaceChildren();}
  function draw() {
    layer.style.display=shown?'':'none';
    inputLayer.style.display=active&&shown?'':'none';
    hitTargets.replaceChildren();
    pieces.replaceChildren();
    if(!manager){
      mask.innerHTML=areas().filter(a=>a.status==='explored').map(a=>mapShapeTag(a,'fill="white"')).join('')+
        areas().filter(a=>a.status!=='explored').map(a=>mapShapeTag(a,'fill="black"')).join('');
      pieces.setAttribute('mask','url(#'+mask.id+')');
    }
    for(const saved of rows) {
      const row=gesture?.id===saved.id?{...saved,...gesture.patch}:saved;
      const art=objectArt(entry(row.object_definition_id),row,getScale());
      if(!art)continue;
      const {group,w,h}=art;
      group.dataset.objectId=row.id;
      if(manager && !row.player_visible)group.setAttribute('opacity','.55');
      if(active){
        const target=svg('g',{transform:group.getAttribute('transform'),'data-object-hit':row.id});
        hitTargets.append(target);
        const box=svg('rect',{x:-w/2,y:-h/2,width:w,height:h,fill:'transparent','pointer-events':'all'});
        target.append(box);
        if(row.id===selected){
          box.setAttribute('class','living-outline');
          if(!row.locked){
            const screen=layer.getScreenCTM();
            const r=7/(Math.hypot(screen?.a||1,screen?.b||0)||1);
            target.append(svg('line',{x1:0,x2:0,y1:-h/2,y2:-h/2-2*r,class:'living-outline'}));
            for(const [action,x,y] of [['rotate',0,-h/2-2*r],['scale',w/2,h/2]])
              target.append(svg('circle',{cx:x,cy:y,r,'data-handle':action,class:'living-handle','pointer-events':'all'}));
          }
        }
      }
      pieces.append(group);
    }
  }
  function ghost(p) {
    preview.replaceChildren();
    if(!armed||!valid(p))return;
    const d=entry(armed),art=objectArt(d,{x:p[0],y:p[1],rotation:d.default_rotation||0},getScale());
    if(art)preview.append(art.group);
  }
  const button=(action,label)=>'<button type="button" class="btn" data-command="'+action+'">'+label+'</button>';
  const input=(key,label,value,options='')=>'<label>'+label+'<input type="number" data-value="'+key+'" value="'+escape(value)+'" '+options+'></label>';
  function list(){
    const query=search.value.trim().toLocaleLowerCase('sv');
    catalog.innerHTML=[...definitions.values()].filter(d=>d.active!==false && (d.name+' '+category(d.object_type)).toLocaleLowerCase('sv').includes(query)).map(d=>
      '<div class="living-card"><button type="button" data-definition="'+escape(d.id)+'" draggable="'+Boolean(available(d))+'" aria-pressed="'+(armed===d.id)+'" '+(!available(d)?'disabled':'')+'>'+
      (d.url?'<img src="'+escape(d.url)+'" alt="">':'')+'<span><strong>'+escape(d.name)+'</strong><small>'+escape(category(d.object_type))+' · '+
      (!d.width_m||!d.depth_m||!d.height_m?'Mått saknas':!d.url||!d.bounds?'Bild saknas':!(getScale()>0)?'Kalibrera kartan':format(d.width_m)+' × '+format(d.depth_m)+' m')+'</small></span></button>'+
      (!live&&activeUser()?.admin?'<button type="button" data-template="'+escape(d.id)+'" aria-label="Redigera mall '+escape(d.name)+'">✎</button>':'')+'</div>').join('');
  }
  function inspect(){
    const obj=rowById(selected),d=entry(templateId);
    if(d){
      const battle=!!d.battle_object_key;
      inspector.innerHTML='<fieldset><legend>'+escape(d.name)+' · objektmall</legend><div class="living-fields">'+
        input('width_m','Längd (m)',d.width_m,'min=".001" step=".001"')+input('depth_m','Bredd (m)',d.depth_m,'min=".001" step=".001"')+
        input('height_m','Höjd (m)',d.height_m,'min=".001" step=".001"')+input('max_bep','Max BEP',d.max_bep,'min="0" step="1" '+(battle?'disabled':''))+
        '</div><label>Beskrivning<textarea data-description '+(battle?'disabled':'')+'>'+escape(d.description)+'</textarea></label>'+
        (battle?'<small>Beskrivning och Max BEP hämtas från Battle Library.</small>':'')+button('template','Spara mall')+'</fieldset>';return;
    }
    if(!obj){inspector.innerHTML=armed?button('cancel','Avbryt placering'):'';return;}
    const def=entry(obj.object_definition_id),scale=Number(obj.scale_factor),lock=obj.locked?' disabled':'';
    inspector.innerHTML='<fieldset><legend>'+escape(def?.name)+'</legend><p>'+[def.width_m,def.depth_m,def.height_m].map(n=>format(n*scale)).join(' × ')+' m</p><div class="living-fields">'+
      input('rotation','Rotation (°)',obj.rotation,'step="any"'+lock)+input('scale_factor','Skala (%)',Number((scale*100).toFixed(3)),'min=".001" step="any"'+lock)+
      input('max_bep','Max BEP',obj.max_bep,'min="0" step="1"')+input('current_bep','Aktuell BEP',obj.current_bep,'min="0" step="1"')+
      '</div>'+button('values','Spara värden')+'<div class="living-actions">'+
      [['back','Längst bak'],['backward','Bakåt'],['forward','Framåt'],['front','Längst fram'],['duplicate','Duplicera'],['lock',obj.locked?'Lås upp':'Lås position'],
       ['visibility',obj.player_visible?'Dölj för spelare':'Visa för spelare'],['remove','Ta bort från kartan']].map(([k,v])=>button(k,v)).join('')+'</div>'+
      '<details><summary>Objektegenskaper</summary>'+[['movement_blocking','Blockerar rörelse'],['light_blocking','Blockerar ljus'],['shadow_casting','Kastar skugga']].map(([k,v])=>'<label><input type="checkbox" data-flag="'+k+'" '+(obj[k]?'checked':'')+'> '+v+'</label>').join('')+'</details></fieldset>';
  }
  async function refresh(reloadCatalog=false) {
    const version=++request;
    try {
      const args={p_map_id:map.id};
      const [objects,defs]=await Promise.all([
        manager?rpc('read_living_map_objects',{...args,p_live:live}):rpc('read_adventure_player_objects',args),
        manager&&(!loaded||reloadCatalog)?dbJson('arcane_object_definitions?select=*&order=name'):null,
      ]);
      const fresh=manager?defs:[...new Map(objects.map(o=>[o.definition.id,o.definition])).values()];
      const art=fresh?await loadArt(fresh):null;
      if(disposed||request!==version)return;
      if(art)definitions=new Map(art.map(d=>[d.id,d]));
      rows=objects;loaded=true;
      if(selected&&!rowById(selected))selected=null;
      draw();if(manager){list();if(!inspector.contains(document.activeElement))inspect();}
    }catch(error){
      if(!disposed && version===request){
        if(!manager){rows=[];definitions.clear();draw();}
        notify('Objekten kunde inte läsas. '+error.message);
      }
    }
  }
  async function save(action,id,values={}) {
    if(!manager||!active||pending)return;
    pending=true;panel.inert=true;notify('Sparar…');
    try{
      const result=await rpc('edit_living_map_object',{p_map_id:map.id,p_live:live,p_action:action,p_id:id,p_values:values});
      if(disposed)return;
      selected=action==='remove'?null:result;
      await refresh();
      inspect();notify('Sparat.');
      for(const other of editors)if(other!==api&&other.map.id===map.id)void other.refresh();
    }catch(error){notify('Kunde inte spara. '+error.message);await refresh();}
    finally{pending=false;panel.inert=false;}
  }
  function pick(id) {
    if(!active||!available(entry(id)))return;
    cancel();selected=null;templateId=null;armed=id;list();inspect();draw();
    notify('Placera '+entry(id).name+' på kartan.');onPick();
  }
  function place(p) {
    if(!armed||!valid(p))return;
    const id=armed;cancel();void save('place',crypto.randomUUID(),{definition:id,x:p[0],y:p[1]});
  }
  on(search,'input',list);
  on(panel,'click',async e=>{
    const el=e.target.closest('button');if(!el||pending)return;
    if(el.dataset.definition){pick(el.dataset.definition);return;}
    if(el.dataset.template){cancel();selected=null;templateId=el.dataset.template;inspect();draw();return;}
    const action=el.dataset.command;
    if(!action)return;
    if(action==='cancel'){cancel();inspect();list();notify('');return;}
    const fields=[...inspector.querySelectorAll('[data-value]:enabled')];
    if(['template','values'].includes(action)&&!fields.every(f=>f.reportValidity()))return;
    const values=Object.fromEntries(fields.map(f=>[f.dataset.value,f.value===''?null:f.valueAsNumber]));
    if(action==='template'){
      const d=entry(templateId);
      if(!d.battle_object_key)values.description=inspector.querySelector('textarea').value;
      try{pending=true;panel.inert=true;await dbJson('arcane_object_definitions?id=eq.'+encodeURIComponent(d.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});
        await refresh(true);notify('Objektmallen har sparats.');}catch(error){notify(error.message);}finally{pending=false;panel.inert=false;}return;
    }
    const obj=rowById(selected);if(!obj)return;
    if(action==='values'){
      if('scale_factor' in values)values.scale_factor/=100;
      const patch=Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==(obj[k]===null?null:Number(obj[k]))));
      if(Object.keys(patch).length)await save('edit',selected,patch);
    } else if(action==='lock')await save('edit',selected,{locked:!obj.locked});
    else if(action==='visibility')await save('edit',selected,{player_visible:!obj.player_visible});
    else await save(action,selected,action==='duplicate'?{new_id:crypto.randomUUID()}:{});
  });
  on(panel,'change',e=>{if(e.target.dataset.flag)void save('edit',selected,{[e.target.dataset.flag]:e.target.checked});});
  on(panel,'dragstart',e=>{
    const id=e.target.closest('[data-definition]')?.dataset.definition;
    if(!available(entry(id)))return;
    armed=id;templateId=null;selected=null;e.dataTransfer.setData('application/x-alea-map-object',id);
    e.dataTransfer.effectAllowed='copy';draw();
  });
  on(panel,'dragend',()=>{cancel();draw();list();inspect();});
  on(inputLayer,'dragover',e=>{if(active&&armed){stop(e);e.dataTransfer.dropEffect='copy';ghost(pos(e));}});
  on(inputLayer,'drop',e=>{if(active&&armed){stop(e);place(pos(e));}});
  on(inputLayer,'pointerdown',e=>{
    if(!active||e.button!==0)return;
    if(pending||!e.isPrimary){stop(e);cancel();draw();inspect();return;}
    stop(e);const p=pos(e);if(!valid(p))return;
    const id=e.target.closest('[data-object-hit]')?.dataset.objectHit;
    const obj=rowById(id);templateId=null;
    if(!armed)selected=id||null;
    const mode=armed?'place':e.target.dataset.handle||'move';
    gesture={mode,id,pointer:e.pointerId,start:p,screen:[e.clientX,e.clientY],patch:{},obj};
    inputLayer.setPointerCapture(e.pointerId);draw();inspect();
  });
  on(inputLayer,'pointermove',e=>{
    if(!active)return;
    const p=pos(e);if(armed)ghost(p);
    if(!gesture||e.pointerId!==gesture.pointer||!p)return;
    stop(e);
    const {mode,obj,start}=gesture;if(!obj||obj.locked||mode==='place')return;
    const dx=p[0]-obj.x,dy=p[1]-obj.y,ax=start[0]-obj.x,ay=start[1]-obj.y;
    if(mode==='rotate')gesture.patch={rotation:Number(obj.rotation)+(Math.atan2(dy,dx)-Math.atan2(ay,ax))*180/Math.PI};
    else if(mode==='scale')gesture.patch={scale_factor:Number(obj.scale_factor)*Math.max(.001,Math.hypot(dx,dy)/Math.max(.001,Math.hypot(ax,ay)))};
    else gesture.patch={x:Number(obj.x)+p[0]-start[0],y:Number(obj.y)+p[1]-start[1]};
    draw();
  });
  on(inputLayer,'pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.pointer)return;
    stop(e);const g=gesture,p=pos(e);gesture=null;
    if(g.mode==='place'&&Math.hypot(e.clientX-g.screen[0],e.clientY-g.screen[1])<12)place(p);
    else if(g.obj&&!g.obj.locked&&valid(p)&&Object.keys(g.patch).length &&
      (!('x' in g.patch)||valid([g.patch.x,g.patch.y])))void save('edit',g.id,g.patch);
    draw();
  });
  on(inputLayer,'pointercancel',()=>{cancel();draw();inspect();list();});
  on(inputLayer,'lostpointercapture',e=>{if(gesture?.pointer===e.pointerId){gesture=null;draw();}});
  on(inputLayer,'pointerleave',()=>preview.replaceChildren());
  on(inputLayer,'click',e=>{if(active)stop(e);});
  on(window,'keydown',e=>{if(active&&e.key==='Escape'){cancel();selected=null;inspect();draw();list();notify('');}});
  function editing(value){
    value=Boolean(manager&&value);if(active===value)return;
    active=value;cancel();selected=null;templateId=null;
    if(active){parent.append(inputLayer);onEnter();}
    draw();list();inspect();
  }
  const api={map,live,panel,refresh,draw,editing,get active(){return active;},updateScale(){const scale=getScale();if(scale===lastScale)return;lastScale=scale;draw();if(manager)list();},show(value){if(value!==shown){shown=value;draw();}},
    runtime(id){
      const o=rowById(id),d=o&&entry(o.object_definition_id);if(!d)return null;
      const scale=Number(o.scale_factor??1),w=d.width_m*scale,h=d.depth_m*scale;
      return {id,definitionId:d.id,position:{x:+o.x,y:+o.y},width_m:w,depth_m:h,height_m:d.height_m*scale,rotation_degrees:+o.rotation,
        footprint:geometry().footprint(w,h,o.rotation),movement_blocking:o.movement_blocking,light_blocking:o.light_blocking,shadow_casting:o.shadow_casting};
    },destroy(){disposed=true;events.abort();editors.delete(api);layer.remove();inputLayer.remove();panel.remove();}};
  editors.add(api);draw();void refresh();return api;
}

window.openArcaneObjectLibrary=async id=>{
  await openMapAreaEditor(id);document.querySelector('#mapAreaEditor [data-mode-button="objects"]')?.click();
};
window.syncArcaneMapObjects=(id,force)=>{if(force)return Promise.all([...editors].filter(e=>e.live&&e.map.id===id).map(e=>e.refresh(true)));};
window.renderArcaneMapObjects=()=>{for(const editor of editors)if(editor.live)editor.draw();};
window.getArcaneMapObjectRuntimeData=id=>[...editors].map(e=>e.runtime(id)).find(Boolean)??null;
