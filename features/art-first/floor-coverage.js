// The encounter remembers 10-unit cells. Only cells cut by a wall or prop need
// extra vertices for drawing. Build these fragments once in map coordinates.
const epsilon = 1e-7;
const round = value => Math.round(value * 1000) / 1000;

function clipRow(polygon, y, keepBelow) {
  const result = [];
  let a = polygon.at(-1);
  for (const b of polygon) {
    const inA = keepBelow ? a[1] >= y : a[1] <= y;
    const inB = keepBelow ? b[1] >= y : b[1] <= y;
    if (inA !== inB) result.push([a[0] + (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]), y]);
    if (inB) result.push(b);
    a = b;
  }
  return result;
}

function area(polygon) {
  let sum = 0;
  let a = polygon.at(-1);
  for (const b of polygon) {
    sum += a[0]*b[1] - b[0]*a[1];
    a = b;
  }
  return Math.abs(sum) / 2;
}

export function paintedFloorCells(map, step, onFloor, edges) {
  const cols = Math.ceil(map.width / step);
  const cuts = new Set(edges.flatMap(([a,b]) => [a[0],b[0]]));
  for (let x=0; x<=map.width; x+=step) cuts.add(x);
  cuts.add(map.width);
  const slopes = edges.filter(([a,b]) => a[0] !== b[0]).map(([a,b]) => {
    const slope = (b[1]-a[1]) / (b[0]-a[0]);
    return {left:Math.min(a[0],b[0]),right:Math.max(a[0],b[0]),slope,offset:a[1]-a[0]*slope};
  });
  // An obstacle can overlap the room outline. Split there before ordering edges.
  for (const [i,a] of slopes.entries()) for (const b of slopes.slice(i+1)) {
    if (Math.abs(a.slope-b.slope) < epsilon) continue;
    const x = (b.offset-a.offset) / (a.slope-b.slope);
    if (x > Math.max(a.left,b.left) && x < Math.min(a.right,b.right)) cuts.add(x);
  }
  const xs = [...cuts].sort((a,b)=>a-b);
  const heightAt = (edge,x) => edge.slope*x + edge.offset;
  const cells = new Map();
  for (let i=1; i<xs.length; i++) {
    const left=xs[i-1], right=xs[i], mid=(left+right)/2;
    if (right-left<epsilon) continue;
    const ordered=slopes.filter(e=>e.left<mid && e.right>mid).sort((a,b)=>heightAt(a,mid)-heightAt(b,mid));
    for (let j=1; j<ordered.length; j++) {
      const top=ordered[j-1], bottom=ordered[j];
      if (!onFloor([mid,(heightAt(top,mid)+heightAt(bottom,mid))/2])) continue;
      const strip=[[left,heightAt(top,left)],[right,heightAt(top,right)],
        [right,heightAt(bottom,right)],[left,heightAt(bottom,left)]];
      const first=Math.floor(Math.min(strip[0][1],strip[1][1])/step);
      const end=Math.ceil(Math.max(strip[2][1],strip[3][1])/step);
      const col=Math.floor(mid/step);
      for (let row=first; row<end; row++) {
        const points=clipRow(clipRow(strip,row*step,true),(row+1)*step,false);
        if (points.length<3) continue;
        const size=area(points);
        if (size<epsilon) continue;
        const key=row*cols+col;
        let cell=cells.get(key);
        if (!cell) {
          cell={x:col*step,y:row*step,key,total:0,largest:0,parts:[]};
          cells.set(key,cell);
        }
        cell.total+=size;
        cell.parts.push(points.flat().map(round));
        if (size>cell.largest) {
          cell.largest=size;
          cell.interior=points.reduce(([x,y],p)=>[x+p[0]/points.length,y+p[1]/points.length],[0,0]);
        }
      }
    }
  }
  return [...cells.values()].sort((a,b)=>a.key-b.key).map(({x,y,key,total,parts,interior})=>{
    const center=[x+step/2,y+step/2];
    if (total>=step*step-epsilon) return {x,y,key,center};
    // New boundary samples use an actual piece of floor for perception.
    return {x,y,key,center:onFloor(center)?center:interior,parts};
  });
}
