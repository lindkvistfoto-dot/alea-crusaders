/* Visual pilot only. Opt in with ?arcanePaperDoll=1; nothing is persisted. */
(function(){
 'use strict';
 if(new URLSearchParams(window.location.search).get('arcanePaperDoll')!=='1')return;
 const assetUrl=new URL('astrid-paper-doll.webp',document.currentScript.src).href;
 // Original 24813.png: 900×780. Base top-face centre (451,604), width 216 px.
 const art={width:900,height:780,anchorX:451,anchorY:604,baseWidth:216};
 let mode='classic',loading=false,ready=false,failed=false;
 function isAstrid(row){
  if(row?.source_type!=='character')return false;
  const sourceId=String(row.source_id||'');
  if(!sourceId)return false;
  if(sourceId==='astrid')return true;
  // Local character ID survives database hydration as data.id; source_id is the DB ID.
  return typeof chars!=='undefined'&&(chars||[]).some(c=>
   c.id==='astrid'&&String(c._dbId||c.id)===sourceId)
 }
 function refresh(){
  if(typeof renderCombat==='function')renderCombat();
 }
 async function setMode(next){
  if(!['classic','paper-doll'].includes(next))return;
  mode=next;failed=false;
  if(mode==='classic'||ready){refresh();return}
  if(loading){refresh();return}
  loading=true;refresh();
  const image=new Image();
  try{
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=assetUrl});
   ready=true;
  }catch(_error){mode='classic';failed=true}
  finally{loading=false;refresh()}
 }
 function controlsHtml(){
  return '<div class="combat-paper-doll-controls" role="group" aria-label="Utvecklarpilot: Astrids markör">'+
   '<span>Astrid · utvecklarpilot</span>'+
   '<button type="button" aria-pressed="'+(mode==='classic')+'" onclick="aleaAstridPaperDoll.setMode(\'classic\')">Klassisk</button>'+
   '<button type="button" aria-pressed="'+(mode==='paper-doll')+'" onclick="aleaAstridPaperDoll.setMode(\'paper-doll\')">Arcane Paper Doll</button>'+
   (loading?'<small role="status">Laddar bild…</small>':'')+
   (failed?'<small role="status">Bilden kunde inte laddas. Klassisk markör visas.</small>':'')+
  '</div>'
 }
 function render(classic,row,cell,g,stateClasses=''){
  if(mode!=='paper-doll'||!ready||!isAstrid(row)||row.status==='dead'||row.status==='removed')return classic;
  const scale=Math.sqrt(3)*g.size*.94/art.baseWidth;
  // Keep the classic hit geometry, including its original scale and translation.
  // The tall artwork has no pointer events and no portrait hex clip path.
  return '<g class="combat-paper-doll-classic">'+classic+'</g>'+
   '<g class="combat-miniature combat-paper-doll'+stateClasses+'" transform="translate('+cell.x+' '+cell.y+')" aria-hidden="true" pointer-events="none">'+
    '<image class="combat-paper-doll-image" href="'+assetUrl+'" x="'+(-art.anchorX*scale)+'" y="'+(-art.anchorY*scale)+'" width="'+(art.width*scale)+'" height="'+(art.height*scale)+'" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>'+
    '<polygon class="combat-paper-doll-ring" points="'+combatHexPoints(0,0,g.size*.94)+'" pointer-events="none"/>'+
   '</g>'
 }
 window.aleaAstridPaperDoll={controlsHtml,render,setMode};
})();
