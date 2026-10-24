import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../features/combat/paper-doll-map.js',import.meta.url),'utf8');
it('loads race poses only after the system asset loader is ready',()=>{
 expect(source).toContain('loadPublishedRacePoses();');
 expect(source).toContain('publication_status=eq.published&is_active=eq.true');
});
it('keeps player characters excluded from racial inheritance',()=>{
 expect(source).toContain("actor?.source_type==='character'");
 expect(source).toContain('catalog.resolveHierarchy(');
});
it('requires verified race pose storage paths',()=>{
 expect(source).toContain('race-battle-pose-cutout');
 expect(source).toContain('racePoseRows=new Map()');
});
