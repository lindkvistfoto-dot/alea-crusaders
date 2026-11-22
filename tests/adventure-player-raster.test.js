import { describe,it,expect } from 'vitest';
import { redactRaster } from '../supabase/functions/adventure-player-map/mask.js';
function raster(areas){
 const pixels={width:8,height:6,data:new Uint8Array(8*6*4).fill(171)};
 redactRaster(pixels,areas);
 return (x,y)=>[...pixels.data.slice((y*8+x)*4,(y*8+x)*4+4)];
}
const room={explored:true,shape_type:'rect',shape_data:{x:1,y:1,width:5,height:4}};
const closed={explored:false,shape_type:'polygon',shape_data:{points:[[3,2],[7,2],[7,5],[3,5]]}};
describe('protected adventure raster',()=>{
 it('discards all original channels outside discovery, including transparent RGB',()=>{
  const read=raster([room]);expect(read(0,0)).toEqual([0,0,0,255]);expect(read(2,2)).toEqual([171,171,171,171]);
 });
 it('conceals overlapping rooms regardless of draw order',()=>{
  for(const shapes of [[room,closed],[closed,room]])expect(raster(shapes)(4,3)).toEqual([0,0,0,255]);
 });
 it('fails closed if an invalid concealed shape cannot be evaluated',()=>{
  expect(()=>raster([room,{...closed,shape_data:{points:[]}}])).toThrow();
 });
});
