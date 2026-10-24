import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../features/ui/arcane-paper-doll-pose-resolver.js',import.meta.url),'utf8');
const context={};vm.runInNewContext(source,context);
const {resolveHierarchy}=context.aleaBattlePoseCatalog;
const pose=(key,gender_variant='neutral')=>({pose_key:key,gender_variant,is_active:true});
const equipment={weaponClass:'enhandssvard',grip:'1H',hasWeapon:true,hasShield:true};
it('players never inherit race poses',()=>{
 const result=resolveHierarchy({actorType:'character',equipment,racePoses:[pose('enhandssvard_shield')]});
 expect(result.source).toBe('portrait-stand');
});
it('own battle pose outranks racial equipment pose',()=>{
 const result=resolveHierarchy({actorType:'npc',equipment,ownPoses:[pose('standard')],racePoses:[pose('enhandssvard_shield')]});
 expect(result.source).toBe('own');expect(result.pose.pose_key).toBe('standard');
});
it('race equipment pose outranks race battle pose, matching gender first',()=>{
 const result=resolveHierarchy({actorType:'monster',gender:'female',equipment,racePoses:[pose('standard','female'),pose('enhandssvard_shield','neutral'),pose('enhandssvard_shield','female')]});
 expect(result.source).toBe('race');expect(result.pose.gender_variant).toBe('female');
});
it('never falls back to wrong gender',()=>{
 const result=resolveHierarchy({actorType:'enemy',gender:'male',equipment,racePoses:[pose('standard','female')]});
 expect(result.source).toBe('portrait-stand');
});
