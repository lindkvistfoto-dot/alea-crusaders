import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('legacy/app.js');
const html=read('index.html');
const css=read('features/character/current-equipment-gandalf.css');
const assetPath=name=>new URL('../features/character/assets/'+name,import.meta.url);

describe('Gandalf – aktuell utrustning',()=>{
 it('loads the two user-provided graphics independently from interactive slots',()=>{
   expect(html).toContain('current-equipment-gandalf.css?v=0.35.46');
   expect(css).toContain('assets/gandalf-slot.webp');
   expect(css).toContain('assets/gandalf-hall.webp');
   for(const name of ['gandalf-slot.webp','gandalf-hall.webp'])
     expect(existsSync(assetPath(name))).toBe(true);
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
 it('enlarges and edge-aligns the armor, weapon, and projectile slots on all screens',()=>{
   expect(css).toMatch(/\.gandalf-equip-slot\{[^}]*width:19\.1%/);
   for(const [slot,top] of [['head',3],['arms',27],['torso',51],['legs',75]])
     expect(css).toContain(`.gandalf-equip-${slot}{top:${top}%;left:1%}`);
   expect(css).toContain('.gandalf-equip-leftHand{top:3%;right:21%;left:auto}');
   expect(css).toContain('.gandalf-equip-rightHand{top:3%;right:1%;left:auto}');
   expect(css).toContain('.gandalf-equip-projectiles{top:29%;right:1%;left:auto}');
   expect(css).toContain('.gandalf-equip-twohand{top:3%;right:1%;left:auto;width:39.1%}');
   expect(css).not.toContain('.gandalf-equip-slot{width:18.1%}');
 });
 it('does not accidentally hardcode a character into Gandalf background',()=>{
   expect(app).toContain('gandalf-equip-center');
   expect(app).not.toContain('id="gandalf-astrid-only"');
   expect(css).toContain('aspect-ratio:1/1');
   expect(css).toContain('@media(max-width:620px)');
 });
});
