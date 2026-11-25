import {areaPoints,hitPolygons} from './polygon-edit-geometry.js';

export function roomInstances(area,rows,areas=[area]){
  const parts=area.location_id?areas.filter(a=>a.location_id===area.location_id):[area];
  const shapes=parts.map(a=>({id:a.id,points:areaPoints(a)}));
  return rows.filter(row=>hitPolygons([Number(row.x),Number(row.y)],shapes).length);
}

// Transform the target hex center into the object's local map coordinates.
export function containsObjectPoint(row,size,[mapX,mapY]){
  if(!size)return false;
  const x=mapX-Number(row.x),y=mapY-Number(row.y);
  const angle=Number(row.rotation)*Math.PI/180;
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return Math.abs(x*cos+y*sin)<=size.width/2 && Math.abs(y*cos-x*sin)<=size.depth/2;
}

// Clip a center-to-center movement segment against the rotated physical rectangle.
export function intersectsObjectStep(row,size,from,to){
  if(!size)return false;
  const angle=Number(row.rotation)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const local=([x,y])=>[(x-row.x)*c+(y-row.y)*s,(y-row.y)*c-(x-row.x)*s];
  const a=local(from),b=local(to);
  let enter=0,leave=1;
  for(const [axis,half] of [[0,size.width/2],[1,size.depth/2]]){
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-9){if(Math.abs(a[axis])>half)return false;continue;}
    const t1=(-half-a[axis])/d,t2=(half-a[axis])/d;
    enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
  }
  return enter<=leave;
}

export function renderRoomObjects(host,rows,definition,change,{loaded,pending,error}){
  if(!host?.isConnected)return;
  const heading=document.createElement('h4');heading.textContent='Objekt i rummet';
  const content=document.createDocumentFragment();content.append(heading);
  const counts=new Map();
  for(const row of rows){
    const name=definition(row.object_definition_id)?.name||'Objekt';
    counts.set(name,(counts.get(name)||0)+1);
  }
  const seen=new Map();
  for(const row of rows){
    const name=definition(row.object_definition_id)?.name||'Objekt';
    const n=(seen.get(name)||0)+1;seen.set(name,n);
    const group=document.createElement('fieldset'),legend=document.createElement('legend');
    group.dataset.roomObject=row.id;legend.textContent=name+(counts.get(name)>1?' · '+n:'');group.append(legend);
    for(const [field,label] of [['player_visible','Synlig för spelare'],['movement_blocking','Solid']]){
      const control=document.createElement('label'),input=document.createElement('input');
      input.type='checkbox';input.checked=row[field]===true;input.dataset.roomFlag=field;input.disabled=pending;
      input.onchange=()=>change(row.id,field,input.checked);
      control.append(input,document.createTextNode(label));
      if(field==='movement_blocking')control.title='Blockerar figurplacering på objektets yta';
      group.append(control);
    }
    content.append(group);
  }
  if(error||!rows.length){
    const note=document.createElement('p');note.setAttribute('role','status');
    note.textContent=error||(loaded?'Inga placerade objekt i rummet.':'Hämtar objekt…');content.append(note);
  }
  const focused=host.contains(document.activeElement)?document.activeElement:null;
  host.replaceChildren(content);
  if(focused?.dataset.roomFlag){
    host.querySelector('[data-room-object="'+CSS.escape(focused.closest('fieldset').dataset.roomObject)+'"] [data-room-flag="'+focused.dataset.roomFlag+'"]')?.focus({preventScroll:true});
  }
}
