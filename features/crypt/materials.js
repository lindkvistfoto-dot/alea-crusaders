// Materials are generated once at intrinsic map scale. No GM-only floor plan or actor is baked in.
export function sheet(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function stoneNoise(ctx, width, height, seed) {
  const rnd = random(seed);
  const frequency = [5, 17, 51];
  const layers = frequency.map(size => {
    const nx = Math.ceil(width / size) + 1;
    const ny = Math.ceil(height / size) + 1;
    const values = Float32Array.from({ length: nx * ny }, () => rnd() - .5);
    return {size, nx, values};
  });
  const image = ctx.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = 4 * (y * width + x);
    let grain = (rnd() - .5) * 9;
    for (const {size, nx, values} of layers) {
      const xx = x / size, yy = y / size;
      const i = Math.floor(yy) * nx + Math.floor(xx);
      const fx = xx % 1, fy = yy % 1;
      grain += 13 * ((values[i] * (1-fx) + values[i+1] * fx) * (1-fy) +
        (values[i+nx] * (1-fx) + values[i+nx+1] * fx) * fy);
    }
    for (let rgb = 0; rgb < 3; rgb++) image.data[at+rgb] += grain;
  }
  ctx.putImageData(image, 0, 0);
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function pavement(width, height) {
  const result = sheet(width, height), ctx = result.getContext('2d'), rnd = random(76812);
  ctx.fillStyle = '#252a2c'; ctx.fillRect(0, 0, width, height);
  let y = -18;
  while (y < height) {
    const h = 24 + Math.round(rnd()*19);
    let x = -Math.round(79*rnd());
    while (x < width) {
      const w = Math.round(28+rnd()*46);
      const grey = Math.floor(64 + 22*rnd()), chip = 1.4+rnd()*3;
      const tile = [[x+2,y+3],[x+chip+3,y+1],[x+w-4,y+1],[x+w-1,y+3],
        [x+w-1,y+h-4],[x+w-chip,y+h-1],[x+3,y+h-1],[x+1,y+h-3]];
      ctx.beginPath();tile.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();
      ctx.fillStyle = 'rgb('+[grey, grey+3, grey+1].join(',')+')'; ctx.fill();
      line(ctx,tile.slice(0,4),'#c2baa14a',1);
      line(ctx,tile.slice(3,7),'#141b20a6',1.4);
      if (rnd()>.45) {
        const px=x+w*(.18+.67*rnd()), py=y+h*(.14+.66*rnd());
        line(ctx,[[px,py],[px+3,py+2],[px+6,py+1],[px+9,py+4]],'#25292169',.65);
      }
      for(let i=0;i<6;i++){
        const px=x+w*rnd(),py=y+h*rnd();
        ctx.fillStyle=rnd()>.55?'#c8bfa940':'#151d1d49';
        ctx.fillRect(px,py,rnd()*2+.3,rnd()+.3);
      }
      x+=w;
    }
    y+=h;
  }
  stoneNoise(ctx,width,height,5659);
  return result;
}

function seal(ctx, x, y, radius) {
  ctx.save();ctx.translate(x,y);
  const ring=(r,color,width)=>{
    ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  };
  ring(radius,'#202a2ba8',4);ring(radius-1,'#bba78480',.9);
  ring(radius-6,'#292d29b5',2);ring(radius-7,'#cab98c58',1);
  ring(radius*.71,'#ab986f77',.8);
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16, vx=Math.cos(angle),vy=Math.sin(angle);
    line(ctx,[[vx*(radius-3),vy*(radius-3)],[vx*(radius-6),vy*(radius-6)]],'#d1bd8c73',.85);
  }
  for(let i=0;i<8;i++){
    ctx.save();ctx.rotate(i*Math.PI/4);
    const reach=radius*(i%2?.53:.78);
    ctx.beginPath();ctx.moveTo(0,-reach);ctx.lineTo(radius*.095,0);ctx.lineTo(0,-radius*.09);
    ctx.lineTo(-radius*.095,0);ctx.closePath();ctx.fillStyle='#5c5d4e';ctx.fill();
    line(ctx,[[0,-reach],[-radius*.095,0],[0,-radius*.09]],'#b9a98280',.9);
    ctx.restore();
  }
  ring(radius*.13,'#201f1d',3);ring(radius*.13,'#b8a67f80',1);
  ctx.restore();
}

