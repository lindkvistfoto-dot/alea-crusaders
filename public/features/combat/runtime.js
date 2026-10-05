const COMBAT_PHASE_LABELS={initiative:'Initiativ',declaration:'Deklaration',movement:'Rörelse',magic:'Magi',quick:'Snabba handlingar',normal:'Normal slagväxling',new_contact:'Ny närstridskontakt',late:'Sena handlingar',effects:'Besvärjelseeffekter',round_end:'Rundslut',reaction:'Reaktion'};
function combatPhaseLabel(p){return COMBAT_PHASE_LABELS[p]||String(p||'—')}
function combatSideLabel(s){return s==='heroes'?'Hjältar':s==='enemies'?'Fiender':'Neutral'}
function combatStatusLabel(s){return s==='setup'?'Förberedelse':s==='active'?'Pågår':s==='paused'?'Pausad':s==='completed'?'Avslutad':String(s||'—')}
function combatCanManage(){return !!activeUser()?.admin||centralCampaignRole==='gm'}
async function loadActiveCombat(){
 activeCombat=null;combatants=[];combatHexes=[];combatActions=[];combatLogRows=[];combatSelectedTargetId=null;
 if(!centralCampaignId){renderCombat();return null}
 try{
  let rows=await dbJson('combat_instances?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&status=in.(setup,active,paused)&select=*&order=updated_at.desc&limit=1');
  activeCombat=rows?.[0]||null;
  if(activeCombat){
   let cid=encodeURIComponent(activeCombat.id),round=Number(activeCombat.round_number)||1;
   let data=await Promise.all([
    dbJson('combatants?combat_id=eq.'+cid+'&select=*&order=sort_order.asc,name_snapshot.asc'),
    dbJson('combat_hexes?combat_id=eq.'+cid+'&select=*&order=r.asc,q.asc'),
    dbJson('combat_actions?combat_id=eq.'+cid+'&round_number=eq.'+round+'&select=*&order=sequence.asc,created_at.asc'),
    dbJson('combat_log?combat_id=eq.'+cid+'&select=*&order=id.desc&limit=60')
   ]);
   combatants=Array.isArray(data[0])?data[0]:[];
   combatHexes=Array.isArray(data[1])?data[1]:[];
   combatActions=Array.isArray(data[2])?data[2]:[];
   combatLogRows=(Array.isArray(data[3])?data[3]:[]).reverse()
  }
 }catch(e){console.error('Kunde inte läsa strid',e);activeCombat=null}
 renderCombat();return activeCombat
}
async function openCombat(){
 combatReturn=!$('mapPage').classList.contains('hidden')?'map':(!$('dicePage').classList.contains('hidden')?'dice':(!$('view').classList.contains('hidden')?'view':(!$('admin').classList.contains('hidden')?'admin':'home')));
 ['home','view','admin','mapPage','dicePage'].forEach(id=>$(id).classList.add('hidden'));
 $('combatPage').classList.remove('hidden');$('back').classList.add('hidden');$('editBtn').classList.add('hidden');$('cancelEditBtn').classList.add('hidden');
 $('combatBody').innerHTML='<div class="combat-empty">Laddar strid…</div>';
 await loadActiveCombat()
}
function closeCombat(){
 $('combatPage').classList.add('hidden');
 if(combatReturn==='map'){$('mapPage').classList.remove('hidden')}
 else if(combatReturn==='dice'){$('dicePage').classList.remove('hidden')}
 else if(combatReturn==='view'&&current){$('view').classList.remove('hidden');$('back').classList.remove('hidden');$('editBtn').classList.remove('hidden')}
 else if(combatReturn==='admin'&&activeUser()?.admin){$('admin').classList.remove('hidden')}
 else{$('home').classList.remove('hidden');renderCards()}
}
function selectCombatTarget(id){combatSelectedTargetId=id||null;renderCombat()}
function combatTokenInitials(name){let a=String(name||'?').trim().split(/\s+/).filter(Boolean);return(a.length>1?(a[0][0]+a[a.length-1][0]):a[0]?.slice(0,2)||'?').toUpperCase()}
function combatGeneratedHexes(){
 if(combatHexes.length)return combatHexes;
 let out=[];for(let r=0;r<7;r++)for(let q=0;q<10;q++)out.push({q,r,movement_mode:'free',sight_mode:'clear',movement_cost:1,_generated:true});return out
}
function combatHexGeometry(hexes,size=38){
 let raw=hexes.map(h=>{let q=Number(h.q)||0,r=Number(h.r)||0,x=Math.sqrt(3)*size*(q+r/2),y=1.5*size*r;return{h,x,y}});
 let minX=Math.min(...raw.map(p=>p.x))-size-12,maxX=Math.max(...raw.map(p=>p.x))+size+12,minY=Math.min(...raw.map(p=>p.y))-size-12,maxY=Math.max(...raw.map(p=>p.y))+size+12;
 let dx=-minX,dy=-minY,width=Math.max(520,maxX-minX),height=Math.max(420,maxY-minY);
 return{points:raw.map(p=>({...p,x:p.x+dx,y:p.y+dy})),dx,dy,width,height,size}
}
function combatHexPoints(x,y,size){
 let pts=[];for(let i=0;i<6;i++){let a=(Math.PI/180)*(60*i-30);pts.push((x+size*Math.cos(a)).toFixed(1)+','+(y+size*Math.sin(a)).toFixed(1))}return pts.join(' ')
}
function renderCombatMap(){
 let hexes=combatGeneratedHexes(),g=combatHexGeometry(hexes),byCoord=new Map(g.points.map(p=>[(Number(p.h.q)||0)+','+(Number(p.h.r)||0),p]));
 let terrain=g.points.map(p=>{let h=p.h,cls=['combat-hex'];if(h.movement_mode==='difficult')cls.push('difficult');if(h.movement_mode==='blocked')cls.push('move-blocked');if(h.sight_mode==='obscuring')cls.push('sight-obscuring');if(h.sight_mode==='blocked')cls.push('sight-blocked');return'<polygon class="'+cls.join(' ')+'" points="'+combatHexPoints(p.x,p.y,g.size-1.5)+'"><title>Hex '+h.q+','+h.r+' · rörelse '+(h.movement_mode||'free')+' · sikt '+(h.sight_mode||'clear')+'</title></polygon>'}).join('');
 let tokens=combatants.filter(c=>c.status!=='removed').map(c=>{let p=byCoord.get((Number(c.q)||0)+','+(Number(c.r)||0));if(!p){let x=Math.sqrt(3)*g.size*((Number(c.q)||0)+(Number(c.r)||0)/2)+g.dx,y=1.5*g.size*(Number(c.r)||0)+g.dy;p={x,y}}let side=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'';return'<g onclick="selectCombatTarget(\''+c.id+'\')"><circle class="combat-token '+side+selected+'" cx="'+p.x+'" cy="'+p.y+'" r="'+(g.size*.48)+'"><title>'+escAttr(c.name_snapshot)+'</title></circle><text class="combat-token-label" x="'+p.x+'" y="'+p.y+'">'+escAttr(combatTokenInitials(c.name_snapshot))+'</text></g>'}).join('');
 return'<svg viewBox="0 0 '+g.width+' '+g.height+'" preserveAspectRatio="xMidYMid meet" aria-label="Hexkarta">'+terrain+tokens+'</svg>'
}
function combatantCard(c){
 let cls=c.side==='heroes'?'hero':c.side==='enemies'?'enemy':'neutral',selected=combatSelectedTargetId===c.id?' selected':'';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':'/'+c.max_kp),move=c.movement_remaining==null?'—':c.movement_remaining;
 return'<button type="button" class="combatant-card '+cls+selected+'" onclick="selectCombatTarget(\''+c.id+'\')"><div class="name">'+escAttr(c.name_snapshot)+'</div><div class="meta">'+combatSideLabel(c.side)+' · KP '+kp+' · Förfl. '+move+(c.flying?' · Flyger':'')+'</div></button>'
}
function combatTargetHtml(){
 let c=combatants.find(x=>x.id===combatSelectedTargetId);if(!c)return'<div class="combat-target-body"><div class="combat-target-note">Klicka på en pjäs eller deltagare för att markera mål. Tillgängliga attacker kommer senare att räknas fram från avstånd, sikt, utrustning och kvarvarande handlingar.</div></div>';
 let kp=(c.current_kp==null?'—':c.current_kp)+(c.max_kp==null?'':' / '+c.max_kp),psy=(c.current_psy==null?'—':c.current_psy)+(c.max_psy==null?'':' / '+c.max_psy);
 return'<div class="combat-target-body"><div class="combat-target-name">'+escAttr(c.name_snapshot)+'</div><div class="combat-target-stat"><span>Sida</span><b>'+combatSideLabel(c.side)+'</b></div><div class="combat-target-stat"><span>KP</span><b>'+kp+'</b></div><div class="combat-target-stat"><span>PSY</span><b>'+psy+'</b></div><div class="combat-target-stat"><span>Position</span><b>'+c.q+', '+c.r+'</b></div><div class="combat-target-stat"><span>Rörelse</span><b>'+(c.flying?'Flygande':'Mark')+'</b></div><div class="combat-target-note">Nästa steg är att koppla målvalet till line of sight, räckvidd och handlingsknappar för aktuell utrustning.</div></div>'
}
function renderCombat(){
 let body=$('combatBody'),sub=$('combatSubtitle');if(!body)return;
 if(!activeCombat){
  if(sub)sub.textContent='Ingen aktiv strid';
  body.innerHTML='<div class="combat-empty"><h3>Ingen aktiv strid</h3><div class="combat-foundation-note">En planerad strid kan startas från en <b>Händelse</b>. För spontana möten kommer SL också kunna skapa en <b>Snabbfiende</b> direkt i stridsstarten utan att först spara den som kampanjmall.</div><div class="combat-schema-cards"><div class="combat-schema-card"><b>Händelse</b>Karta, startpositioner och kampanjfiender.</div><div class="combat-schema-card"><b>Spontan strid</b>Rollpersoner + kampanjfiender eller snabbfiender.</div><div class="combat-schema-card"><b>Snabbfiende</b>Namn, KP, attack, skada, Abs och förflyttning direkt vid start.</div><div class="combat-schema-card"><b>Spara senare</b>En bra snabbfiende kan senare göras till kampanjmall.</div></div><div class="combat-quick-note"><b>Datamodellen stödjer nu snabbfiender.</b> Själva startdialogen kopplar vi in tillsammans med nästa steg för stridsuppställning.</div></div>';return
 }
 if(sub)sub.textContent=activeCombat.name||'Aktiv strid';
 let winner=activeCombat.winning_side?(' · Initiativ: '+combatSideLabel(activeCombat.winning_side)):'';
 let participantHtml=combatants.length?combatants.map(combatantCard).join(''):'<div class="combat-target-body"><div class="combat-target-note">Inga synliga deltagare ännu.</div></div>';
 let logHtml=combatLogRows.length?combatLogRows.map(x=>'<div class="combat-log-row"><span class="combat-log-phase">'+escAttr(combatPhaseLabel(x.phase))+'</span>'+escAttr(x.message)+'</div>').join(''):'<div class="combat-log-row">Ingen stridshändelse loggad ännu.</div>';
 body.innerHTML='<div class="combat-shell"><div class="combat-topbar"><span class="combat-round">Runda '+activeCombat.round_number+'</span><span class="combat-phase">'+escAttr(combatPhaseLabel(activeCombat.phase))+'</span><span class="combat-status">'+escAttr(combatStatusLabel(activeCombat.status))+winner+'</span>'+(combatCanManage()?'<span class="combat-status">· SL-läge</span>':'')+'</div><aside class="combat-panel combat-participants"><h3>Deltagare</h3><div class="combat-participant-list">'+participantHtml+'</div></aside><div class="combat-board-wrap"><div class="combat-board-head"><span>Hexkarta</span><div class="combat-legend"><span>Fri</span><span>Svår</span><span>Blockerad</span></div></div><div class="combat-board">'+renderCombatMap()+'</div></div><aside class="combat-panel combat-target"><h3>Markerat mål</h3>'+combatTargetHtml()+'</aside><section class="combat-log"><h3>Stridslogg</h3><div class="combat-log-list">'+logHtml+'</div></section></div>'
}
