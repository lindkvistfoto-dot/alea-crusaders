import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const legacy=read('legacy/app.js');
const sql=read('supabase/migrations/20261008234500_shield_master_bv_bep.sql');
const shop=read('supabase/migrations/20261005213000_targans_gille_shop_catalog.sql');
const shieldStart=legacy.indexOf('function renderAdminShields()');
const shieldEnd=legacy.indexOf('function editRuleShield(',shieldStart);
if(shieldStart<0||shieldEnd<0)throw new Error('Shield admin function missing');
const renderSource=legacy.slice(shieldStart,shieldEnd);

describe('shield master BV/BEP',()=>{
 test('master seed derives values from existing 1988 shop entries, preserving overrides',()=>{
  for(const [key,bep,abs,price] of [['small',1,8,90],['medium',2,12,165],['large',3,16,190]]){
   expect(shop).toContain("'shield_"+key+"'");
   expect(shop).toContain('"abs":'+abs);
   expect(shop).toContain("'SM','shield'");
   expect(sql).toContain("WHEN 'shield_"+key+"' THEN '"+key+"'");
  }
  expect(sql).toContain('coalesce(r.bv');
  expect(sql).toContain('coalesce(r.bep');
  expect(sql).toContain("source_key='grundregler_1988'");
  expect(sql).toContain("(s.metadata->>'abs')::integer");
 });
 test('BV and BEP appear in the shield master, not only in the edit dialog',()=>{
  expect(renderSource).toContain('<div class="ahead">BV</div><div class="ahead">BEP</div>');
  expect(renderSource).toContain("'<div>'+cell(r.bv)+'</div>'");
  expect(renderSource).toContain("'<div>'+cell(r.bep)+'</div>'");
  expect(legacy).toContain("bv:ruleMasterNumberValue('rsBv'");
  expect(legacy).toContain("bep:ruleMasterNumberValue('rsBep'");
 });
 test('admin renders populated BV/BEP and distinguishes missing values',()=>{
  const elements={adminShieldTable:{innerHTML:''},adminShieldStatus:{textContent:''}};
  const mock={ruleShieldsLoaded:true,ruleShields:[
   {id:'one',shield_key:'small',name:'Liten sköld',size_class:'small',bv:8,bep:1,price:90,projectile_block_min:1,projectile_block_max:2,passive_coverage:'Sköldarm'},
   {id:'two',shield_key:'medium',name:'Medelstor sköld',size_class:'medium',bv:12,bep:2,price:165,projectile_block_min:1,projectile_block_max:4,passive_coverage:'Sköldarm + bröst'},
   {id:'three',shield_key:'large',name:'Stor sköld',size_class:'large',bv:16,bep:3,price:190,projectile_block_min:1,projectile_block_max:6,passive_coverage:'Sköldarm + mage + bröst'}
  ],$:(id)=>elements[id],ruleShieldIconHtml:()=>'',ruleShieldSizeLabel:s=>s,escAttr:v=>String(v)};
  runInNewContext(renderSource+'\nrenderAdminShields();',mock);
  const html=elements.adminShieldTable.innerHTML;
  for(const [bv,bep] of [[8,1],[12,2],[16,3]]){
   expect(html).toContain('<div>'+bv+'</div><div>'+bep+'</div>');
  }
  expect(elements.adminShieldStatus.textContent).toContain('BV och BEP: kompletta');
  mock.ruleShields[0].bv=null;
  runInNewContext(renderSource+'\nrenderAdminShields();',mock);
  expect(elements.adminShieldTable.innerHTML).toContain('<div>—</div>');
  expect(elements.adminShieldStatus.textContent).toContain('1 saknar värden');
 });
});