function wallSection(ctx, wall, style) {
  const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,len=Math.hypot(dx,dy);
  if(!len)return;
  const lift=style==='flat'?0:style==='high'?13:5, rim=style==='flat'?6:13;
  ctx.save();
  ctx.translate(wall.x1,wall.y1);ctx.rotate(Math.atan2(dy,dx));
  const localX=lift*dy/len,localY=lift*dx/len;
  ctx.shadowColor='#030607bd';ctx.shadowBlur=lift*.6+1;
  ctx.shadowOffsetY=lift*.55;ctx.fillStyle='#151a1b';
  ctx.fillRect(-1,-rim/2,len+2,rim);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  // The side is displaced towards screen south while the planimetric cap stays on its line.
  if(lift) {
    ctx.fillStyle='#363a36';ctx.beginPath();ctx.moveTo(0,-rim/2);ctx.lineTo(len,-rim/2);
    ctx.lineTo(len+localX,-rim/2+localY);ctx.lineTo(len+localX,rim/2+localY);
    ctx.lineTo(localX,rim/2+localY);ctx.lineTo(0,rim/2);ctx.fill();
  }
  const joints=Math.max(1,Math.ceil(len/25)),pitch=len/joints;
  for(let i=0;i<joints;i++){
    const x=i*pitch, v=Math.floor(68+11*Math.sin(wall.x1*.2+wall.y1*.03+i*2.7));
    const edge=ctx.createLinearGradient(0,-rim/2,0,rim/2);
    edge.addColorStop(0,'#9e9c88');edge.addColorStop(.16,'rgb('+[v+22,v+25,v+20].join(',')+')');
    edge.addColorStop(.79,'rgb('+[v+1,v+5,v+1].join(',')+')');edge.addColorStop(1,'#363d3a');
    ctx.fillStyle=edge;ctx.fillRect(x+.5,-rim/2+.5,Math.max(.6,pitch-1),rim-1);
    line(ctx,[[x+1,-rim/2+1],[x+4,-rim/2+2],[x+pitch*.67,-rim/2+1]],'#d3c7a53a',.9);
    if(i%3===1)line(ctx,[[x+pitch*.5,-rim*.48],[x+pitch*.42,-rim*.18],[x+pitch*.52,0]],'#343a3466',.75);
  }
  ctx.restore();
}

function drawTable(ctx,obj) {
  const {x,y,width:w,height:h}=obj;
  ctx.save();ctx.translate(x,y);
  ctx.shadowColor='#000b';ctx.shadowBlur=4;ctx.shadowOffsetY=3;
  ctx.fillStyle='#33291f';ctx.fillRect(0,0,w,h);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  for(let i=0;i<5;i++){
    const plank=ctx.createLinearGradient(0,i*h/5,0,(i+1)*h/5);
    plank.addColorStop(0,'#978268');plank.addColorStop(.15,i%2?'#705b45':'#695641');plank.addColorStop(1,'#493a2e');
    ctx.fillStyle=plank;ctx.fillRect(1,i*h/5+.4,w-2,h/5-.8);
    for(let k=0;k<3;k++)line(ctx,[[3,i*h/5+1+k],[w*.38,i*h/5+2+k],[w-3,i*h/5+1.4+k]],'#b9a37838',.65);
  }
  for(const px of [3,w-4]) for(const py of [3,h-4]){
    ctx.fillStyle='#252b28';ctx.fillRect(px,py,2,2);
  }
  ctx.restore();
}

function grid(ctx, pitch, width, height) {
  const rad=pitch/Math.sqrt(3),row=rad*1.5;
  ctx.beginPath();
  for(let r=-1;r<height/row+1;r++)for(let q=-1;q<width/pitch+1;q++){
    const x=(q+(r%2)*.5)*pitch,y=r*row;
    for(let k=0;k<4;k++){
      const a=(-90+60*k)*Math.PI/180,px=x+rad*Math.cos(a),py=y+rad*Math.sin(a);
      if(k)ctx.lineTo(px,py);else ctx.moveTo(px,py);
    }
  }
  ctx.strokeStyle='#c2bc9550';ctx.lineWidth=.7;ctx.stroke();
}

export function roomMaterials(width,height){
  const stone=pavement(width,height),ctx=stone.getContext('2d');
  // Landscape detail is decorative and clipped to the projection in both views.
  seal(ctx,246,310,86);seal(ctx,744,295,64);
  function floor(projection, options){
    const {floor,walls,objects}=projection;
    const result=sheet(width,height),c=result.getContext('2d');
    const seen=new Path2D(),memory=new Path2D(),unseen=new Path2D();
    for(const tile of floor){
      const target=tile.visibility==='visible'?seen:tile.visibility==='memory'?memory:unseen;
      target.rect(tile.x,tile.y,tile.width,tile.height);
    }
    const paint=(path,shade)=>{
      c.save();c.clip(path);c.drawImage(stone,0,0);
      if(shade){c.fillStyle=shade;c.fillRect(0,0,width,height);}
      if(options.grid)grid(c,1.5*projection.pixelsPerMeter,width,height);
      c.restore();
    };
    paint(unseen,'#101a2366');paint(memory,'#0c1421c5');paint(seen,'#0a141d14');
    walls.forEach(w=>wallSection(c,w,options.wallMode));
    for(const obj of objects)if(obj.id==='table'){
      c.save();
      if(obj.visibility==='memory' && projection.role!=='gm')c.globalAlpha=.38;
      drawTable(c,obj);c.restore();
    }
    return {terrain:result,seen};
  }
  return {floor};
}

