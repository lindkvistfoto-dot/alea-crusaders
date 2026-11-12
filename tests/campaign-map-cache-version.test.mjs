import {readFileSync} from 'node:fs';
import {test,expect} from 'vitest';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('campaign map CSS and runtime use refreshed asset URLs',()=>{
 expect(html).toContain('features/map/triptych.css?v=20261108-campaign-aspect-live-1');
 expect(html).toContain('legacy/app.js?v=20261112-arcane-spelmoete-v2');
});
