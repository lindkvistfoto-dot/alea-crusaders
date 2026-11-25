// The adventure page owns the painted surface, projection and camera. The
// embedded document draws interactive tactical SVG in the same coordinates.
export function connectEncounterCamera(context) {
  const root=document.documentElement;
  root.classList.add('adventure-tactical-overlay');
  const viewport=context.viewport;
  const shell=document.getElementById('combatBody');
  const geometry=combatRuntimeGeometry;
  window.combatRuntimeGeometry=()=>{
    const base=geometry(),grid=context.grid;
    return base && grid ? {...base,size:grid.size,xPitch:grid.width,rowPitch:grid.pitch,
      rows:base.height/grid.pitch,offsetX:0,offsetY:0} : base;
  };
  window.combatMapViewBox=()=>{
    const {x,y,width,height,scale}=context.camera();
    return {x:-x/scale,y:-y/scale,width:width/scale,height:height/scale};
  };
  window.combatMapEnsureView=()=>{};
  window.combatMapResetView=context.center;
  const originalMove=combatMapPointerMove,originalEnd=combatMapPointerEnd;
  const pointers=new Map();
  let dragged=false;
  function midpoint(){
    const [a,b]=pointers.values();
    return b ? {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)} : a;
  }
  window.combatMapWheel=event=>{
    event.preventDefault();
    context.zoom(event.deltaY<0?1.12:1/1.12,event.clientX,event.clientY);
  };
  window.combatMapPointerDown=event=>{
    if(event.button!==0 || combatMovementDrag)return;
    combatMapLastPointerType=event.pointerType;
    if(!pointers.size)dragged=false;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
    const id=event.target.closest('[data-token-id]')?.dataset.tokenId;
    if(id)context.select(combatants.find(actor=>actor.id===id)?.source_instance_key);
  };
  window.combatMapPointerMove=event=>{
    if(combatMovementDrag)return originalMove(event);
    const pointer=pointers.get(event.pointerId);
    if(!pointer)return;
    const before=midpoint();
    if(!dragged && pointers.size===1 && Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)<=5)return;
    dragged=true;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{...pointer,x:event.clientX,y:event.clientY});
    const after=midpoint();
    if(before.d && after.d)context.zoom(after.d/before.d,before.x,before.y);
    context.pan(after.x-before.x,after.y-before.y);
    combatMapSuppressClickUntil=Date.now()+350;
  };
  window.combatMapPointerEnd=event=>{
    pointers.delete(event.pointerId);
    if(combatMovementDrag)originalEnd(event);
  };
  window.addEventListener('blur',()=>pointers.clear());
  shell.addEventListener('click',event=>{
    if(dragged && Date.now()<combatMapSuppressClickUntil && event.target.closest('.combat-map-svg')){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  function layout(){
    const work=viewport.closest('.mapworkarea');
    const style=getComputedStyle(work);
    root.style.setProperty('--encounter-tracks',style.gridTemplateColumns);
    root.style.setProperty('--encounter-gap',style.columnGap);
    root.style.setProperty('--encounter-map-height',viewport.offsetHeight+'px');
    window.combatMapApplyView();
    context.height(Math.ceil(shell.getBoundingClientRect().height));
  }
  const resize=new ResizeObserver(layout);
  resize.observe(viewport);resize.observe(shell);
  window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
  return layout;
}
