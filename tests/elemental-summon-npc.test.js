import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261009000500_elementar_npc_templates.sql',import.meta.url),'utf8');
it('four elemental templates and owner linkage',()=>{
 for(const key of ['sylf_frammanad','gnom_frammanad','undin_frammanad'])expect(sql).toContain(key);
 expect(js).toContain('function combatElementalSummonDefinition(');
 expect(js).toContain('controller_user_id:caster.controller_user_id');
 expect(js).toContain('summoner_id:caster.id');
 expect(js).toContain('combatCreateElementalFromSpell(action.id');
});
