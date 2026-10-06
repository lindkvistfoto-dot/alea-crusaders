import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.4/dist/dice-box.es.min.js";
let box=null,ready=null;
const statusEl=()=>document.getElementById("dice3dStatus");
window.alea3dStatus=(message,state="",error=null)=>{
 const el=statusEl();if(!el)return;
 el.textContent=message;
 el.classList.toggle("ready",state==="ready");
 el.classList.toggle("error",state==="error");
 if(error)el.title=String(error?.message||error);else el.removeAttribute("title");
};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
async function waitForDiceHost(){
 const host=document.getElementById("dice3dHost");
 if(!host)throw new Error("3D-behållaren saknas.");
 for(let i=0;i<24;i++){
  const r=host.getBoundingClientRect();
  if(r.width>80&&r.height>80&&host.offsetParent!==null)return host;
  await nextFrame();
 }
 throw new Error("3D-behållaren har ingen användbar storlek.");
}
async function ensureAleaDice3D(){
 if(box)return box;
 if(ready)return ready;
 ready=(async()=>{
  window.alea3dStatus("3D-motor: startar…");
  await waitForDiceHost();
  const appPath=new URL(".",document.baseURI).pathname;
  const instance=new DiceBox({
   container:"#dice3dHost",
   id:"alea-dice-canvas",
   assetPath:appPath+"alea-dicebox-assets-v1.1.4/assets/dice-box/",
   origin:window.location.origin,
   theme:"default",
   themeColor:"#d8bd82",
   scale:7.2,
   enableShadows:true,
   shadowTransparency:.72,
   lightIntensity:1.15,
   spinForce:7,
   throwForce:5,
   gravity:1,
   offscreen:false
  });
  await instance.init();
  box=instance;
  box.show();
  box.resizeWorld?.();
  await nextFrame();
  window.alea3dStatus("3D-motor: klar","ready");
  return box;
 })().catch(e=>{
  ready=null;box=null;
  console.warn("3D dice unavailable; SVG fallback remains active",e);
  document.getElementById("dice3dHost")?.classList.add("unavailable");
  window.alea3dStatus("3D-motor: reservläge","error",e);
  throw e;
 });
 return ready;
}
window.alea3dPrepare=async()=>{
 try{
  document.getElementById("dice3dHost")?.classList.remove("unavailable");
  await ensureAleaDice3D();
 }catch(_){}
};
window.alea3dRoll=async(notation)=>{
 const host=await waitForDiceHost();
 host.classList.remove("unavailable");
 const b=await ensureAleaDice3D();
 b.show();
 b.resizeWorld?.();
 await nextFrame();
 const result=await b.roll(notation,{newStartPoint:true});
 return result;
};
window.alea3dClear=async()=>{if(box)box.clear()};
window.alea3dStatus("3D-motor: redo");

let innBox=null,innReady=null;
async function waitForDiceHostSelector(selector){
 const host=document.querySelector(selector);
 if(!host)throw new Error("3D-behållaren saknas: "+selector);
 for(let i=0;i<24;i++){
  const r=host.getBoundingClientRect();
  if(r.width>80&&r.height>80&&host.offsetParent!==null)return host;
  await nextFrame();
 }
 throw new Error("3D-behållaren har ingen användbar storlek: "+selector);
}
async function ensureInnDice3D(){
 if(innBox)return innBox;
 if(innReady)return innReady;
 innReady=(async()=>{
  await waitForDiceHostSelector("#innGameDiceHost");
  const appPath=new URL(".",document.baseURI).pathname;
  const instance=new DiceBox({
   container:"#innGameDiceHost",
   id:"alea-inn-dice-canvas",
   assetPath:appPath+"alea-dicebox-assets-v1.1.4/assets/dice-box/",
   origin:window.location.origin,
   theme:"default",
   themeColor:"#d8bd82",
   scale:5.6,
   enableShadows:true,
   shadowTransparency:.72,
   lightIntensity:1.15,
   spinForce:7,
   throwForce:5,
   gravity:1,
   offscreen:false
  });
  await instance.init();
  innBox=instance;
  innBox.show();
  innBox.resizeWorld?.();
  await nextFrame();
  return innBox;
 })().catch(error=>{
  innReady=null;innBox=null;
  console.warn("Inn DiceBox unavailable; fallback remains active",error);
  document.getElementById("innGameDiceHost")?.classList.add("unavailable");
  throw error;
 });
 return innReady;
}
window.alea3dInnPrepare=async()=>{
 try{
  document.getElementById("innGameDiceHost")?.classList.remove("unavailable");
  await ensureInnDice3D();
 }catch(_){}
};
window.alea3dInnRoll=async(notation)=>{
 const host=await waitForDiceHostSelector("#innGameDiceHost");
 host.classList.remove("unavailable");
 const b=await ensureInnDice3D();
 b.show();
 b.resizeWorld?.();
 await nextFrame();
 return b.roll(notation,{newStartPoint:true});
};
window.alea3dInnClear=async()=>{
 if(innBox)await innBox.clear();
};


let combatBox=null,combatReady=null;
async function ensureCombatDice3D(){
 if(combatBox)return combatBox;
 if(combatReady)return combatReady;
 combatReady=(async()=>{
  await waitForDiceHostSelector("#combatDiceHost");
  const appPath=new URL(".",document.baseURI).pathname;
  const instance=new DiceBox({
   container:"#combatDiceHost",
   id:"alea-combat-dice-canvas",
   assetPath:appPath+"alea-dicebox-assets-v1.1.4/assets/dice-box/",
   origin:window.location.origin,
   theme:"default",
   themeColor:"#d8bd82",
   scale:6.2,
   enableShadows:true,
   shadowTransparency:.72,
   lightIntensity:1.15,
   spinForce:7,
   throwForce:5,
   gravity:1,
   offscreen:false
  });
  await instance.init();
  combatBox=instance;
  combatBox.show();
  combatBox.resizeWorld?.();
  await nextFrame();
  return combatBox;
 })().catch(error=>{
  combatReady=null;combatBox=null;
  console.warn("Combat DiceBox unavailable; fallback remains active",error);
  document.getElementById("combatDiceHost")?.classList.add("unavailable");
  throw error;
 });
 return combatReady
}
window.alea3dCombatPrepare=async()=>{
 try{
  document.getElementById("combatDiceHost")?.classList.remove("unavailable");
  await ensureCombatDice3D()
 }catch(_){}
};
window.alea3dCombatRoll=async(notation)=>{
 const host=await waitForDiceHostSelector("#combatDiceHost");
 host.classList.remove("unavailable");
 const b=await ensureCombatDice3D();
 b.show();
 b.resizeWorld?.();
 await nextFrame();
 return b.roll(notation,{newStartPoint:true})
};
window.alea3dCombatClear=async()=>{
 if(combatBox)await combatBox.clear()
};
