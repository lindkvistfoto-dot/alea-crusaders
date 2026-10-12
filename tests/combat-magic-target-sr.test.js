import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function section(start,end){
 const i=rt.indexOf(start),j=rt.indexOf(end,i+start.length);
 if(i<0||j<0)throw Error('Section not found');
 return rt.slice(i,j);
}
describe('Magimål först i kast-SR',()=>{
 test('föregående SR:s förberedda besvärjelse har företräde framför ny handlingsrad',()=>{
  const ctx={activeCombat:{round_number:2},combatActions:[
   {id:'new',combatant_id:'lyra',round_number:2,slot_key:'primary',status:'planned',source_data:{action_key:'attack'}},
   {id:'eld',combatant_id:'lyra',round_number:1,slot_key:'primary',status:'planned',source_data:{action_key:'spell_cast',casting_spell:true,ready_round:2}}
  ]};
  runInNewContext(section('function combatChosenAction(', 'function combatActionDefinition(')+'this.getAction=combatChosenAction;',ctx);
  expect(ctx.getAction({id:'lyra'}).id).toBe('eld');
 });
 test('en ännu inte kastklar besvärjelse kan inte få mål under förberedelsen',()=>{
  const ctx={activeCombat:{round_number:1},escAttr:String};
  runInNewContext(section('function combatMagicTargetChooserHtml(', 'async function combatSetMagicResistance(')+'this.chooser=combatMagicTargetChooserHtml;',ctx);
  const html=ctx.chooser({id:'lyra'},{source_data:{casting_spell:true,ready_round:2,magic_binding:{kind:'damage'}}});
  expect(html).toContain('Mål väljs först i kast-SR 2');
 });
});
