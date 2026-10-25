import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/combat/astrid-paper-doll.css',import.meta.url),'utf8');
it('renders a non-interactive guide using actual route hex centers',()=>{
 expect(js).toContain('...previewRoute.path');
 expect(js).toContain("byCoord.get(step.q+','+step.r)");
 expect(js).toContain('class="yellow-brick-road-line"');
 expect(js).toContain('terrain+roadLine+areasOverlay+magicTargetOverlay+tokens');
 expect(css).toContain('.yellow-brick-road-line');
});
it('distinguishes far reachable cells from the highlighted route',()=>{
 expect(css).toContain('.move-action-spent:not(.yellow-brick-road)');
 expect(css).toContain('.move-action-kept:not(.yellow-brick-road)');
 expect(css).toContain('.yellow-brick-road.move-preview');
});