export function torchPool(width,height,torch,seen){
  if(!torch?.on||!torch.polygon?.length)return null;
  const result=sheet(width,height),c=result.getContext('2d');
  c.clip(seen);clipPolygon(c,torch.polygon);
  const g=c.createRadialGradient(torch.x,torch.y,1,torch.x,torch.y,Math.max(2,torch.range));
  g.addColorStop(0,'#ffb860b0');g.addColorStop(.24,'#f2a45289');g.addColorStop(.67,'#b26e384b');g.addColorStop(1,'#b66b3300');
  c.fillStyle=g;c.fillRect(0,0,width,height);return result;
}

export function clipPolygon(ctx,points) {
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
}

export function sunShaft(width,height,sun,seen){
  if(!sun?.polygon?.length)return null;
  const result=sheet(width,height),c=result.getContext('2d');c.clip(seen);clipPolygon(c,sun.polygon);
  const xs=sun.polygon.map(p=>p[0]),ys=sun.polygon.map(p=>p[1]);
  const lx=Math.min(...xs),rx=Math.max(...xs),ty=Math.min(...ys),by=Math.max(...ys);
  const grad=c.createLinearGradient(lx,ty,rx,by);grad.addColorStop(0,'#e7d3a049');
  grad.addColorStop(.28,'#efd3a13a');grad.addColorStop(1,'#e7d0aa01');
  c.fillStyle=grad;c.fillRect(lx,ty,rx-lx,by-ty);
  c.save();c.filter='blur(3px)';
  for(let i=0;i<6;i++){
    const u=(i+.3)/6, x=lx+(rx-lx)*u*.4;
    const ribbon=c.createLinearGradient(x,ty,x+(rx-lx)*.65,by);
    ribbon.addColorStop(0,'#f5dfb76b');ribbon.addColorStop(1,'#f8dbac00');
    c.fillStyle=ribbon;c.beginPath();c.moveTo(x,ty);c.lineTo(x+2.8,ty);
    c.lineTo(x+(rx-lx)*.66+8,by);c.lineTo(x+(rx-lx)*.66-1,by);c.fill();
  }
  c.restore();return result;
}

export function doorLeaf(edge=false) {
  const s=sheet(200,30),c=s.getContext('2d');
  const gradient=c.createLinearGradient(0,0,0,30);
  gradient.addColorStop(0,'#ccaa75');gradient.addColorStop(.18,'#8d6b45');gradient.addColorStop(.75,'#634932');gradient.addColorStop(1,'#2b2422');
  c.fillStyle=gradient;c.fillRect(0,0,200,30);
  const rnd=random(801);for(let i=0;i<65;i++){
    const x=rnd()*194,y=rnd()*26;
    line(c,[[x,y],[x+rnd()*11,y+.3],[x+rnd()*22,y+.1]],'#e1c08a4a',rnd()+.4);
  }
  for(const x of [9,42,157,185]){
    c.fillStyle='#252d2d';c.fillRect(x,0,7,30);c.fillStyle='#96938a';c.fillRect(x+.5,1,2,24);
    for(const y of [5,24]){c.fillStyle='#c5a775';c.beginPath();c.arc(x+3,y,1.4,0,2*Math.PI);c.fill();}
  }
  if(edge){
    c.fillStyle='#201d22a8';c.fillRect(0,0,200,30);
    line(c,[[0,28],[200,28]],'#a288677f',1.6);
  }
  return s;
}

export function lightMote(){
  const s=sheet(24,24),c=s.getContext('2d');
  const g=c.createRadialGradient(12,12,0,12,12,12);
  g.addColorStop(0,'#ffffe3');g.addColorStop(.23,'#ffe5a2cd');g.addColorStop(1,'#e8a65000');c.fillStyle=g;c.fillRect(0,0,24,24);return s;
}

export function torchHead(){
  const s=sheet(42,72),c=s.getContext('2d');c.translate(21,63);
  const halo=c.createRadialGradient(0,-22,0,0,-22,32);
  halo.addColorStop(0,'#ffc75ed6');halo.addColorStop(1,'#ef753400');c.fillStyle=halo;c.fillRect(-21,-63,42,71);
  for(const [scale,color] of [[1,'#f16921e6'],[.76,'#ffad40'],[.43,'#fff5b2']]){
    c.save();c.scale(scale,scale);c.fillStyle=color;c.beginPath();c.moveTo(0,0);
    c.bezierCurveTo(-24,-12,-2,-29,-4,-53);c.bezierCurveTo(9,-48,4,-36,11,-31);
    c.bezierCurveTo(26,-13,14,-4,0,0);c.fill();c.restore();
  }
  return s;
}
