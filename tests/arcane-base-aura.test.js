import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../features/combat/paper-doll-map.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/combat/astrid-paper-doll.css',import.meta.url),'utf8');
it('uses removable base aura instead of legacy green hex ring',()=>{
 expect(js).toContain('combat-base-aura--');
 expect(js).not.toContain('combat-paper-doll-universal-ring"/>');
 expect(js).toContain("actor?.side==='enemies'?'enemy'");
 expect(js).toContain("actor?.side==='neutral'?'npc'");
 expect(js).toContain('active-turn');
 expect(css).toContain('--arcane-aura-opacity');
 expect(css).toContain('.combat-base-aura--gold');
});
