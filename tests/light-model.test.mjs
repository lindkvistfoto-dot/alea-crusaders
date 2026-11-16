import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/light-model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {makeLight,lightPulse,validateLighting,defaultAmbient}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const torch=makeLight('torch',1,{x:100,y:200}),lantern=makeLight('lantern',1,{x:100,y:200});
assert.equal(torch.radius,180);assert.equal(torch.flicker,35);assert.equal(defaultAmbient().darkness,63);
const pulse=lightPulse(torch);assert.deepEqual(lightPulse(structuredClone(torch)),pulse,'Saved time and identity reproduce flicker');
let torchMin=2,torchMax=0,lanternMin=2,lanternMax=0;const values=[];
for(let i=0;i<1000;i++){torch.time=lantern.time=i/60;const a=lightPulse(torch),b=lightPulse(lantern);assert(a.brightness>0&&a.reach>0);torchMin=Math.min(torchMin,a.brightness);torchMax=Math.max(torchMax,a.brightness);lanternMin=Math.min(lanternMin,b.brightness);lanternMax=Math.max(lanternMax,b.brightness);values.push(a.brightness);}
assert(torchMax-torchMin>.2,'Torch varies over time');assert(lanternMax-lanternMin<(torchMax-torchMin)/2,'Lantern is calmer than torch');assert(values.some((v,i)=>i>60&&Math.abs(v-values[i-60])>.01),'No one-second periodic loop');
assert(makeLight('fireplace',2,{x:0,y:0}).ellipse<1);assert.notEqual(makeLight('moon',1,{x:0,y:0}).color,makeLight('sun',1,{x:0,y:0}).color);
assert.deepEqual(lightPulse(makeLight('sun',1,{x:0,y:0})),{brightness:1,reach:1});torch.flicker=0;assert.deepEqual(lightPulse(torch),{brightness:1,reach:1});
const scene={ambient:defaultAmbient(),lights:Array.from({length:10},(_,i)=>makeLight(['torch','fireplace','lantern','sun','moon'][i%5],i+1,{x:i*25,y:100}))};assert(validateLighting(scene));assert.deepEqual(JSON.parse(JSON.stringify(scene)),scene);assert(!validateLighting({...scene,lights:[...scene.lights,scene.lights[0]]}));
console.log('PASS: defaults, deterministic irregular flicker, calmer lantern, fireplace ellipse, stable beams, ten-light serialization and validation.');
