import './object-library.css';
import {objectCategories} from './object-categories.js';
import {createObjectPicker} from './object-picker.js';
import {roomInstances,renderRoomObjects,containsObjectPoint} from './room-objects.js';
import {adventureCell, adventureGrid} from './adventure-hex.js';
import {mapPointer} from './polygon-edit-geometry.js';
import {objectImageUrls} from './object-images.js';

const svgNS = 'http://www.w3.org/2000/svg';
const editors = new Set();
const cropCache = new Map();
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = value => Number(value).toLocaleString('sv-SE',{maximumFractionDigits:3});
const rpc = (name,args) => dbJson('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
const geometry = () => window.aleaMapObjectGeometry;
function svg(tag,attributes={}) {
  const node=document.createElementNS(svgNS,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}

async function imageBounds(url,key) {
  if(!cropCache.has(key)) {
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
    cropCache.set(key,pending);pending.catch(()=>cropCache.delete(key));
  }
  return cropCache.get(key);
}
async function loadArt(d,url) {
  const crop=d.image_crop;
  // V1 stored pixel crops on a 1254-square master. Its full-canvas default
  // represented an unmeasured image, so resolve alpha bounds in that case.
  const measured=crop?.width && crop?.height && (crop.canvasWidth || crop.x || crop.y || crop.width!==1254 || crop.height!==1254);
  const bounds=measured?{canvasWidth:1254,canvasHeight:1254,...crop}:url?await imageBounds(url,url.split('?')[0]+'|'+(d.image_revision??'')).catch(()=>null):null;
  return {...d,url,bounds,artTime:Date.now()};
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

export function createObjectEditor({map,parent,before,live,manager,getScale,areas=()=>[],onEnter=()=>{},onPick=()=>parent.closest('#mapViewport,#mapAreaCanvas')?.scrollIntoView({block:'nearest'})}) {
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
  const categoryOptions=objectCategories.map(name=>'<option>'+name+'</option>').join('');
  panel.innerHTML='<button type="button" class="btn" data-open-library disabled>Öppna objektbiblioteket</button><label class="living-snap"><input type="checkbox" data-snap> Fäst vid hexcentrum</label><label data-instances hidden>På kartan<select data-instance-picker></select></label><div data-inspector></div><p role="status" aria-live="polite"></p>';
  const inspector=panel.querySelector('[data-inspector]'),instancePicker=panel.querySelector('[data-instance-picker]'),status=panel.querySelector('[role=status]');
  let definitions=new Map(),rows=[],selected=null,armed=null,moving=null,gesture=null,active=false,shown=true;
  let draggedDefinition=null,request=0,pending=false,disposed=false,loaded=false,templateId=null,lastScale;
  let roomHost=null,roomArea=null,roomError='',readError='';
  const events=new AbortController();
  const on=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal:events.signal});
  const notify=message=>{status.textContent=message;};
  const rowById=id=>rows.find(row=>row.id===id);
  const valid=p=>p && p[0]>=0 && p[1]>=0 && p[0]<=map.width && p[1]<=map.height;
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  const pos=e=>mapPointer(e,layer);
  const snap=panel.querySelector('[data-snap]');
  function destination(p){
    if(!valid(p))return null;
    if(!snap.checked)return p;
    const grid=adventureGrid(map,{pixelsPerMeter:getScale()});
    const cell=adventureCell(map,grid,p,[]);
    return cell?[cell.x,cell.y]:null;
  }
  function entry(id) { return definitions.get(id); }
  function available(d) {return d?.url && d.bounds && [d.width_m,d.depth_m,d.height_m].every(n=>Number(n)>0) && getScale()>0;}
  function cancel() {gesture=null;armed=null;moving=null;preview.replaceChildren();}
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
    let selectionOverlay=null;
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
          selectionOverlay=svg('g',{transform:group.getAttribute('transform'),'data-object-hit':row.id});
          selectionOverlay.append(svg('rect',{x:-w/2,y:-h/2,width:w,height:h,class:'living-outline','pointer-events':'none'}));
          if(!row.locked){
            const screen=layer.getScreenCTM();
            const r=(matchMedia('(pointer:coarse)').matches?10:7)/(Math.hypot(screen?.a||1,screen?.b||0)||1);
            selectionOverlay.append(svg('line',{x1:0,x2:0,y1:-h/2,y2:-h/2-2*r,class:'living-outline'}));
            for(const [action,x,y] of [['rotate',0,-h/2-2*r],['scale',w/2,h/2]])
              selectionOverlay.append(svg('circle',{cx:x,cy:y,r,'data-handle':action,class:'living-handle','pointer-events':'all'}));
          }
        }
      }
      pieces.append(group);
    }
    if(selectionOverlay)hitTargets.append(selectionOverlay);
  }
  function ghost(p) {
    preview.replaceChildren();
    p=destination(p);
    if(!armed||!p)return;
    const d=entry(armed),row=rowById(moving);
    const art=objectArt(d,{x:p[0],y:p[1],rotation:row?.rotation??d.default_rotation??0,scale_factor:row?.scale_factor??1},getScale());
    if(art)preview.append(art.group);
  }
  const button=(action,label)=>'<button type="button" class="btn" data-command="'+action+'">'+label+'</button>';
  const input=(key,label,value,options='')=>'<label>'+label+'<input type="number" data-value="'+key+'" value="'+escape(value)+'" '+options+'></label>';
  function list(){
    picker?.setArmed(armed);
    instancePicker.parentElement.hidden=!rows.length;
    instancePicker.replaceChildren(new Option('Välj placerat objekt',''),...rows.slice().reverse().map(row=>{
      const d=entry(row.object_definition_id);
      return new Option((d?.name||'Objekt')+' · '+format(row.x)+', '+format(row.y)+(row.player_visible?'':' · dold'),row.id);
    }));
    instancePicker.value=selected||'';
  }
  function updateRoom(){
    if(roomArea&&roomHost?.isConnected)renderRoomObjects(roomHost,roomInstances(roomArea,rows,areas()),entry,
      (id,key,value)=>save('edit',id,{[key]:value},true),{loaded,pending,error:roomError||readError});
  }
  function inspect(){
    instancePicker.value=selected||'';
    const obj=rowById(selected),d=entry(templateId);
    if(d){
      const battle=!!d.battle_object_key;
      inspector.innerHTML='<fieldset><legend>'+escape(d.name)+' · objektmall</legend>'+
        '<label>Kategori<select data-template-category>'+categoryOptions+'</select></label><div class="living-fields">'+
        input('width_m','Längd (m)',d.width_m,'min=".001" step=".001"')+input('depth_m','Bredd (m)',d.depth_m,'min=".001" step=".001"')+
        input('height_m','Höjd (m)',d.height_m,'min=".001" step=".001"')+input('max_bep','Max BEP',d.max_bep,'min="0" step="1" '+(battle?'disabled':''))+
        '</div><label>Beskrivning<textarea data-description '+(battle?'disabled':'')+'>'+escape(d.description)+'</textarea></label>'+
        (battle?'<small>Beskrivning och Max BEP hämtas från Battle Library.</small>':'')+button('template','Spara mall')+
        (!d.campaign_id?'<details><summary>Skapa kampanjmall</summary><label>Namn på kampanjmallen<input type="text" data-copy-name></label>'+button('campaign-copy','Skapa i aktuell kampanj')+'</details>':'')+'</fieldset>';
      inspector.querySelector('[data-template-category]').value=d.library_category;
      return;
    }
    if(armed||!obj){inspector.innerHTML=armed?button('cancel','Avbryt placering'):'';return;}
    const def=entry(obj.object_definition_id),scale=Number(obj.scale_factor),lock=obj.locked?' disabled':'';
    inspector.innerHTML='<fieldset><legend>'+escape(def?.name)+'</legend><p>'+[def.width_m,def.depth_m,def.height_m].map(n=>format(n*scale)).join(' × ')+' m</p><div class="living-fields">'+
      input('rotation','Rotation (°)',obj.rotation,'step="any"'+lock)+input('scale_factor','Skala (%)',Number((scale*100).toFixed(3)),'min=".001" step="any"'+lock)+
      input('max_bep','Max BEP',obj.max_bep,'min="0" step="1"')+input('current_bep','Aktuell BEP',obj.current_bep,'min="0" step="1"')+
      '</div>'+button('values','Spara värden')+'<div class="living-actions">'+
      (obj.locked?'':button('move','Flytta'))+[['back','Längst bak'],['backward','Bakåt'],['forward','Framåt'],['front','Längst fram'],['duplicate','Duplicera'],['lock',obj.locked?'Lås upp':'Lås position'],
       ['visibility',obj.player_visible?'Dölj för spelare':'Visa för spelare'],['remove','Ta bort från kartan']].map(([k,v])=>button(k,v)).join('')+'</div>'+
      '<details><summary>Objektegenskaper</summary>'+[['movement_blocking','Blockerar rörelse'],['light_blocking','Blockerar ljus'],['shadow_casting','Kastar skugga']].map(([k,v])=>'<label><input type="checkbox" data-flag="'+k+'" '+(obj[k]?'checked':'')+'> '+v+'</label>').join('')+'</details></fieldset>';
  }
  const table='arcane_object_definitions';
  async function loadCatalog(){
    const all=[],pageSize=200;
    const fields='id,name,active,campaign_id,library_category,object_type,image_asset_key,image_revision,image_crop,width_m,depth_m,height_m,default_rotation';
    for(let offset=0;;offset+=pageSize){
      const batch=await dbJson(table+'?select='+fields+'&active=eq.true&or=(campaign_id.is.null,campaign_id.eq.'+encodeURIComponent(map.campaign_id)+')&order=name,id&limit='+pageSize+'&offset='+offset);
      all.push(...batch);
      if(disposed||batch.length<pageSize)return all;
    }
  }
  function freshArt(d){
    const old=entry(d.id);
    return old?.url&&old.bounds&&old.image_asset_key===d.image_asset_key&&old.image_revision===d.image_revision&&
      JSON.stringify(old.image_crop)===JSON.stringify(d.image_crop)&&Date.now()-old.artTime<1200000;
  }
  async function prepare(items,ready,current){
    const missing=items.filter(d=>!freshArt(d));
    const urls=missing.length?await objectImageUrls(missing):new Map();
    // Bound full-resolution alpha scans, particularly on mobile.
    for(let i=0;i<items.length&&current();i+=3){
      await Promise.all(items.slice(i,i+3).map(async d=>{
        const old=entry(d.id);
        const art=freshArt(d)?{...old,...d}:await loadArt(d,urls.get(d.image_asset_key)||'');
        if(current()){definitions.set(d.id,art);ready(art);}
      }));
    }
  }
  async function placedDefinitions(objects,reload){
    const ids=[...new Set(objects.map(o=>o.object_definition_id))],found=[];
    const needed=ids.filter(id=>reload||!entry(id));
    for(let i=0;i<needed.length;i+=60){
      found.push(...await dbJson(table+'?select=*&id=in.('+needed.slice(i,i+60).map(encodeURIComponent).join(',')+')'));
    }
    return [...found,...ids.filter(id=>!needed.includes(id)).map(entry)];
  }
  async function editTemplate(d){
    if(!d||!active||pending)return;
    cancel();selected=null;templateId=d.id;draw();inspector.replaceChildren();notify('Hämtar mall…');
    try{
      const [full]=await dbJson(table+'?select=*&id=eq.'+encodeURIComponent(d.id));
      if(disposed||!active||templateId!==d.id)return;
      if(!full)throw Error('Objektmallen saknas.');
      definitions.set(d.id,{...entry(d.id),...full});inspect();notify('');
    }catch(error){if(!disposed&&templateId===d.id){templateId=null;inspect();notify(error.message);}}
  }
  const picker=manager?createObjectPicker({map,opener:panel.querySelector('[data-open-library]'),canEdit:!live&&activeUser()?.admin,
    loadCatalog,prepare,available,pick,showMap:onPick,edit:editTemplate,
    drag(id,transfer){if(!active||pending||!available(entry(id)))return;cancel();draggedDefinition=id;armed=id;templateId=null;selected=null;transfer.setData('application/x-alea-map-object',id);transfer.effectAllowed='copy';draw();},
    endDrag(){draggedDefinition=null;cancel();draw();list();inspect();}
  }):null;
  async function refresh(reloadCatalog=false) {
    const version=++request,current=()=>!disposed&&request===version;
    if(reloadCatalog)picker?.invalidate();
    try {
      const objects=manager?await rpc('read_living_map_objects',{p_map_id:map.id,p_live:live}):await rpc('read_adventure_player_objects',{p_map_id:map.id});
      if(!current())return;
      const fresh=manager?await placedDefinitions(objects,reloadCatalog):[...new Map(objects.map(o=>[o.definition.id,o.definition])).values()];
      if(!current())return;
      if(!manager){
        // Remove revoked instances before starting any image work.
        rows=objects;
        const permitted=new Set(fresh.map(d=>d.id));
        for(const id of definitions.keys())if(!permitted.has(id))definitions.delete(id);
        draw();
      }
      await prepare(fresh,()=>{},current);
      if(!current())return;
      rows=objects;loaded=true;readError='';
      if(selected&&!rowById(selected))selected=null;
      draw();if(manager){list();updateRoom();if(!inspector.contains(document.activeElement))inspect();}
    }catch(error){
      if(!disposed && version===request){
        if(!manager){rows=[];definitions.clear();draw();}
        readError='Objekten kunde inte läsas. '+error.message;notify(readError);updateRoom();
      }
    }
  }
  async function save(action,id,values={},fromRoom=false) {
    if(!manager||pending||disposed)return;
    if(fromRoom){
      if(!live||!adventureCanManage()||!roomHost?.isConnected||!roomInstances(roomArea,rows,areas()).some(o=>o.id===id))return;
    }else if(!active)return;
    roomError='';pending=true;panel.inert=true;updateRoom();notify('Sparar…');
    try{
      const result=await rpc('edit_living_map_object',{p_map_id:map.id,p_live:live,p_action:action,p_id:id,p_values:values});
      if(disposed)return;
      if(!fromRoom)selected=action==='remove'?null:result;
      if(action==='place')picker?.remember(values.definition);
      await refresh();
      inspect();notify('Sparat.');
      for(const other of editors)if(other!==api&&other.map.id===map.id)void other.refresh();
    }catch(error){roomError='Kunde inte spara. '+error.message;notify(roomError);await refresh();}
    finally{pending=false;panel.inert=false;if(!disposed)updateRoom();}
  }
  function pick(id) {
    if(!active||pending||!available(entry(id)))return;
    cancel();selected=null;templateId=null;armed=id;list();inspect();draw();
    notify('Placera '+entry(id).name+' på kartan.');onPick();
  }
  function place(p) {
    p=destination(p);
    if(!armed||!p)return;
    const definition=armed,id=moving;cancel();
    if(id)void save('edit',id,{x:p[0],y:p[1]});
    else void save('place',crypto.randomUUID(),{definition,x:p[0],y:p[1]});
  }
  on(instancePicker,'change',()=>{
    cancel();selected=instancePicker.value||null;templateId=null;inspect();list();draw();notify('');
  });
  on(panel,'click',async e=>{
    const el=e.target.closest('button');if(!el||pending)return;
    const action=el.dataset.command;
    if(!action)return;
    if(action==='cancel'){cancel();inspect();list();notify('');return;}
    const fields=[...inspector.querySelectorAll('[data-value]:enabled')];
    if(['template','campaign-copy','values'].includes(action)&&!fields.every(f=>f.reportValidity()))return;
    const values=Object.fromEntries(fields.map(f=>[f.dataset.value,f.value===''?null:f.valueAsNumber]));
    if(action==='template'||action==='campaign-copy'){
      const d=entry(templateId),copy=action==='campaign-copy';
      values.library_category=inspector.querySelector('[data-template-category]').value;
      if(!d.battle_object_key)values.description=inspector.querySelector('textarea').value;
      if(copy){
        const nameInput=inspector.querySelector('[data-copy-name]');
        if(!nameInput.value.trim()){notify('Ange ett namn på kampanjmallen.');nameInput.focus();return;}
        for(const key of ['object_type','image_asset_key','image_crop','footprint','default_rotation','movement_blocking','light_blocking','shadow_casting'])
          values[key]=d[key];
        const id=crypto.randomUUID();
        Object.assign(values,{id,object_key:'campaign-'+id,campaign_id:map.campaign_id,name:nameInput.value.trim()});
        if(d.battle_object_key)Object.assign(values,{description:d.description,max_bep:d.max_bep});
      }
      try{
        pending=true;panel.inert=true;
        const saved=await dbJson('arcane_object_definitions'+(copy?'':'?id=eq.'+encodeURIComponent(d.id)),{
          method:copy?'POST':'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)});
        if(!saved?.length)throw new Error('Objektmallen kunde inte sparas.');
        if(disposed)return;
        definitions.set(saved[0].id,{...entry(d.id),...saved[0]});
        if(copy){picker.chooseCampaign();templateId=saved[0].id;}
        await refresh(true);inspect();notify(copy?'Kampanjmallen har skapats.':'Objektmallen har sparats.');
        for(const other of editors)if(other!==api)void other.refresh(true);
      }catch(error){notify(error.message);}finally{pending=false;panel.inert=false;}
      return;
    }
    const obj=rowById(selected);if(!obj)return;
    if(action==='move'&&!obj.locked){
      cancel();moving=obj.id;armed=obj.object_definition_id;inspect();notify('Välj objektets nya position på kartan.');onPick();return;
    }
    if(action==='values'){
      if('scale_factor' in values)values.scale_factor/=100;
      const patch=Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==(obj[k]===null?null:Number(obj[k]))));
      if(Object.keys(patch).length)await save('edit',selected,patch);
    } else if(action==='lock')await save('edit',selected,{locked:!obj.locked});
    else if(action==='visibility')await save('edit',selected,{player_visible:!obj.player_visible});
    else await save(action,selected,action==='duplicate'?{new_id:crypto.randomUUID()}:{});
  });
  on(panel,'change',e=>{if(e.target.dataset.flag)void save('edit',selected,{[e.target.dataset.flag]:e.target.checked});});
  function acceptDrag(e){
    if(!active||!draggedDefinition||!e.dataTransfer.types.includes('application/x-alea-map-object'))return;
    stop(e);e.dataTransfer.dropEffect='copy';armed=draggedDefinition;ghost(pos(e));
  }
  on(inputLayer,'dragenter',acceptDrag);
  on(inputLayer,'dragover',acceptDrag);
  on(inputLayer,'drop',e=>{
    if(!active||!draggedDefinition||e.dataTransfer.getData('application/x-alea-map-object')!==draggedDefinition)return;
    stop(e);armed=draggedDefinition;place(pos(e));
  });
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
    else {
      const target=destination([Number(obj.x)+p[0]-start[0],Number(obj.y)+p[1]-start[1]]);
      gesture.patch=target?{x:target[0],y:target[1]}:{};
    }
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
  on(inputLayer,'pointercancel',e=>{if(gesture?.pointer===e.pointerId){cancel();draw();inspect();list();}});
  on(inputLayer,'lostpointercapture',e=>{if(gesture?.pointer===e.pointerId){gesture=null;draw();}});
  on(inputLayer,'pointerleave',()=>preview.replaceChildren());
  on(inputLayer,'click',e=>{if(active)stop(e);});
  on(window,'keydown',e=>{if(active&&e.key==='Escape'){picker?.hide();cancel();selected=null;inspect();draw();list();notify('');}});
  function editing(value){
    value=Boolean(manager&&value);if(active===value)return;
    active=value;panel.querySelector('[data-open-library]').disabled=!active;cancel();selected=null;templateId=null;
    if(active){parent.append(inputLayer);onEnter();}else picker?.hide();
    draw();list();inspect();
  }
  const api={map,live,panel,refresh,draw,editing,get active(){return active;},updateScale(){const scale=getScale();if(scale===lastScale)return;lastScale=scale;draw();if(manager){list();picker?.update();}},show(value){if(value!==shown){shown=value;draw();}},
    openLibrary(){if(active)void picker?.open();},
    closeLibrary(){picker?.hide();},
    room(host,area){if(live&&manager){roomHost=host;roomArea=area;updateRoom();}},
    blocks(point){
      if(!manager)return false;
      if(!loaded||readError)return true;
      return rows.some(row=>{
        if(!row.movement_blocking)return false;
        const size=geometry().pixelSize(entry(row.object_definition_id),getScale()*Number(row.scale_factor));
        return containsObjectPoint(row,size,point);
      });
    },
    runtime(id){
      const o=rowById(id),d=o&&entry(o.object_definition_id);if(!d)return null;
      const scale=Number(o.scale_factor??1),w=d.width_m*scale,h=d.depth_m*scale;
      return {id,definitionId:d.id,position:{x:+o.x,y:+o.y},width_m:w,depth_m:h,height_m:d.height_m*scale,rotation_degrees:+o.rotation,
        footprint:geometry().footprint(w,h,o.rotation),movement_blocking:o.movement_blocking,light_blocking:o.light_blocking,shadow_casting:o.shadow_casting};
    },destroy(){disposed=true;picker?.destroy();roomHost=null;events.abort();editors.delete(api);layer.remove();inputLayer.remove();panel.remove();}};
  on(window,'alea-object-library-changed',()=>{if(manager)void refresh(true);});
  editors.add(api);draw();void refresh();return api;
}

window.openArcaneObjectLibrary=async id=>{
  await openMapAreaEditor(id);
  await window.aleaKartakademin?.openObjects(id);
};
window.syncArcaneMapObjects=(id,force)=>{if(force)return Promise.all([...editors].filter(e=>e.live&&e.map.id===id).map(e=>e.refresh()));};
window.renderArcaneMapObjects=()=>{for(const editor of editors)if(editor.live)editor.draw();};
window.getArcaneMapObjectRuntimeData=id=>[...editors].map(e=>e.runtime(id)).find(Boolean)??null;
