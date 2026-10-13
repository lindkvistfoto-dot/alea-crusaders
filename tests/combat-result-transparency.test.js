import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../features/combat/attack-participants.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

describe('Combat roll result over illustrated attack background',()=>{
 it('loads the attack-card stylesheet containing the last opaque-result override',()=>{
  expect(html).toContain('features/combat/attack-participants.css?v=');
  expect(css).toContain('v0.35.153 – transparent attack outcome');
 });
 it('makes success and other roll outcomes translucent without affecting magic panel',()=>{
  const block=css.slice(css.indexOf('/* v0.35.153 – transparent attack outcome'));
  expect(block).toContain('.combat-mini-attack:not(.combat-mini-magic) .combat-attack-result{');
  expect(block).toContain('background:rgba(18,12,10,.34)');
  expect(block).toContain('.combat-attack-result:is(.success,.special,.perfect,.fail,.fumble)');
  expect(block).toContain('border-color:rgba(126,201,133,.72)');
  expect(block).toContain('border-color:rgba(210,108,98,.72)');
  expect(block).toContain('.combat-damage-result{');
  expect(block).toContain('background:rgba(30,20,15,.44)');
 });
 it('preserves legibility for users who request reduced transparency',()=>{
  const reduced=css.slice(css.indexOf('@media(prefers-reduced-transparency:reduce)',css.indexOf('v0.35.153 – transparent')));
  expect(reduced).toContain('.combat-attack-result:is(.success,.special,.perfect,.fail,.fumble)');
  expect(reduced).toContain('background:rgba(18,12,10,.9)');
  expect(reduced).toContain('background:rgba(30,20,15,.9)');
 });
});
