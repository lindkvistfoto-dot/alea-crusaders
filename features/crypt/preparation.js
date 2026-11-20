// A divider joins the two existing place IDs to the same calibrated passage.
// Keep the outer room edges fixed when the game master moves the divider.
export function prepareCryptMap(template, {splitX, pixelsPerMeter}) {
  const [west, east] = template.rooms;
  if (!Number.isFinite(splitX) || splitX < 430 || splitX > 570) {
    throw new Error('Lägg delningen inom den markerade delen av gången.');
  }
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) {
    throw new Error('Mät mellan två skilda punkter och ange avståndet i meter.');
  }
  const offset = splitX - template.door.x;
  return {
    ...template,
    pixelsPerMeter,
    rooms: [
      {...west, width: west.width + offset},
      {...east, x: east.x + offset, width: east.width - offset},
    ],
    corridor: {...template.corridor, x: template.corridor.x + offset},
    door: {...template.door, x: splitX, endX: splitX},
  };
}

// Test the cross-section of an occupied HEXAGONIA footprint against the clear
// vertical aperture. Translation centres it for this width-only editor preview.
export function previewDoorFootprint(map, shape, gridApi) {
  const grid = gridApi.geometry(map, {academy_map:true,pixels_per_meter:map.pixelsPerMeter,hex_m:1.5});
  const footprint = gridApi.footprint({q:0,r:0,footprint:{shape}});
  const polygons = footprint.map(({q,r}) => {
    const [x,y]=gridApi.center(grid,q,r);
    return Array.from({length:6},(_,i)=>{
      const angle=(i*60-30)*Math.PI/180;
      return [x+grid.size*Math.cos(angle),y+grid.size*Math.sin(angle)];
    });
  });
  const ys = polygons.flat().map(p=>p[1]);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const middle=(map.door.y+map.door.endY)/2;
  return {
    fits: maxY-minY <= Math.abs(map.door.endY-map.door.y),
    widthM:(maxY-minY)/map.pixelsPerMeter,
    polygons:polygons.map(vertices=>vertices.map(([x,y])=>[x+map.door.x,y+middle-(maxY+minY)/2]))
  };
}
