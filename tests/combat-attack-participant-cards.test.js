import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rt=read('features/combat/runtime.js');
const html=read('index.html');
const css=read('features/combat/attack-participants.css');
const begin=rt.indexOf('function combatMiniParticipantHtml(');
const end=rt.indexOf('// Spell feedback is presentation-only',begin);
if(begin<0||end<begin)throw Error('Combat mini participant renderer not found');
const section=rt.slice(begin,end);
function participant(row,role='ATTACKERAR',details='Dödsbringaren'){
 const context={
  combatRowPortraitUrl:c=>c?.portrait||'',
  combatTokenInitials:name=>name.split(' ').map(part=>part[0]).join(''),
  escAttr:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
 };
 runInNewContext(section+'\nthis.participant=combatMiniParticipantHtml;',context);
 return context.participant(role,row,details);
}
describe('Attack panel portrait cards v0.35.134',()=>{
 it('shows a real attacker image with name and no KP row',()=>{
  const card=participant({name_snapshot:'Astrid Eldhjärta',current_kp:10,max_kp:18,portrait:'https://example.test/astrid.png'});
  expect(card).toContain('combat-duelist-card');
  expect(card).toContain('combat-duelist-portrait');
  expect(card).toContain('src="https://example.test/astrid.png"');
  expect(card).toContain('ATTACKERAR');
  expect(card).toContain('Astrid Eldhjärta');
  expect(card).not.toContain('KP 10 / 18');
  expect(card).toContain('title="Astrid Eldhjärta · Dödsbringaren"');
  expect(card).toContain('combat-duelist-card attacker');
 });
 it('uses defender portrait and omits downed KP beneath it',()=>{
  const card=participant({name_snapshot:"Kva'argh",current_kp:0,max_kp:11,portrait:'blob:portrait'},'FÖRSVARAR','Valt mål');
  expect(card).toContain('FÖRSVARAR');
  expect(card).toContain('src="blob:portrait"');
  expect(card).toContain("Kva'argh");
  expect(card).not.toContain('KP 0 / 11');
  expect(card).toContain('title="Kva\'argh · Valt mål"');
  expect(card).toContain('combat-duelist-card defender');
 });
 it('uses initials if image is absent or cannot load',()=>{
  const noPortrait=participant({name_snapshot:'Rolf Sköld',current_kp:8,max_kp:8,portrait:''});
  const withPortrait=participant({name_snapshot:'Rolf Sköld',portrait:'https://example.test/image.png'});
  expect(noPortrait).toContain('combat-duelist-initials');
  expect(noPortrait).toContain('>RS</span>');
  expect(noPortrait).not.toContain('<img');
  expect(withPortrait).toContain('onerror="this.hidden=true;this.nextElementSibling.hidden=false"');
 });
 it('escapes text and image URL and does not write untrusted HTML',()=>{
  const card=participant({name_snapshot:'<Rolf>',current_kp:8,max_kp:8,portrait:'https://example.test/?q="x"&f=y'},'FÖRSVARAR','<svg>');
  expect(card).not.toContain('<svg>');
  expect(card).toContain('&lt;Rolf&gt;');
  expect(card).toContain('&lt;svg&gt;');
  expect(card).toContain('&quot;x&quot;&amp;f=y');
 });
 it('renders identical card component for normal attacks and parry reaction',()=>{
  const panel=rt.slice(rt.indexOf('function combatAttackPanelHtml('),rt.indexOf('function combatTurnPortraitHtml('));
  expect((panel.match(/combatMiniParticipantHtml\('ATTACKERAR'/g)||[])).toHaveLength(2);
  expect((panel.match(/combatMiniParticipantHtml\('FÖRSVARAR'/g)||[])).toHaveLength(2);
  expect(panel).toContain('combatAttackResultHtml(attack)');
  expect(panel).toContain('combatAttackResultHtml(action)');
 });
 it('removes the redundant ANFALL heading entirely',()=>{
  const panel=rt.slice(rt.indexOf('function combatAttackPanelHtml('),rt.indexOf('function combatTurnPortraitHtml('));
  expect(panel).not.toContain('<div class="combat-mini-title"><span>ANFALL</span></div>');
  expect(panel).toContain('combat-confirm-attack');
  expect(panel).not.toContain("escAttr(actor.name_snapshot)+(target?' → '");
  expect(panel).toContain("combatMiniParticipantHtml('ATTACKERAR',actor");
  expect(panel).toContain("combatMiniParticipantHtml('FÖRSVARAR',target");
 });
 it('mirrors defender portrait to the far right and right aligns its text at all widths',()=>{
  expect(css).toContain('.combat-mini-side.combat-duelist-card.defender');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) clamp(46px,4.8vw,62px)');
  expect(css).toContain('.combat-duelist-card.defender .combat-duelist-portrait');
  expect(css).toContain('grid-column:2');
  expect(css).toContain('.combat-duelist-card.defender .combat-duelist-copy');
  expect(css).toContain('grid-column:1');
  expect(css).toContain('text-align:right');
  expect(css).toContain('align-items:flex-end');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) clamp(38px,11vw,58px)');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 38px');
 });
 it('keeps a two-column duel in mobile and desktop with dynamic text',()=>{
  expect(html).toContain('features/combat/attack-participants.css?v=');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr)');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 15px minmax(0,1fr)');
  expect(css).toContain('@media(max-width:390px)');
  expect(css).toContain('overflow-wrap:anywhere');
  expect(css).toContain('object-fit:cover');
  expect(css).toContain('linear-gradient(115deg');
 });
});
