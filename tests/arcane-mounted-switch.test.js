import {it,expect} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const runtime=read('features/combat/runtime.js').toString();
const css=read('features/combat/mobile-simplify.css').toString();
it('ships all four optimized Arcane mounted switch image layers',()=>{
 for(const name of ['panel','pointer','gem-on','gem-off']){
  const path='assets/arcane-mounted-switch/'+name+'.webp';
  const bytes=read(path);
  expect(bytes.subarray(0,4).toString()).toBe('RIFF');
  expect(bytes.subarray(8,12).toString()).toBe('WEBP');
  expect(statSync(new URL('../'+path,import.meta.url)).size).toBeGreaterThan(1000);
  expect(runtime).toContain(name+'.webp');
 }
});
it('uses a fixed shared axle and distinct walking/mounted angles',()=>{
 expect(runtime).toContain('hubX:83.8876,hubY:48.24');
 expect(runtime).toContain('pivotX:73.48,pivotY:49.04');
 expect(css).toContain('left:83.8876%;top:48.24%');
 expect(css).toContain('translate(-73.48%,-49.04%)');
 expect(css).toContain('rotate(43deg)');
 expect(css).toContain('rotate(-51deg)');
 expect(runtime).toContain("mode==='mounted'?'1':'0'");
 expect(runtime).toContain("gem-'+(lit?'on':'off')+'.webp");
});
it('does not regress the browser runtime syntax',()=>{
 expect(()=>new Function(runtime)).not.toThrow();
});
