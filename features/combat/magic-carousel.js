/* Alea Crusaders v0.35.199 – locked magic-carousel MVP.
 * UI-only selector. The existing Expert preparation, cast and dice code
 * remains authoritative. No spell is cast by clicking a carousel tile. */
const COMBAT_MAGIC_CAROUSEL_MAX=12;
const combatMagicCarouselOffsets=new Map();
const combatMagicCarouselOrders=new Map();
const combatMagicCarouselSelectedKeys=new Map();
let combatMagicCancelBusy=false;

function combatMagicCarouselIdentity(actor){
 return String(centralCampaignId||'')+':'+String(actor?.source_type||'')+':'+String(actor?.source_id||actor?.id||'');
}
function combatMagicCarouselUsage(actor){
 try{
  const value=JSON.parse(localStorage.getItem('alea.magic.usage:'+combatMagicCarouselIdentity(actor))||'{}');
  return {counts:value.counts&&typeof value.counts==='object'?value.counts:{},
   seen:value.seen&&typeof value.seen==='object'?value.seen:{}};
 }catch(_){return {counts:{},seen:{}}}
}
function combatMagicCarouselRecordCasts(){
 if(!activeCombat)return;
 const changed=new Map();
 for(const action of combatActions||[]){
  if(action?.status!=='resolved'||action.source_data?.action_key!=='spell_cast'||
     !action.result?.outcome||!action.source_data?.spell_name)continue;
  const actor=combatants.find(row=>String(row.id)===String(action.combatant_id));
  if(!actor)continue;
  const id=combatMagicCarouselIdentity(actor);
  const usage=changed.get(id)||combatMagicCarouselUsage(actor);
  const castId=String(action.id);
  if(usage.seen[castId])continue;
  const spellName=String(action.source_data.spell_name).trim().toLocaleLowerCase('sv-SE');
  usage.seen[castId]=true;
  usage.counts[spellName]=(Number(usage.counts[spellName])||0)+1;
  changed.set(id,usage);
 }
 for(const [id,usage] of changed){
  try{
   const seen=Object.keys(usage.seen);
   if(seen.length>650)usage.seen=Object.fromEntries(seen.slice(-450).map(key=>[key,true]));
   localStorage.setItem('alea.magic.usage:'+id,JSON.stringify(usage));
  }catch(error){console.warn('Magikarusell: användningsstatistik kunde inte sparas',error)}
 }
}
function combatMagicCarouselItems(actor,action){
 const all=combatSpellOptions(actor),battleKey=String(activeCombat?.id||'')+':'+combatMagicCarouselIdentity(actor);
 let order=combatMagicCarouselOrders.get(battleKey);
 if(!order){
  // Freeze the order for the full battle, including after a page reload.
  // It is safe if browser storage is unavailable: use this session's cache.
  const orderStorageKey='alea.magic.order:'+battleKey;
  try{
   const saved=JSON.parse(localStorage.getItem(orderStorageKey)||'null');
   if(Array.isArray(saved)&&saved.length)order=saved;
  }catch(_){}
 }
 if(!order){
  const counts=combatMagicCarouselUsage(actor).counts;
  order=[...all].sort((a,b)=>{
   const count=row=>Number(counts[String(row.name||'').trim().toLocaleLowerCase('sv-SE')])||0;
   // During the prototype, show the two available real icons first when
   // usage counts are tied. Actual cast frequency always outranks artwork.
   const art=row=>combatSpellArtPath(row.icon_path)?2:combatSpellArtPath(row.image_path)?1:0;
   return count(b)-count(a)||art(b)-art(a)||String(a.name||'').localeCompare(String(b.name||''),'sv',{sensitivity:'base'})||
    combatSpellKey(a).localeCompare(combatSpellKey(b),'sv',{sensitivity:'base'})
  }).map(combatSpellKey);
  try{localStorage.setItem('alea.magic.order:'+battleKey,JSON.stringify(order))}catch(_){}
 }
 combatMagicCarouselOrders.set(battleKey,order); // frozen throughout battle
 const byKey=new Map(all.map(spell=>[combatSpellKey(spell),spell]));
 // A spell introduced during an ongoing combat must remain reachable.
 const missing=all.filter(spell=>!order.includes(combatSpellKey(spell)));
 const items=[...order.map(key=>byKey.get(key)).filter(Boolean),...missing].slice(0,COMBAT_MAGIC_CAROUSEL_MAX);
 const selected=byKey.get(String(action?.source_data?.spell_key||''));
 // A spell picked through "Alla" always appears in the visible carousel.
 if(selected&&!items.some(spell=>combatSpellKey(spell)===combatSpellKey(selected))){
  if(items.length===COMBAT_MAGIC_CAROUSEL_MAX)items.pop();
  items.push(selected);
 }
 return {items,total:all.length}
}
function combatMagicCarouselGlyph(value){
 const name=String(value||'').toLocaleLowerCase('sv-SE');
 if(/eld|brand|flam|salamander/.test(name))return '🔥';
 if(/blixt|ås|elektr/.test(name))return '⚡';
 if(/is|frost|köld/.test(name))return '❄';
 if(/skydd|beskydd|antimagi/.test(name))return '🛡';
 if(/jord|sten|klippa/.test(name))return '◆';
 if(/vatten|undin|regn/.test(name))return '💧';
 if(/luft|vind|storm|flyg/.test(name))return '✧';
 if(/mörk|skugg|natt/.test(name))return '☾';
 if(/ljus|sol/.test(name))return '☀';
 if(/hela|läk/.test(name))return '✚';
 return '✦';
}
function combatSpellCarouselHtml(actor,action){
 const {items,total}=combatMagicCarouselItems(actor,action);
 if(!items.length)return '<p class="combat-spell-empty">Inga tillgängliga besvärjelser.</p>';
 const actorId=String(actor.id),chosen=String(action?.source_data?.spell_key||'');
 const key=String(activeCombat?.id||'')+':'+actorId;
 // When the caster picks a new spell, scroll it into the highlighted
 // center slot. Mere arrow/swipe navigation must NOT change the choice.
 if(!combatMagicCarouselOffsets.has(key)||combatMagicCarouselSelectedKeys.get(key)!==chosen){
  const ix=items.findIndex(spell=>combatSpellKey(spell)===chosen);
  combatMagicCarouselOffsets.set(key,ix<0?0:ix);
  combatMagicCarouselSelectedKeys.set(key,chosen);
 }
 const focus=((Number(combatMagicCarouselOffsets.get(key))||0)%items.length+items.length)%items.length;
 const tiles=Array.from({length:5},(_,i)=>{
  const spell=items[((focus+i-2)%items.length+items.length)%items.length];
  const spellKey=combatSpellKey(spell),active=chosen===spellKey;
  const path=combatSpellArtPath(spell.icon_path||spell.image_path);
  const disabled=spell.item_spell&&(!spell.item_spell.ready||spell.item_spell.cast_mode==='automatic'||!(Number(spell.fv)>0));
  const art=path?'<span class="combat-carousel-spell-art" data-spell-art-path="'+escAttr(path)+
   '" data-focus-x="'+combatSpellArtNumber(spell.icon_focus_x??spell.image_focus_x,50)+
   '" data-focus-y="'+combatSpellArtNumber(spell.icon_focus_y??spell.image_focus_y,50)+
   '" data-zoom="'+combatSpellArtNumber(spell.icon_zoom,120,100,300)+'"><img alt="" hidden></span>':
   '<span class="combat-carousel-spell-glyph" aria-hidden="true">'+combatMagicCarouselGlyph(spell.name)+'</span>';
  return '<button type="button" class="combat-carousel-spell-tile'+(i===2?' center':'')+
   (active?' selected':'')+'" data-index="'+i+'" aria-pressed="'+active+'" '+
   'aria-label="Välj '+escAttr(spell.name)+'" title="'+escAttr(spell.name)+'"'+(disabled?' disabled':'')+
   ' onclick="selectCombatPreparedSpell(\''+escAttr(actorId)+'\',\''+escAttr(spellKey)+'\')">'+
   art+'<span class="combat-carousel-spell-label">'+escAttr(spell.name)+'</span></button>';
 }).join('');
 return '<div class="combat-magic-carousel" data-actor-id="'+escAttr(actorId)+'" aria-label="Besvärjelsekarusell">'+
  '<div class="combat-magic-carousel-banner">'+
   '<button type="button" class="combat-magic-carousel-arrow" aria-label="Föregående" onclick="combatShiftSpellCarousel(\''+escAttr(actorId)+'\',-1)">❮</button>'+
   '<div class="combat-magic-carousel-track" role="group" tabindex="0" aria-label="Svep mellan besvärjelser">'+tiles+'</div>'+
   '<button type="button" class="combat-magic-carousel-arrow" aria-label="Nästa" onclick="combatShiftSpellCarousel(\''+escAttr(actorId)+'\',1)">❯</button>'+
  '</div>'+
  '<div class="combat-magic-carousel-tools">'+
   (total>COMBAT_MAGIC_CAROUSEL_MAX?
    '<details class="combat-magic-carousel-all"><summary>⌕ Alla besvärjelser ('+total+')</summary>'+
      combatSpellChooserHtml(actor,action)+'</details>':'')+
   (action?.source_data?.spell_prepared&&!action.source_data?.item_magic?
    '<div class="combat-magic-carousel-eg" role="group" aria-label="Effektgrad">'+
     '<button type="button" aria-label="Minska effektgrad" onclick="stepCombatSpellEffect(\''+escAttr(actorId)+'\',-1)"'+
      (Number(action.source_data.effect_grade)<=1?' disabled':'')+'>−</button>'+
     '<strong>EG '+Math.max(1,Number(action.source_data.effect_grade)||1)+'</strong>'+
     '<button type="button" aria-label="Öka effektgrad" onclick="stepCombatSpellEffect(\''+escAttr(actorId)+'\',1)">+</button>'+
    '</div>':'')+
  '</div>'+
 '</div>';
}
function combatShiftSpellCarousel(actorId,direction){
 const actor=combatants.find(row=>String(row.id)===String(actorId)),action=combatChosenAction(actor);
 if(!actor||action?.source_data?.casting_spell)return;
 const {items}=combatMagicCarouselItems(actor,action);
 if(!items.length)return;
 const key=String(activeCombat?.id||'')+':'+actorId;
 const old=Number(combatMagicCarouselOffsets.get(key))||0;
 combatMagicCarouselOffsets.set(key,((old+direction)%items.length+items.length)%items.length);
 renderCombat();
}
function combatBindSpellCarousel(root){
 const track=root?.querySelector('.combat-magic-carousel-track');
 const container=track?.closest('.combat-magic-carousel');
 if(!track||!container)return;
 const actorId=container.dataset.actorId;
 let drag=null,suppressClick=false;
 track.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
 });
 track.addEventListener('pointerup',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag=null;
  if(Math.abs(dx)<26||Math.abs(dx)<Math.abs(dy)*1.2)return;
  suppressClick=true;event.preventDefault();event.stopPropagation();
  combatShiftSpellCarousel(actorId,-Math.sign(dx)*Math.max(1,Math.min(4,Math.round(Math.abs(dx)/68))));
 },true);
 track.addEventListener('click',event=>{
  if(!suppressClick)return;
  event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
 },true);
 track.addEventListener('pointercancel',()=>{drag=null});
 track.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();combatShiftSpellCarousel(actorId,event.key==='ArrowRight'?1:-1);
 });
 track.addEventListener('wheel',event=>{
  if(Math.abs(event.deltaX)<Math.abs(event.deltaY)&&!event.shiftKey)return;
  event.preventDefault();
  combatShiftSpellCarousel(actorId,Math.sign(event.deltaX||event.deltaY)||1);
 },{passive:false});
}
async function combatCancelPreparedSpell(actorId){
 const actor=combatants.find(row=>String(row.id)===String(actorId)),action=combatChosenAction(actor);
 if(!actor||!combatCanChoosePrimaryAction(actor)||action?.status!=='planned'||
    action.source_data?.action_key!=='spell_cast'||action.source_data?.casting_spell!==true||combatMagicCancelBusy)return;
 combatMagicCancelBusy=true;
 try{
  // Cancel old prepared action, then reuse the current SR's ONE primary
  // action slot. Nothing is cast and no new extra action is awarded.
  await dbJson('combat_actions?id=eq.'+encodeURIComponent(action.id)+'&status=eq.planned',{
   method:'PATCH',headers:{Prefer:'return=minimal'},
   body:JSON.stringify({status:'cancelled',updated_at:new Date().toISOString()})
  });
  combatSelectedTargetId=null;combatMobileMagicTargetPickerOpen=false;
  combatCloseRowActionMenu();
  await loadActiveCombat(null,{preserveSelectedTarget:false});
  const current=combatants.find(row=>String(row.id)===String(actorId));
  if(combatCanChoosePrimaryAction(current))await chooseCombatPrimaryAction(actorId,'spell_cast');
  combatActionMenuId=String(actorId);combatActionMenuKind='magic';
  renderCombat();
 }catch(error){
  console.error('Kunde inte avbryta besvärjelsen',error);
  alert('Kunde inte avbryta besvärjelsen: '+(error?.message||error));
  await loadActiveCombat(null,{preserveSelectedTarget:false});
 }finally{combatMagicCancelBusy=false}
}
