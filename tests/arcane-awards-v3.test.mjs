import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('ARCANE AWARDS V3',()=>{
 it('pins the three frame keys in one shared renderer used by admin and Trophy Room',()=>{
  const renderer=read('features/honors/award-renderer.js');
  const admin=read('features/honors/honors-admin.js');
  const room=read('features/trophy-room/room.js');
  for(const tier of ['bronze','silver','gold']) expect(renderer).toContain(`${tier}: 'arcane-award-frame-${tier}'`);
  expect(admin).toContain('const AWARD_FRAME_KEYS = awardRenderer?.AWARD_FRAME_KEYS');
  expect(room).toContain('awardRenderer?.awardRenderLayers');
  expect(room).toContain('awardRenderer.mountAward');
  expect(room).not.toContain('assetMap.get(d.badge_frame_assets?.[tier])');
 });

 it('mounts an automatically detected accent with aligned gemstones and crown backing',()=>{
  const renderer=read('features/honors/award-renderer.js');
  const admin=read('features/honors/honors-admin.js');
  const entry=read('features/honors/honors-entry.js');
  const roomCss=read('features/trophy-room/room.css');
  expect(renderer).toContain('crown-background');
  const context={};context.globalThis=context;vm.runInNewContext(renderer,context);
  expect(context.ArcaneAwardRenderer.awardGemKey('top','blue')).toBe('arcane-award-gem-diamond-blue');
  expect(context.ArcaneAwardRenderer.awardGemKey('crown','blue')).toBe('arcane-award-gem-round-blue');
  expect(admin).toContain('async function detectAwardAccent(file)');
  expect(admin).toContain('async function detectAwardAccentFromUrl(url)');
  expect(entry).toContain('onSaveAccent:async');
  expect(roomCss).toContain('top:77.5%');
 });
 it('keeps awards to one HERMES ALEA definition image and hides per-award frame editing',()=>{
  const admin=read('features/honors/honors-admin.js');
  expect(admin).toContain("imageControls('definition',definition)");
  expect(admin).toContain("(isAward ? '' : '<label class=\"honors-wide\">Bildresurs-ID (HERMES)");
  expect(admin).toContain("(isAward ? '' : '<fieldset class=\"honors-frames honors-wide\">");
  expect(admin).toContain('En motivbild används för alla valörer.');
  expect(admin).toContain('illustrationen inom 80 % av diametern');
  expect(admin).toContain('äkta RGBA-transparens utanför cirkeln');
 });

 it('records the verified DEV and LIVE frame references and defers criteria',()=>{
  const doc=read('docs/arcane-honors/ARCANE_AWARDS_V3.md');
  for(const tier of ['bronze','silver','gold']) expect(doc).toContain(`arcane-award-frame-${tier}`);
  expect(doc).toContain('published to LIVE through HERMES CORE');
  expect(doc).toContain('No schema migration is required.');
  expect(doc).toContain('Award tier criteria and tier assignment are deferred to the next phase.');
 });
});
