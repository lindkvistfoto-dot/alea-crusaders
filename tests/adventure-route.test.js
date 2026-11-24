import {describe,it,expect} from 'vitest';
import {adventureGrid,adventureRoute,hexCenter} from '../features/map/adventure-hex.js';
import {intersectsObjectStep} from '../features/map/room-objects.js';

const map={width:340,height:260};
const neighbors=(q,r)=>[[q+1,r],[q-1,r],[q,r+1],[q,r-1],[q+1,r-1],[q-1,r+1]];
const dist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q-b.q+a.r-b.r));
function plan(grid,start,end,{objects=()=>false,occupied=[],budget=Infinity}={}){
  const search=adventureRoute(map,grid,start,end,new Set(occupied),objects,budget,neighbors,dist);
  let result;do{result=search.next();}while(!result.done);
  return result.value;
}
describe('transport on the adventure map',()=>{
  const start={q:2,r:4},goal={q:6,r:4};
  const grid=config=>adventureGrid(map,{pixelsPerMeter:12,...config});
  it('reuses calibrated axial centers, respects occupancy and charges only traveled steps',()=>{
    const g=grid({}),route=plan(g,start,goal,{occupied:['4,4']});
    expect(route).toHaveLength(5);
    expect(route.map(c=>[c.x,c.y])).toEqual(route.map(c=>hexCenter(g,c.q,c.r)));
    expect(plan(g,start,goal,{budget:4,occupied:['4,4']})).toBeNull();
    expect(plan(g,start,goal,{budget:4})).toHaveLength(4);
  });
  it('cannot tunnel across a thin wall or a closed door between two free centers',()=>{
    const g=grid({geometry:[{points:[[115,0],[115,260]],closed:false,movement:true}]});
    expect(plan(g,start,goal)).toBeNull();
    const narrow={x:115,y:120,rotation:3};
    const blocks=(a,b)=>intersectsObjectStep(narrow,{width:.2,depth:400},a,b);
    expect(plan(grid({}),start,goal,{objects:blocks})).toBeNull();
    expect(plan(grid({}),start,goal)).toHaveLength(4);
  });
  it('observes painted barriers along the entire segment',()=>{
    const width=170,height=130,runs=[];
    for(let y=0;y<height;y++)runs.push([y*width,57],[y*width+58,width-58]);
    expect(plan(grid({freeSight:{width,height,runs}}),start,goal)).toBeNull();
  });
});
