/* BENGALI v1 · pure delivery contracts, no production activation. */
(function(root){
 'use strict';
 const api=root.AleaBattleArt=root.AleaBattleArt||{};
 const ownerFields=['characterId','campaignNpcId','campaignMonsterId','globalNpcId','combatantId'];
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const list=value=>Array.isArray(value)?value:[];
 const text=value=>typeof value==='string'?value:'';
 const facing=value=>Number.isInteger(value)?((value%6)+6)%6:null;
 const directions=Object.freeze([
  {facing:0,dq:1,dr:0,view:'right',label:'Höger'},
  {facing:1,dq:0,dr:1,view:'right',label:'Nedåt höger'},
  {facing:2,dq:-1,dr:1,view:'left',label:'Nedåt vänster'},
  {facing:3,dq:-1,dr:0,view:'left',label:'Vänster'},
  {facing:4,dq:0,dr:-1,view:'left',label:'Uppåt vänster'},
  {facing:5,dq:1,dr:-1,view:'right',label:'Uppåt höger'}
 ].map(Object.freeze));
 function ownerKey(owner){
  if(!owner||typeof owner!=='object')return null;
  const fields=ownerFields.filter(key=>owner[key]!=null);
  return fields.length===1&&uuid(owner[fields[0]])?fields[0]+':'+owner[fields[0]].toLowerCase():null;
 }
 function safePath(path){
  return typeof path==='string'&&path.length>0&&path.length<=1024&&
   path.split('/').every(part=>/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part)&&part!=='.'&&part!=='..')&&
   /\.webp$/.test(path);
 }
 // Storage references only. URL creation/signing belongs to an injected delivery adapter.
 function validAsset(asset){
  return !!asset&&uuid(asset.id)&&asset.status==='active'&&asset.verified===true&&
   ['campaign-actor-images','alea-hermes-public'].includes(asset.bucket)&&safePath(asset.path)&&
   /^[a-f0-9]{64}$/.test(asset.app_sha256)&&Number.isSafeInteger(asset.app_bytes)&&asset.app_bytes>0&&
   Number.isInteger(asset.width)&&asset.width>0&&asset.width<=4096&&
   Number.isInteger(asset.height)&&asset.height>0&&asset.height<=4096;
 }
 function layoutFor(asset,request){
  const shape=request.shape||'single';
  return list(asset?.layouts).find(layout=>layout&&layout.shape===shape&&
   layout.profile===(request.layoutProfile||shape+'-v1')&&
   (layout.facing===request.facing||(shape==='single'&&layout.facing==null))&&
   Number.isFinite(layout.anchor?.x)&&layout.anchor.x>=0&&layout.anchor.x<=asset.width&&
   Number.isFinite(layout.anchor?.y)&&layout.anchor.y>=0&&layout.anchor.y<=asset.height&&
   Number.isFinite(layout.groundWidthPx)&&layout.groundWidthPx>0&&
   Number.isFinite(layout.groundWidthHex)&&layout.groundWidthHex>0&&
   Number.isFinite(layout.scale)&&layout.scale>0)||null;
 }
 Object.assign(api,{
  CONTRACT_VERSION:1,DEFAULT_FLAGS:Object.freeze({battlePoses:false}),
  enabled:flags=>flags?.battlePoses===true,
  DIRECTIONS:directions,
  SLOTS:Object.freeze(['battle-front','battle-right','battle-left','mounted-front','mounted-right','mounted-left']),
  SYSTEM_ART:Object.freeze({base:'arcane-paper-doll-hexagon-base',stand:'arcane-portrait-stand'}),
  uuid,list,text,facing,ownerKey,validAsset,layoutFor
 });
})(globalThis);
