import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const component=read('features/character/arcane-character-drawer.js');
const styles=read('features/character/arcane-character-drawer.css');

describe('ARCANE character drawer',()=>{
 it('loads after the existing character model and styles without changing the combat layout',()=>{
  expect(html).toContain('arcane-character-drawer.css?v=20261113-2');
  expect(html).toContain('arcane-character-drawer.js?v=20261113-2');
  expect(html.indexOf('arcane-character-drawer.js')).toBeGreaterThan(html.indexOf('legacy/app.js'));
  expect(styles).toContain('position:fixed');
  expect(styles).toContain('transform:translateX(102%)');
  expect(styles).toContain('@media(max-width:900px)');
 });
 it('uses the active campaign character records and excludes NPC records from the party rail',()=>{
  expect(component).toContain("characters?campaign_id=eq.'+encodeURIComponent(campaignId)+'&select=id,is_npc");
  expect(component).toContain('npcFlags.get(id)!==true');
  expect(component).toContain("c.ownerId!=='SLP'");
  expect(component).toContain('getPortraitSrc(c)');
  expect(component).toContain("c?._combatIconUrl");
 });
 it('provides four read-only pages and reuses the existing skill and spell roll flows',()=>{
  for(const label of ['Grundegenskaper','Färdigheter','Magi','Utrustning'])expect(component).toContain(label);
  expect(component).toContain('openSkillRollMenu(index)');
  expect(component).toContain('openSpellRollMenu(index)');
  expect(component).toContain('skillRollTarget(sk,rule)');
  expect(component).toContain('findRuleSpell(sp)');
  expect(component).not.toMatch(/<input|onchange=|onupload|type=["']file/i);
 });
 it('supports character switching, tab navigation, arrows and horizontal swipe',()=>{
  expect(component).toContain('toggleCharacter(b.dataset.character)');
  expect(component).toContain('function isNonHomePageVisible()');
  expect(component).toContain("'loginScreen','home','admin','academyPage','view','combatPage','mapPage','dicePage','trophyRoomPage','shopPage','innPage'");
  expect(component).toContain('data-dir');
  expect(component).toContain("e.changedTouches");
  expect(component).toContain('setPage(activePage+(dx<0?1:-1))');
 });
});
