import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

it('resolves battle pose, portrait stand and classic fallback in order',()=>{
 const context={};
 runInNewContext(readFileSync(new URL('../features/combat/paper-doll-resolver.js',import.meta.url),'utf8'),context);
 const resolver=context.aleaCombatPaperDollResolver;
 const assets={[resolver.BASE]:{src:'base.webp'},[resolver.STAND]:{src:'stand.webp'}};
 expect(resolver.resolve({id:1},{assets,footprint:'single',battlePoseUrl:'pose.webp'}).mode).toBe('battle-pose');
 expect(resolver.resolve({id:1},{assets,footprint:'single',portraitUrl:'portrait.webp'}).mode).toBe('portrait-stand');
 expect(resolver.resolve({id:1},{assets,footprint:'single'}).mode).toBe('portrait-stand');
 expect(resolver.resolve({id:1},{assets,footprint:'line2'}).mode).toBe('classic');
 expect(resolver.resolve({id:1},{assets:{}}).mode).toBe('classic');
 expect(resolver.resolve({id:1},{assets:{[resolver.BASE]:assets[resolver.BASE]}}).mode).toBe('classic');
});
