import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const source=readFileSync(new URL('../features/chronicle/sessions.js',import.meta.url),'utf8');
describe('Header label for game session',()=>{
 it('shows Spelmöte without changing the existing button action',()=>{
  expect(source).toContain("btn.textContent='🎲 Spelmöte'");
  expect(source).not.toContain("btn.textContent='🎲 Session'");
  expect(source).toContain("btn.addEventListener('click',openGameSessionPanel)");
 });
});
