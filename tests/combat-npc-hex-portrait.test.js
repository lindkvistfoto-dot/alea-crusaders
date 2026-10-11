import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const css=read('src/styles/app.css');
const slice=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a+start.length);
 if(a<0||b<=a)throw Error('Combat image renderer marker missing: '+start);
 return runtime.slice(a,b);
};
const miniSource=slice('function combatPlayerMiniatureSvg(', 'function combatHexNeighbors(');
const resolverSource=slice('const combatActorImageSources=new Map();', 'function combatRowPortraitUrl(');

function setup({npcs=[],monsters=[],characters=[],portraitUrls={},iconUrls={},combatants=[],sourceRows=[]}={}){
 const requests=[];
 const globals={
  chars:characters,campaignNpcs:npcs,campaignMonsters:monsters,
  activeCombat:null,centralCampaignId:'campaign-one',combatants,
  combatIconCachedUrl:path=>iconUrls[path]||'',
  npcPortraitCachedUrl:path=>portraitUrls[path]||'',
  combatNpcPortraitSrc:path=>portraitUrls[path]||'',
  combatPlayerPortraitSource:row=>{
   const source=characters.find(c=>String(c._dbId||c.id)===String(row.source_id));
   return source?.portrait?{source,url:source.portrait}:null
  },
  getCombatIconUrl:async path=>iconUrls[path]||'',
  renderCombat:()=>{},
  dbJson:async path=>{requests.push(path);return sourceRows},
  combatPortraitHexPoints:()=>'-28,-16 0,-32 28,-16 28,16 0,32 -28,16',
  escAttr:value=>String(value||''),
  combatPlayerMiniatureKind:()=>null
 };
 const value=runInNewContext(resolverSource+'\n'+miniSource+
  '\n({visual:combatMiniatureVisual,mini:combatPlayerMiniatureSvg,load:combatLoadActorImageSources,records:combatActorImageSources})',globals);
 return {...value,requests}
}
const npc=(state={})=>({id:'battle-undin',source_id:'undin',source_type:'npc',name_snapshot:'Undin',state});

describe('SLP hex portrait fallback',()=>{
 it('uses Undin’s uploaded portrait in a hex with a blue-frame marker when no hex icon exists',()=>{
  const h=setup({npcs:[{id:'undin',image_path:'undin-portrait'}],portraitUrls:{'undin-portrait':'blob:undin'}});
  const resolved=h.visual(npc());
  expect(resolved.url).toBe('blob:undin');
  expect(resolved.type).toBe('portrait');
  const svg=h.mini(npc(),{x:300,y:250},{size:42});
  expect(svg).toContain('npc-mini portrait-fallback');
  expect(svg).toContain('href="blob:undin"');
  expect(svg).toContain('combat-portrait-green-ring');
  expect(css).toMatch(/\.npc-mini\.portrait-fallback[^}]+\.combat-portrait-green-ring\{\s*stroke:#58b4f5/);
 });
 it('prioritizes a dedicated SLP hex icon over the normal portrait',()=>{
  const h=setup({
   npcs:[{id:'undin',image_path:'undin-portrait',combat_icon_path:'undin-icon'}],
   portraitUrls:{'undin-portrait':'blob:portrait'},
   iconUrls:{'undin-icon':'blob:hex-icon'}
  });
  expect(h.visual(npc()).url).toBe('blob:hex-icon');
  expect(h.visual(npc()).type).toBe('icon');
  const svg=h.mini(npc(),{x:0,y:0},{size:42});
  expect(svg).toContain('href="blob:hex-icon"');
  expect(svg).not.toContain('portrait-fallback');
 });
 it('supports SLP portrait saved in an old combat snapshot without a registry listing',()=>{
  const h=setup({portraitUrls:{'saved-portrait':'blob:old-slp'}});
  expect(h.visual(npc({portrait_image_path:'saved-portrait'})).url).toBe('blob:old-slp');
 });
 it('loads current portrait/hex paths for a preexisting battle without changing its combat data',async()=>{
  const row=npc();
  const h=setup({combatants:[row],sourceRows:[{id:'undin',image_path:'new-undin-portrait',combat_icon_path:null}],
   portraitUrls:{'new-undin-portrait':'blob:new-undin'}});
  expect(h.visual(row).url).toBe('');
  await h.load();
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0]).toContain('campaign_npcs?');
  expect(h.visual(row).url).toBe('blob:new-undin');
  expect(row.state).toEqual({});
 });
 it('keeps blue NPC fallback separate from red enemy and golden turn highlights',()=>{
  const h=setup({monsters:[{id:'wolf',image_path:'wolf-art'}],
   portraitUrls:{'wolf-art':'blob:wolf'}});
  const enemy={source_type:'monster',source_id:'wolf',id:'monster-1',state:{}};
  expect(h.mini(enemy,{x:0,y:0},{size:42})).not.toContain('portrait-fallback');
  expect(css).toContain('.combat-miniature.combat-portrait-hex.enemy-mini:not(.selected):not(.attack-target)');
  expect(css).toContain('.combat-active-turn-outline');
 });
 it('continues to use an explicit player hex icon even when that player has no portrait',()=>{
  const h=setup({characters:[{id:'player-1',combatIconPath:'player-hex'}],iconUrls:{'player-hex':'blob:player-icon'}});
  expect(h.visual({source_type:'character',source_id:'player-1',state:{}}).url).toBe('blob:player-icon');
 });
});
