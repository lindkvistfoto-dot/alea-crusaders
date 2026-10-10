import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js'),css=read('src/styles/app.css');
const start=app.indexOf('/* Inventory units remain in the character\'s JSON');
const end=app.indexOf('function erfDisplayItem(',start);
if(start<0||end<start)throw Error('Missing character inventory stack module');
const moduleSource=app.slice(start,end);
const baseItem={name:'Fackla',bep:'.25',shopItemKey:'torch',shopSourceId:'shop-torch',purchaseKind:'equipment'};
const torch=(id,extra={})=>({equipId:id,...baseItem,...extra});

function setup(equipment=[{equipId:'spade',name:'Spade',bep:1},
  torch('t1'),torch('t2'),torch('t3'),torch('t4')]){
 const current={
  equipment:structuredClone(equipment),armor:[],weapons:[],shields:[],artifacts:[],
  coins:{carried:{GM:0,SM:0,KM:0},stored:{GM:0,SM:0,KM:0}},
  currentEquipment:{leftHand:null,rightHand:null}
 };
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{
   innerHTML:'',classList:{toggle(name,enabled){this[name]=enabled}}
  });
  return elements.get(id)
 };
 const saved=[],cleared=[];
 const ctx={
  current,editing:false,$,save:()=>saved.push(JSON.stringify(current.equipment)),
  renderCharacterProvisions:()=>{},newEquipItemId:kind=>kind+'-new',
  clearEquippedItemRefs:(c,kind,id)=>{
   cleared.push(id);
   for(const slot of ['leftHand','rightHand']){
    if(c.currentEquipment[slot]?.itemId===id)c.currentEquipment[slot]=null
   }
  },
  escAttr:value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  alert:message=>{throw Error(message)}
 };
 runInNewContext(moduleSource,ctx);
 return {current,ctx,el:$,saved,cleared,
  stacks:()=>ctx.characterEquipmentStacks(current.equipment),
  render:()=>ctx.renderEquipment(),
  total:()=>ctx.calculateTotalBep(),
  update:(index,value)=>ctx.setEquipmentStackCount(index,value),
  edit:(index,key,value)=>ctx.setEquipmentStackField(index,key,value),
  remove:index=>ctx.removeEquipmentStack(index)
 }
}
describe('Utrustning som mängd i stället för fyra identiska rader',()=>{
 it('shows one Fackla row with quantity four and retains Spade separately',()=>{
  const f=setup();
  f.render();
  const markup=f.el('inventorytable').innerHTML;
  expect(f.stacks()).toHaveLength(2);
  expect(markup.match(/Fackla/g)).toHaveLength(1);
  expect(markup).toContain('<div class="skillnum">4</div>');
  expect(markup).toContain('BEP/st');
  expect(markup).toContain('Antal');
  expect(markup).toContain('Spade');
  expect(f.current.equipment).toHaveLength(5);
  expect(f.total()).toBe(2); // Spade 1 + 4 × 0.25
  expect(f.el('totalBep').innerHTML).toContain('Samlad BEP: <b>2</b>');
 });
 it('offers an editable quantity column while keeping original records until edited',()=>{
  const f=setup();
  f.ctx.editing=true;f.render();
  const markup=f.el('inventorytable').innerHTML;
  expect(f.el('inventorytable').classList['equipment-stack-editing']).toBe(true);
  expect(markup).toContain('class="equipment-stack-quantity"');
  expect(markup).toContain('value="4"');
  expect(markup).toContain('setEquipmentStackCount(');
  expect(markup).toContain('setEquipmentStackField(');
  expect(markup).toContain('removeEquipmentStack(');
 });
 it('increasing count compacts new stock without duplicating equipment identifiers',()=>{
  const f=setup();
  f.update(1,'6');
  const grouped=f.stacks().find(g=>g.item.name==='Fackla');
  expect(grouped.count).toBe(6);
  expect(f.current.equipment).toHaveLength(5);
  expect(f.total()).toBe(2.5); // 6 × .25 + Spade 1
  expect(f.saved).toHaveLength(1);
 });
 it('decreasing stock prefers removing unused copies, preserving an equipped torch',()=>{
  const f=setup();
  f.current.currentEquipment.leftHand={kind:'equipment',itemId:'t2',hands:1};
  f.update(1,'1');
  expect(f.stacks().find(g=>g.item.name==='Fackla').count).toBe(1);
  expect(f.current.equipment.some(i=>i.equipId==='t2')).toBe(true);
  expect(f.current.currentEquipment.leftHand.itemId).toBe('t2');
  expect(f.cleared).not.toContain('t2');
  expect(f.total()).toBe(1.25);
 });
 it('editing a grouped name or BEP applies to each identical unit',()=>{
  const f=setup();
  f.edit(1,'bep','0,5');
  expect(f.stacks().find(g=>g.item.name==='Fackla').count).toBe(4);
  expect(f.current.equipment.filter(i=>i.name==='Fackla').every(i=>i.bep==='0,5')).toBe(true);
  expect(f.total()).toBe(3);
  f.edit(1,'name','Blå fackla');
  expect(f.stacks().some(g=>g.item.name==='Blå fackla'&&g.count===4)).toBe(true);
 });
 it('does not merge similar-looking items with different attributes or master IDs',()=>{
  const f=setup([torch('t1'),torch('t2',{bep:0.5}),torch('t3',{shopSourceId:'other'}),torch('t4',{name:'Fackla blå'})]);
  expect(f.stacks()).toHaveLength(4);
 });
 it('handles existing count and quantity fields without undercounting BEP',()=>{
  const f=setup([torch('t1',{count:3}),torch('t2'),{equipId:'spade',name:'Spade',bep:1,quantity:2}]);
  const grouped=f.stacks();
  expect(grouped.find(g=>g.item.name==='Fackla').count).toBe(4);
  expect(f.total()).toBe(3);
  f.update(0,'2');
  expect(f.stacks().find(g=>g.item.name==='Fackla').count).toBe(2);
  expect(f.total()).toBe(2.5);
 });
 it('removing a displayed row removes all its copies and clears hand references',()=>{
  const f=setup();
  f.current.currentEquipment.rightHand={kind:'equipment',itemId:'t4'};
  f.remove(1);
  expect(f.current.equipment).toHaveLength(1);
  expect(f.current.equipment[0].name).toBe('Spade');
  expect(f.current.currentEquipment.rightHand).toBeNull();
  expect(f.cleared).toEqual(expect.arrayContaining(['t1','t2','t3','t4']));
 });
 it('provides responsive three-column display and four-column editor',()=>{
  expect(css).toContain('.inventorytable.equipment-stack-editing{');
  expect(css).toContain('.inventorytable input.equipment-stack-quantity{');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 58px 66px 69px');
 });
});
