import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const source=read('features/character/round-background.js');
const gallery=read('features/combat/round-gallery.js');
const runtime=read('features/combat/runtime.js');
const legacy=read('legacy/app.js');
const html=read('index.html');
const schema=read('supabase/migrations/20261012013000_character_round_background.sql');
describe('Character-specific round artwork',()=>{
 it('gives each editable character a personal upload/preview/removal panel',()=>{
  expect(html).toContain('id="characterRoundGallery"');
  expect(html).toContain('features/character/round-background.js?v=0.35.127');
  expect(legacy).toContain('window.aleaCharacterRoundBackground?.render?.()');
  for(const s of ['Ladda upp bild','Byt bild','Ta bort bild','adminbiblioteket'])expect(source).toContain(s);
  expect(source).toContain('canEditCharacter(character)');
 });
 it('stores image in private versioned storage with character/owner guard',()=>{
  expect(source).toContain("const BUCKET='alea-character-round-backgrounds'");
  expect(source).toContain("crypto.randomUUID()+'.webp'");
  expect(source).toContain('x-upsert');
  expect(source).toContain('round_background_path:path');
  expect(source).toContain('round_background_path:null');
  expect(schema).toContain('private.is_campaign_member');
  expect(schema).toContain('c.owner_id=(select auth.uid())');
  expect(schema).toContain('round_background_source');
  expect(schema).not.toContain('public=true');
 });
 it('fetches authoritative character image fields without placing binary in JSON',()=>{
  expect(legacy).toContain('round_background_path,data&order=created_at.asc');
  expect(legacy).toContain("roundBackgroundPath:r.round_background_path||''");
  expect(legacy).toContain('delete d.roundBackgroundPath');
  expect(runtime).toContain('combat_icon_path,round_background_path,data');
 });
 it('chooses stable per-combatant fallback at scene creation only',()=>{
  expect(runtime).toContain('const roundPool=await window.aleaRoundGallery?.getActivePool?.()||[]');
  expect(runtime).toContain("const customPath=sourceType==='character'?stats.round_background_path:null");
  expect(runtime).toContain("round_background_source:roundArtSource,round_background_path:roundArtPath,round_background_id:randomArt?.id||null");
  expect(runtime).toContain("state:{...(row.state||{}),round_background_source:");
  expect(gallery).toContain('getActivePool,pickRandomForCombat');
 });
 it('resolves active actor per redraw and never flashes a previous actor image',()=>{
  expect(runtime).toContain('await window.aleaRoundGallery?.activate?.(activeCombat,combatActiveActor())');
  expect(runtime).toContain('void window.aleaRoundGallery?.activate?.(activeCombat,combatActiveActor())');
  expect(gallery).toContain("if(key===chosenKey){apply();return}");
  expect(gallery).toContain("chosenUrl='';apply();");
  expect(gallery).toContain("window.aleaCharacterRoundBackground?.resolveUrl?.(path)");
  expect(gallery).toContain('const token=++request');
  expect(gallery).toContain("chosenUrl='./'+BUILTIN");
 });
});
