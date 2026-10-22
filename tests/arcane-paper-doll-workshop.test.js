import {it,expect,describe} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../features/ui/arcane-paper-doll-workshop.js',import.meta.url),'utf8');
function api(){const ctx={};vm.runInNewContext(source,ctx);return ctx.aleaPaperDollWorkshop}
const profile=(parameters={})=>({schema:1,assetKey:'arcane-paper-doll-mounting-profile',name:'Test',parameters:{scale:100,x:0,y:0,perspective:0,tilt:0,mask:0,shadow:18,...parameters}});

describe('Arcane Paper Doll Workshop profiles',()=>{
 it('accepts bounded, versioned calibration with a stable system asset key',()=>{
  const workshop=api();expect(workshop.profileValid(profile())).toBe(true);
  expect(workshop.profileValid(profile({scale:181}))).toBe(false);
  expect(workshop.profileValid(profile({perspective:36}))).toBe(false);
  expect(workshop.profileValid({...profile(),schema:2})).toBe(false);
  expect(workshop.profileValid({...profile(),assetKey:'portrait-frame'})).toBe(false);
  expect(workshop.profileValid(profile({x:NaN}))).toBe(false);
 });
 it('normalizes imported profiles and drops invalid names or parameter payloads',()=>{
  const normalized=api().normalizeProfiles({'  Stående  ':profile(),'Farlig':profile({shadow:51}),'':profile()});
  expect(Object.keys(normalized)).toEqual(['Stående']);
  expect(normalized['Stående'].parameters.scale).toBe(100);
 });
 it('keeps the workshop wired only into the admin page and reuses the HERMES system adapter',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
  expect(html).toContain("openAdminSection('paperDollWorkshop')");
  expect(html).toContain('data-admin-section="paperDollWorkshop"');
  expect(app).toContain("if(!activeUser()?.admin)throw new Error('Administratörsbehörighet krävs.')");
  expect(app).toContain('aleaArcanePaperDollAssets?.load?.({dbJson,baseUrl:SUPABASE_URL})');
  expect(app).toContain("await window.aleaPaperDollWorkshop?.mount?.()");
  expect(html).toContain('features/battle-art/');
  const feature=source;
  expect(feature).toContain("STORE='alea.arcane-paper-doll-workshop.v1'");
  expect(feature).toContain("assetKey:'arcane-paper-doll-mounting-profile'");
  expect(feature).toContain("data-zoom");
 });
});
