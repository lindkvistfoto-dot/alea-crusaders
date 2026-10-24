import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../features/ui/arcane-paper-doll-pose-resolver.js',import.meta.url),'utf8');
const context={};vm.runInNewContext(source,context);
const {resolveHierarchy}=context.aleaBattlePoseCatalog;
const pose=(key,gender_variant='neutral')=>({pose_key:key,gender_variant,is_active:true,publication_status:'published',image_path:'hermes/test.webp'});
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

it('staged and unpublished poses never override a valid fallback',()=>{
 const result=resolveHierarchy({actorType:'npc',equipment,ownPoses:[{...pose('enhandssvard_shield'),publication_status:'pending'}],racePoses:[pose('standard','neutral')]});
 expect(result.source).toBe('race');expect(result.pose.pose_key).toBe('standard');
});

it('maps a legacy Swedish race name to a stable race ID',()=>{
 const races=[{id:'manniska',name:'Människa'},{id:'skogsalv',name:'Skogsalv'}];
 expect(context.aleaBattlePoseCatalog.raceIdFor({race:'Människa'},races)).toBe('manniska');
 expect(context.aleaBattlePoseCatalog.raceIdFor({race_id:'skogsalv'},races)).toBe('skogsalv');
 expect(context.aleaBattlePoseCatalog.raceIdFor({race:'Okänd'},races)).toBe(null);
});
it('filters race poses at the data source',()=>{
 const query=context.aleaBattlePoseCatalog.racePoseQuery('manniska');
 expect(query).toContain('race_id=eq.manniska');
 expect(query).toContain('publication_status=eq.published');
});

it('Swedish gender labels select the correct racial variant',()=>{
 const result=resolveHierarchy({actorType:'npc',gender:'Kvinna',equipment,racePoses:[pose('enhandssvard_shield','male'),pose('enhandssvard_shield','female')]});
 expect(result.source).toBe('race');expect(result.pose.gender_variant).toBe('female');
});
