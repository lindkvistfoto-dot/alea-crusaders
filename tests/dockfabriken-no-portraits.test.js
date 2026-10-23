import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

it('loads workshop identities without resolving portrait images',()=>{
 const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
 const start=app.indexOf('window.aleaPaperDollWorkshopData=async function(){');
 const end=app.indexOf('\nasync function openAdmin()',start);
 expect(start).toBeGreaterThan(-1);
 expect(end).toBeGreaterThan(start);
 const bridge=app.slice(start,end);
 expect(bridge).not.toContain('getNpcPortraitUrl(');
 expect(bridge).not.toContain('getPortraitSrc(');
 expect(bridge).not.toContain('combatIconCachedUrl(');
 expect(bridge).not.toContain('image_path');
 expect(bridge).toContain('global_npcs?select=id,name,title,race,profession');
 expect(bridge).toContain('aleaArcanePaperDollAssets?.load?.');
});
