import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('features/equipment/catalog.js');
const art=read('features/equipment/art.js');
const app=read('legacy/app.js');
const shop=read('features/shop/store.js');
const html=read('index.html');
const style=read('features/equipment/catalog.css');
const migration=read('supabase/migrations/20261010235000_equipment_master_carry_art.sql');
const id='f53b9568-81ec-4623-ac6d-dd452177a769';
const master=[
 {id,item_key:'torch',name:'Fackla',category:'Äventyr',purchase_kind:'equipment',can_carry:true,image_path:'equipment/'+id+'/'+id+'.webp',bep:.25,price_amount:1,price_currency:'SM',quantity_per_purchase:1,active:true},
 {id:'b5a65847-6e21-496e-800d-812614c196a6',item_key:'lantern',name:'Lykta',category:'Äventyr',purchase_kind:'equipment',can_carry:true,image_path:null,bep:1,price_amount:40,price_currency:'SM',quantity_per_purchase:1,active:true},
 {id:'65a65847-6e21-496e-800d-812614c196a6',item_key:'rope',name:'Rep',category:'Äventyr',purchase_kind:'equipment',can_carry:false,image_path:null,bep:1,price_amount:3,price_currency:'SM',quantity_per_purchase:1,active:true},
 {id:'75a65847-6e21-496e-800d-812614c196a6',item_key:'elixir',name:'Elixir',category:'Trolldrycker',purchase_kind:'equipment',can_carry:false,image_path:null,bep:0,price_amount:3,price_currency:'SM',quantity_per_purchase:1,active:true}
];
function setup(){
 let database=structuredClone(master);
 const byElement=new Map(),requests=[];
 const el=id=>{
  if(!byElement.has(id))byElement.set(id,{
   innerHTML:'',value:'',textContent:'',checked:false,disabled:false,
   classList:{add(){},remove(){}},addEventListener(){},dispatchEvent(){},
   querySelector(){return{disabled:false}}
  });
  return byElement.get(id);
 };
 let closeCount=0;
 const ctx={window:{aleaEquipmentArt:{
   src:p=>p?'https://equipment.test/'+p:'',
   start:(_kind,r)=>'<section>Upload '+(r?.name||'new')+'</section>',
   thumbnail:(p,alt)=>p?'<img src="'+p+'">':alt,
   prepare:async()=>({path:null,old:null,uploaded:null}),
   removeStored:async()=>{}
 }},document:{getElementById:el},console:{warn(){}},
 dbJson:async(url,options)=>{
  requests.push({url,options});
  if(!options)return structuredClone(database);
  const data=JSON.parse(options.body||'{}');
  if(options.method==='POST')database.push(data);
  if(options.method==='PATCH'){const idx=database.findIndex(r=>url.includes(r.id));database[idx]={...database[idx],...data}}
  if(options.method==='DELETE')database=database.filter(r=>!url.includes(r.id));
  return [];
 },
 activeUser:()=>({admin:true}),
 crypto:{randomUUID:()=>id},
 SUPABASE_KEY:'public',
 freshSupabaseAccessToken:async()=> 'token',
 supabaseSession:{access_token:'token'},
 Event:class{},
 closeAdminEditor:()=>{closeCount++},
 renderAdminOverviewCounts(){},
 loadShopCatalog:async()=>{},
 current:null,renderCurrentEquipment(){},
 alert:message=>{throw Error(message)},
 askConfirm:async()=>true
 };
 runInNewContext(script,ctx);
 return {api:ctx.window.aleaEquipmentCatalog,edit:ctx.window.editRuleEquipment,
  save:ctx.window.saveRuleEquipment,remove:ctx.window.deleteRuleEquipment,
  el,requests,get closes(){return closeCount}};
}
describe('Utrustningsregister med Kan bäras',()=>{
 it('migrates existing shop master, makes torch/lantern carryable, and protects artwork',()=>{
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS can_carry boolean NOT NULL DEFAULT false');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS image_path text');
  expect(migration).toContain("item_key IN ('torch','lantern')");
  expect(migration).toContain('equipment/[0-9a-f-]{36}');
  expect(migration).toContain('private.is_admin()');
  expect(art).toContain("'projectile','equipment'");
  expect(art).toContain('weapon|armor|shield|equipment');
 });
 it('only exposes items with can_carry and type equipment',async()=>{
  const f=setup();await f.api.load();
  expect(f.api.canCarry({shopItemKey:'torch'})).toBe(true);
  expect(f.api.canCarry({shopItemKey:'lantern'})).toBe(true);
  expect(f.api.canCarry({shopItemKey:'rope'})).toBe(false);
  expect(f.api.canCarry({shopItemKey:'elixir'})).toBe(false);
  expect(f.api.canCarry({name:'Lykta'})).toBe(true); // historical manual entries
  expect(f.api.canCarry({name:'Främmande dricka'})).toBe(false);
  expect(f.api.imagePath({shopItemKey:'torch'})).toContain('equipment/'+id+'/');
 });
 it('torch quantity counts all owned torches, not unrelated items',async()=>{
  const f=setup();await f.api.load();
  const char={equipment:[
   {equipId:'a',shopItemKey:'torch'},
   {equipId:'b',shopItemKey:'torch',quantity:3},
   {equipId:'c',shopItemKey:'lantern'},
   {equipId:'d',shopItemKey:'rope',quantity:22}
  ]};
  expect(f.api.torchCount(char,char.equipment[0])).toBe(4);
  expect(f.api.torchCount(char,char.equipment[1])).toBe(4);
  expect(f.api.torchCount(char,char.equipment[2])).toBeNull();
  char.equipment.splice(1,1);
  expect(f.api.torchCount(char,char.equipment[0])).toBe(1);
 });
 it('table supports search, create, editing, carry checkbox and art upload',async()=>{
  const f=setup();await f.api.load();f.api.render();
  expect(f.el('adminEquipmentTable').innerHTML).toContain('Fackla');
  expect(f.el('adminEquipmentTable').innerHTML).toContain('Lykta');
  f.el('adminEquipmentSearch').value='lykta';f.api.render();
  expect(f.el('adminEquipmentTable').innerHTML).toContain('Lykta');
  expect(f.el('adminEquipmentTable').innerHTML).not.toContain('Rep');
  f.edit(master[0].id);
  expect(f.el('adminEditorBody').innerHTML).toContain('reiCarry');
  expect(f.el('adminEditorBody').innerHTML).toContain('checked');
  expect(f.el('adminEditorBody').innerHTML).toContain('Upload Fackla');
  expect(f.el('adminEditorBody').innerHTML).toContain('reiQuantity');
  expect(f.el('adminEditorBody').innerHTML).toContain('reiActive');
 });
 it('uses common image paths and preserves purchased master IDs for hand slots',()=>{
  expect(app).toContain("if(ref.kind==='equipment')return window.aleaEquipmentCatalog?.imagePath(item)");
  expect(app).toContain("window.aleaEquipmentCatalog?.canCarry(x)");
  expect(app).toContain("window.aleaEquipmentCatalog?.torchCount(current,item)");
  expect(app).toContain('gandalf-equip-stack-count');
  expect(app).toContain("kind==='equipment'&&!window.aleaEquipmentCatalog?.canCarry(");
  expect(shop).toContain("shopSourceId:item.sourceId||null");
  expect(shop).toContain('canCarry:!!row.can_carry');
  expect(shop).toContain('imagePath:row.image_path||null');
  expect(html).toContain('data-admin-section="equipment"');
  expect(html).toContain('id="adminCountEquipment"');
  expect(html).toContain('features/equipment/catalog.js');
  expect(html).toContain('features/equipment/catalog.css');
  expect(style).toContain('.gandalf-equip-face>.gandalf-equip-stack-count');
 });
});
