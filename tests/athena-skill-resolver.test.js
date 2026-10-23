import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const ctx={};
runInNewContext(readFileSync(new URL('../features/skills/athena-resolver.js',import.meta.url),'utf8'),ctx);
const resolve=ctx.aleaSkillResolver.resolve;
const rules=[{id:'skoldar',name:'Sköldar',bc:'SMI'},{id:'taktik',name:'Taktik',bc:'INT'},{id:'special',name:'Special'}];
const astrid={base:{Smidighet:{v:14,g:3},Intelligens:{v:12,g:2}},skills:[]};
it('uses SMI base chance for Astrid shield parry without learned FV',()=>{
 expect(resolve(astrid,'skoldar',rules).fv).toBe(3);
 expect(resolve(astrid,'skoldar',rules).source).toBe('BC SMI');
});
it('prefers learned FV without adding base chance',()=>{
 expect(resolve({...astrid,skills:[{skillId:'skoldar',fv:12}]},'skoldar',rules).fv).toBe(12);
});
it('supports externally requested skills and does not invent missing chances',()=>{
 expect(resolve(astrid,'taktik',rules).fv).toBe(2);
 expect(resolve(astrid,'special',rules).fv).toBe(null);
 expect(resolve(astrid,'unknown',rules).fv).toBe(null);
});
it('keeps empty and zero skill FV eligible for valid BC',()=>{
 expect(resolve({...astrid,skills:[{skillId:'skoldar',fv:''}]},'skoldar',rules).fv).toBe(3);
 expect(resolve({...astrid,skills:[{skillId:'skoldar',fv:0}]},'skoldar',rules).fv).toBe(3);
});
