import { describe, it, expect } from 'vitest';
import { cameraFor, usePortrait } from '../features/crypt/camera.js';
import { villageCase, evaluateVillage } from '../scripts/crypt-camera-benchmark.mjs';

describe('Kryptans dörr · geographic camera counterexample', () => {
  it.each([[1280,800],[390,234]])('frames the thirty known places at %d × %d and switches figures by projected size', (width,height) => {
    const scene = villageCase();
    const overview = evaluateVillage(scene,width,height,'map');
    const personal = evaluateVillage(scene,width,height,'person');
    expect(overview.placesInFrame).toBe(30);
    expect(overview.heroes.map(a=>a.portrait)).toEqual([true,true,true]);
    expect(overview.adjacentCentresPixels).toBeLessThan(3);
    expect(personal.heroes.find(a=>a.id==='astrid')?.portrait).toBe(false);
    expect(personal.placesInFrame).toBe(1);
  });
  it('uses the same party camera with opponents off-screen or absent', () => {
    const scene=villageCase(), options={camera:'party',selectedHero:'astrid'};
    const before=cameraFor(scene,options,1280,800);
    scene.actors.push({id:'other',kind:'guard',x:-10000,y:5000});
    expect(cameraFor(scene,options,1280,800)).toEqual(before);
  });
  it('keeps the previous representation in the transition interval', () => {
    expect(usePortrait('hero',29,false)).toBe(true);
    expect(usePortrait('hero',35,true)).toBe(true);
    expect(usePortrait('hero',35,false)).toBe(false);
    expect(usePortrait('hero',40,true)).toBe(false);
    expect(usePortrait('guard',10,true)).toBe(false);
  });
  it('bounds the current room at an observed doorway even when a strip spans both rooms', () => {
    const scene={width:1000,height:600,pixelsPerMeter:32,
      actors:[{id:'west',kind:'hero',x:150,y:100},{id:'east',kind:'hero',x:730,y:150}],
      door:{x:500,endX:500,y:150,endY:250},floor:[{x:50,y:100,width:840,height:220,visibility:'visible'}]};
    const center=c=>(500-c.x)/c.scale;
    expect(center(cameraFor(scene,{camera:'room',selectedHero:'west'},1000,600))).toBe(275);
    expect(center(cameraFor(scene,{camera:'room',selectedHero:'east'},1000,600))).toBe(695);
    const noObservedDoor={...scene,door:null,floor:[{x:50,y:100,width:200,height:220,visibility:'memory'}]};
    expect(center(cameraFor(noObservedDoor,{camera:'room',selectedHero:'west'},1000,600))).toBe(150);
  });
  it('fits only located, living combatants and ignores turn slots without a visible position', () => {
    const scene={width:1000,height:600,pixelsPerMeter:32,actors:[
      {id:'lyra',kind:'hero',x:200,y:175},{id:'seen',kind:'guard',x:490,y:190}],
      battle:{combatants:[{id:'lyra',hp:10},{id:'seen',hp:10}]}};
    const frame=()=>cameraFor(scene,{camera:'combat'},1000,600);
    const withObserver=frame();
    scene.battle.combatants.push({id:'unlocated',hp:10});
    expect(frame()).toEqual(withObserver);
    scene.battle.combatants[1].hp=0;
    const solo=frame();
    expect(solo.scale).toBeGreaterThan(withObserver.scale);
    expect((500-solo.x)/solo.scale).toBeCloseTo(200);
  });
});
