import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx={};vm.runInNewContext(readFileSync(new URL('../features/ui/arcane-geometry-engine.js',import.meta.url),'utf8'),ctx);
const e=ctx.aleaArcaneGeometryEngine;
const rows=[[1],[2],[1,2],[2,1],[1,2,1],[1,2,3],[1,2,2,1],[2,3,2],[1,2,3,2,1]];
describe('Arcane Geometry Engine',()=>{
 for(const pattern of rows)it('constructs connected '+pattern.join('-'),()=>{const cells=e.fromRows(pattern);expect(cells).toHaveLength(pattern.reduce((a,b)=>a+b,0));expect(e.validate(cells).valid).toBe(true)});
 it('all six rotations preserve grid positions and adjacency',()=>{const original=e.fromRows([1,2,3,2,1]);for(let steps=0;steps<6;steps++){const rotated=e.transform(original,{steps});expect(e.validate(rotated).valid).toBe(true);expect(rotated).toHaveLength(9)}expect(JSON.stringify(e.transform(original,{steps:6}))).toBe(JSON.stringify(original))});
 it('reflection preserves connectivity',()=>{expect(e.validate(e.transform(e.fromRows([1,2,3]),{mirror:true})).valid).toBe(true)});
 it('orthographic projection preserves projected hex size at all depths',()=>{const g=e.geometry([1,2,3,2,1]);const size=f=>({width:Math.max(...f.points.map(p=>p.x))-Math.min(...f.points.map(p=>p.x)),height:Math.max(...f.points.map(p=>p.y))-Math.min(...f.points.map(p=>p.y))});const first=size(g.faces[0]);for(const face of g.faces){const d=size(face);expect(d.width).toBeCloseTo(first.width,10);expect(d.height).toBeCloseTo(first.height,10)}});
 it('SVG exports without any painted background',()=>{const svg=e.svg([1,2,1]);expect(svg).toContain('<svg');expect(svg).not.toMatch(/<rect|checkerboard|background-color/);expect((svg.match(/<circle/g)||[])).toHaveLength(4)});
 it('renders 3D side walls only at outer boundaries',()=>{const svg=e.svg([1,2,1]);expect((svg.match(/<polygon/g)||[]).length).toBeGreaterThan(4);expect(svg).toContain('#806039')});
 it('QA proves equal projected dimensions and exact spacing for all presets',()=>{for(const rows of Object.values(e.PATTERNS)){for(let steps=0;steps<6;steps++){const a=e.audit(rows,{steps,camera:{elevationDegrees:55}});expect(a.valid).toBe(true);expect(a.maxWidthError).toBeLessThan(1e-10);expect(a.maxHeightError).toBeLessThan(1e-10);expect(a.maxSpacingError).toBeLessThan(1e-10);expect(a.outerEdges).toBe(6*a.count-2*a.sharedPairs)}}});
 it('rejects disconnected formations',()=>{expect(e.validate([{q:0,r:0},{q:4,r:4}]).valid).toBe(false)});
});
