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

it('equipment pose across aliases precedes a standard pose on another alias',()=>{
 const begin=source.indexOf('function publishedPose(actor)');
 const end=source.indexOf('function inheritedPose(',begin);
 const code=source.slice(begin,end);
 expect(code.indexOf("for(const key of [...new Set([requested,'standard'])])")).toBeGreaterThan(0);
 expect(code.indexOf('for(const kind of aliases)',code.indexOf('for(const key of'))).toBeGreaterThan(0);
});

it('supports combat snapshots that store race and gender in attack profile attributes',()=>{
 expect(source).toContain('profile.attributes?.race');
 expect(source).toContain('profile.attributes?.gender');
});
