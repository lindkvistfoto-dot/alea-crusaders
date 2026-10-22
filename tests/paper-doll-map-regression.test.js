import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

it('renders Paper Doll overlays without a missing baseScale declaration',()=>{
 const source=readFileSync(new URL('../features/combat/paper-doll-map.js',import.meta.url),'utf8');
 const context={globalThis:null};
 context.globalThis=context;
 context.aleaCombatPaperDollResolver={BASE:'legacy',STAND:'stand',resolve:(_actor,{assets})=>({mode:'portrait-stand',baseUrl:assets.legacy.src,standUrl:'stand.webp',portraitUrl:''})};
 context.combatFootprintShape=()=> 'single';
 context.combatHexPoints=()=> '0,0 1,0 1,1';
 runInNewContext(source,context);
 // No network required: seed the read-only asset adapter and image preload.
 context.aleaArcanePaperDollAssets={load:async()=>({assets:[{id:'base-id',verified:true,src:'base.webp'},{id:'stand-id',verified:true,src:'stand.webp'}],systemArt:{legacy:'base-id',stand:'stand-id'}})};
 context.SUPABASE_URL='https://example.supabase.co';
 context.dbJson=async()=>[];
 context.Image=class {set src(_value){this.onload?.()}};
 context.renderCombat=()=>{};
 context.aleaCombatPaperDollMap.load();
 return Promise.resolve().then(()=>Promise.resolve()).then(()=>Promise.resolve()).then(()=>{
  const output=context.aleaCombatPaperDollMap.render('<circle/>',{id:'s1'},{x:10,y:20},{size:42});
  expect(output).toContain('combat-paper-doll-universal');
  expect(output).toContain('stand.webp');
 });
});
