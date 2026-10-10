import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const html=read('index.html');
const css=read('features/character/current-equipment-gandalf.css');
const assetPath=name=>new URL('../features/character/assets/'+name,import.meta.url);

describe('Gandalf – aktuell utrustning',()=>{
 it('keeps the hall and original slot artwork while showing a transparent golden frame',()=>{
   expect(html).toContain('current-equipment-gandalf.css?v=0.35.47');
   expect(css).toContain('assets/gandalf-slot-transparent.svg');
   expect(css).toContain('assets/gandalf-hall.webp');
   for(const name of ['gandalf-slot.webp','gandalf-slot-transparent.svg','gandalf-hall.webp'])
     expect(existsSync(assetPath(name))).toBe(true);
   const transparent=read('features/character/assets/gandalf-slot-transparent.svg');
   expect(transparent).toContain('<feColorMatrix');
   expect(transparent).toContain('data:image/webp;base64,');
   expect(css).toContain('background-color:transparent');
   expect(css).toContain('background:transparent');
 });
 it('lays out four armor placeholders in the requested order',()=>{
   expect(app).toContain("['head','arms','torso','legs'].map(currentEquipSlotHtml)");
   expect(app).toContain("head:'Huvud'");
   expect(app).toContain("torso:'Kropp'");
   expect(app).toContain("arms:'Armar'");
   expect(app).toContain("legs:'Ben'");
   for(const slot of ['head','arms','torso','legs'])
      expect(css).toContain('.gandalf-equip-'+slot);
 });
 it('retains equipment pickers and existing single/two handed mechanics',()=>{
   expect(app).toContain("onclick=\"openCurrentEquipmentPicker(");
   expect(app).toContain("currentEquipSlotHtml('leftHand')+currentEquipSlotHtml('rightHand')");
   expect(app).toContain("gandalfTwoHandSlotHtml(leftItem)");
   expect(app).toContain("Number(left.hands)===2&&equipRefEquals(left,right)");
   expect(app).toContain("if(g.hands===2){eq.leftHand={...ref};eq.rightHand={...ref}}");
   expect(css).toContain('.gandalf-equip-twohand');
 });
 it('prepares a projectile placeholder without pretending ammunition is wired already',()=>{
   expect(app).toContain('gandalf-equip-projectiles');
   expect(app).toContain('showCurrentEquipmentProjectileInfo');
   expect(app).toContain('Projektiler kopplas i Frodo-steget');
 });
 it('uses four large edge-aligned armor slots with vertical labels and bigger right-hand controls',()=>{
   expect(css).toMatch(/\\.gandalf-equip-slot\\{[^}]*width:22\\.5%/);
   expect(css).toContain('width:29%');
   expect(css).toContain('flex-direction:row-reverse');
   expect(css).toContain('writing-mode:vertical-rl');
   expect(css).toContain('flex:0 0 77%');
   for(const [slot,top] of [['head','1'],['arms','25.5'],['torso','50'],['legs','74.5']])
     expect(css).toContain(`.gandalf-equip-${slot}{top:${top}%}`);
   expect(css).toContain('.gandalf-equip-leftHand{top:1%;right:24.5%;left:auto}');
   expect(css).toContain('.gandalf-equip-rightHand{top:1%;right:1%;left:auto}');
   expect(css).toContain('.gandalf-equip-projectiles{top:29%;right:1%;left:auto}');
   expect(css).toContain('.gandalf-equip-twohand{top:1%;right:1%;left:auto;width:46%}');
   expect(css).toContain('inset:1% 1% 1% 30%');
   expect(css).not.toContain('.gandalf-equip-slot{width:18.1%}');
 });
 it('does not accidentally hardcode a character into Gandalf background',()=>{
   expect(app).toContain('gandalf-equip-center');
   expect(app).not.toContain('id="gandalf-astrid-only"');
   expect(css).toContain('aspect-ratio:1/1');
   expect(css).toContain('@media(max-width:620px)');
 });
});
