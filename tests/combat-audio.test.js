import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const combat=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const audio=readFileSync(new URL('../features/audio/engine.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');

describe('Sound registry and melee SFX',()=>{
 it('ships a user-controlled mixer with safe default disabled playback until browser gesture',()=>{
  expect(audio).toContain("const STORE='alea_audio_prefs_v1'");
  expect(audio).toContain("document.addEventListener('pointerdown'");
  expect(audio).toContain("function volumeFor(cue)");
  expect(audio).toContain("if(!prefs.enabled)stopAll()");
  expect(audio).toContain("currentlyPlaying.clear()");
 });
 it('uses authenticated admin database edits and path-limited audio storage',()=>{
  expect(audio).toContain("await dbJson('rule_sound_cues?cue_key=eq.'");
  expect(audio).toContain("if(file.size>8*1024*1024)");
  expect(audio).toContain("function safeAssetUrl(path)");
  expect(audio).toContain("await saveCue(cueKey,{asset_path:path})");
 });
 it('mounts a sound registry inside the normal administration navigation',()=>{
  expect(html).toContain("openAdminSection('sounds')");
  expect(html).toContain('id="adminSoundTable"');
  expect(html).toContain('features/audio/engine.js?v=0.35.29');
  expect(app).toContain("sounds:['Ljudregister'");
  expect(app).toContain("await window.aleaAudio?.renderAdmin?.()");
 });
 it('synchronizes roll/landing and only plays hit after a non-parried strike',()=>{
  const roll=combat.indexOf("async function combatRollDice(");
  expect(combat.indexOf("window.aleaAudio:null)?.play('dice.roll')",roll)).toBeLessThan(combat.indexOf("window.alea3dCombatRoll",roll));
  expect(combat.indexOf("window.aleaAudio:null)?.play('dice.land')",roll)).toBeGreaterThan(combat.indexOf("combatRenderDiceReadout(label,rolls);",roll));
  const attack=combat.indexOf("async function combatResolveAttackAction(");
  const swing=combat.indexOf("window.aleaAudio:null)?.play('melee.swing')",attack);
  const hit=combat.indexOf("window.aleaAudio:null)?.play('melee.hit')",attack);
  expect(swing).toBeGreaterThan(attack);
  expect(swing).toBeLessThan(combat.indexOf("rolled=await combatExpertRoll(label,fv)",attack));
  expect(hit).toBeGreaterThan(combat.indexOf("result.damage=await combatResolveDamage(actor,target,weapon,fullDamage,result.hit_location);",attack));
  expect(combat).toContain("rolled.success?'melee.parry':'melee.hit'");
  expect(combat).toContain("if(attackMode==='melee'&&!rolled.success)");
 });
});