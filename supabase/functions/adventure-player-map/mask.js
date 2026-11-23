// Pixel-center scan conversion. Concealed regions take precedence in overlaps.
function vertices(area) {
  const d=area.shape_data;
  return area.shape_type==='rect'
    ? [[d.x,d.y],[d.x+d.width,d.y],[d.x+d.width,d.y+d.height],[d.x,d.y+d.height]]
    : d.points;
}
export function redactRaster(image,areas) {
  const {width,height,data}=image;
  const mask=new Uint8Array(width*height);
  for(const reveal of [true,false]){
    for(const area of areas){
      if(area.explored!==reveal)continue;
      const points=vertices(area);
      if(!Array.isArray(points)||points.length<3||points.some(p=>p.length!==2||!p.every(Number.isFinite)))throw Error('Invalid area');
      const ys=points.map(p=>p[1]);
      const start=Math.max(0,Math.ceil(Math.min(...ys)-.5));
      const end=Math.min(height,Math.ceil(Math.max(...ys)-.5));
      for(let y=start;y<end;y++){
        const crossings=[],line=y+.5;
        for(let i=0,j=points.length-1;i<points.length;j=i++){
          const [x1,y1]=points[i],[x2,y2]=points[j];
          if((y1>line)!==(y2>line))crossings.push(x1+(line-y1)*(x2-x1)/(y2-y1));
        }
        crossings.sort((a,b)=>a-b);
        for(let i=0;i+1<crossings.length;i+=2){
          const left=Math.max(0,Math.ceil(crossings[i]-.5)),right=Math.min(width,Math.ceil(crossings[i+1]-.5));
          if(right>left)mask.fill(Number(reveal),y*width+left,y*width+right);
        }
      }
    }
  }
  for(let i=0;i<mask.length;i++)if(!mask[i]){
    const offset=i*4;data[offset]=data[offset+1]=data[offset+2]=0;data[offset+3]=255;
  }
  return image;
}
