import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('ARCANE Trophy Room V2.2',()=>{
 it('adds an independent navigable view and locked HERMES scene',()=>{
  const html=read('index.html'),icons=read('features/home/navigation-icons.js'),room=read('features/trophy-room/room.js');
  expect(html).toContain('id="trophyRoomNavBtn"');expect(html).toContain('id="trophyRoomPage"');
  expect(icons).toContain("trophyRoomNavBtn:'trophyRoomPage'");expect(room).toContain('arcane-trophy-room-v2.2');
  expect(room).toContain('--pan-x');expect(room).toContain('--pan-y');
 });
 it('pins Drive provenance and records publication as pending',()=>{
  const manifest=JSON.parse(read('hermes/system-assets/arcane-trophy-room-v2.2.json'));
  expect(manifest.source_sha256).toBe('dabe7b84aa5622580fd5056a6386b6bdb1f135a05c05e29a66ed4f8c11ee3d6b');
  expect(manifest.expected_dimensions).toEqual([1280,720]);expect(manifest.alpha_preserved).toBe(false);
  expect(manifest.publication_status).toBe('pending-reviewed-main-action');
 });
 it('makes the opaque exception exact-key only',()=>{
  const sql=read('supabase/migrations/20261024200000_arcane_trophy_room_opaque_scene.sql');
  const prep=read('scripts/hermes2_prepare.py');
  expect(sql).toContain("asset_key = 'arcane-trophy-room-v2.2'");expect(prep).toContain('opaque_scene');
 });
});

describe('Trophy room image-first controls',()=>{
 it('renders scene before zoom and character selector',()=>{const html=read('index.html');const start=html.indexOf('<section id="trophyRoomPage"');const end=html.indexOf('</section>',start);const room=html.slice(start,end);expect(room.indexOf('id="trophyRoomViewport"')).toBeLessThan(room.indexOf('class="trophy-room-toolbar"'));expect(room.indexOf('class="trophy-room-toolbar"')).toBeLessThan(room.indexOf('id="trophyRoomCharacter"'));expect(room).not.toContain('ARCANE · SYSTEM VIEW');expect(room).not.toContain('← Tillbaka');});
 it('uses shared eligible roster and exposes selection event',()=>{const js=read('features/trophy-room/room.js');expect(js).toContain('shopEligibleBuyers');expect(js).toContain('alea:trophy-character-change');});
});
