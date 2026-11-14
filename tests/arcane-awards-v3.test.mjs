import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('ARCANE AWARDS V3',()=>{
 it('pins the three frame keys in one shared renderer used by admin and Trophy Room',()=>{
  const renderer=read('features/honors/award-renderer.js');
  const admin=read('features/honors/honors-admin.js');
  const room=read('features/trophy-room/room.js');
  for(const tier of ['bronze','silver','gold']) expect(renderer).toContain(`${tier}: 'arcane-award-frame-${tier}'`);
  expect(admin).toContain('const AWARD_FRAME_KEYS = awardRenderer?.AWARD_FRAME_KEYS');
  expect(room).toContain('root.ArcaneAwardRenderer?.awardRenderLayers');
  expect(room).not.toContain('assetMap.get(d.badge_frame_assets?.[tier])');
 });

 it('keeps awards to one HERMES ALEA definition image and hides per-award frame editing',()=>{
  const admin=read('features/honors/honors-admin.js');
  expect(admin).toContain("imageControls('definition',definition)");
  expect(admin).toContain("(isAward ? '' : '<label class=\"honors-wide\">Bildresurs-ID (HERMES)");
  expect(admin).toContain("(isAward ? '' : '<fieldset class=\"honors-frames honors-wide\">");
  expect(admin).toContain('En motivbild används för alla valörer.');
 });

 it('records the verified DEV frame references and the LIVE availability gap',()=>{
  const doc=read('docs/arcane-honors/ARCANE_AWARDS_V3.md');
  for(const tier of ['bronze','silver','gold']) expect(doc).toContain(`arcane-award-frame-${tier}`);
  expect(doc).toContain('were not present');
  expect(doc).toContain('No schema migration is required.');
 });
});
