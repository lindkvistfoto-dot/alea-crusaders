/* v0.35.86 — Wizard: create a magical item FROM an ordinary base model.
 * Produces one unique owned instance; ordinary rule masters stay untouched. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kinds={weapon:'Vapen',armor:'Rustning',shield:'Sköld',amulet:'Amulett',ring:'Ring',staff:'Stav / trollstav',equipment:'Utrustning',other:'Annat föremål'};
 function allowed(){return !!current&&canEditCharacter(current)}
 function baseKind(type){return ['weapon','armor','shield'].includes(type)?type:'equipment'}
 function masters(type){
  if(type==='weapon')return typeof ruleWeapons!=='undefined'?ruleWeapons:[];
  if(type==='armor')return typeof ruleArmorTypes!=='undefined'?ruleArmorTypes:[];
  if(type==='shield')return typeof ruleShields!=='undefined'?ruleShields:[];
  return window.aleaEquipmentCatalog?.all?.()||[]
 }
 function updateBase(){
  const type=$('magicCreateType')?.value||'equipment',select=$('magicCreateBase');
  if(!select)return;
  const entries=masters(type);
  select.innerHTML='<option value="">— '+(['weapon','armor','shield'].includes(type)?'Välj grundföremål':'Fristående / eget föremål')+' —</option>'+
   entries.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  select.required=['weapon','armor','shield'].includes(type);
  $('magicCreateName').placeholder=type==='weapon'?'Ex. Dödsbringaren':type==='amulet'?'Ex. Nattens amulett':'Ange ett unikt namn';
 }
 async function open(){
  if(!allowed())return;
  await Promise.allSettled([
   typeof loadRuleWeapons==='function'?loadRuleWeapons():Promise.resolve(),
   typeof loadRuleArmorRegistry==='function'?loadRuleArmorRegistry():Promise.resolve(),
   typeof loadRuleShields==='function'?loadRuleShields():Promise.resolve(),
   window.aleaEquipmentCatalog?.load?.()||Promise.resolve()
  ]);
  $('skillModalTitle').textContent='Skapa magiskt föremål';
  $('skillModalBody').innerHTML=
   '<div class="rule-editor-grid character-magic-create">'+
    '<p class="wide muted">Skapa ett unikt exemplar för rollpersonen. Välj grundföremål och namn. Därefter konfigureras en eller flera magiska egenskaper utan specialkod för föremålet.</p>'+
    '<label>Typ<select id="magicCreateType" onchange="window.aleaCharacterMagicCreate.updateBase()">'+
     Object.entries(kinds).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join('')+'</select></label>'+
    '<label>Grundföremål<select id="magicCreateBase"></select></label>'+
    '<label class="wide">Unikt föremålsnamn<input id="magicCreateName" maxlength="160" placeholder="Ex. Dödsbringaren"></label>'+
    '<div class="rule-editor-actions wide"><button type="button" class="btn" onclick="closeSkillInfo()">Avbryt</button>'+
     '<button type="button" class="btn primary" onclick="window.aleaCharacterMagicCreate.create()">Skapa och konfigurera</button></div></div>';
  $('skillModal').classList.remove('hidden');
  updateBase();
 }
 async function create(){
  if(!allowed())return;
  const type=$('magicCreateType')?.value||'equipment';
  if(!Object.hasOwn(kinds,type))return alert('Välj föremålstyp.');
  const target=baseKind(type);
  const baseId=$('magicCreateBase')?.value||'',base=masters(type).find(x=>String(x.id)===String(baseId))||null;
  const name=$('magicCreateName')?.value.trim()||'';
  if(!name||name.length>160)return alert('Ange ett unikt föremålsnamn.');
  if(['weapon','armor','shield'].includes(type)&&!base)return alert('Välj grundföremål i registret.');
  const id=newEquipItemId(target);
  let item={equipId:id,name,isMagical:true,magicPowers:[]};
  if(type==='weapon'){
   item=copyRuleWeaponToInstance(item,base);
   item.name=name;
   item.fv='';item.erf=0;item.materialKey='standard';item.material='Standard';
  }else if(type==='armor'){
   item={...item,name,armorTypeId:base.id,armorTypeKey:base.type_key,
    materialKey:'standard',material:'Standard',abs:Number(base.absorption||0),
    bep:Number(base.bep||0),baseAbs:Number(base.absorption||0),
    baseBep:Number(base.bep||0),magicBlocking:false};
  }else if(type==='shield'){
   item=applyCharacterShieldMaster({...item,fv:'',erf:0},base);
   item.name=name;
  }else{
   item={...item,name,itemSubtype:type,bep:base?.bep??0,
    itemKey:base?.item_key||null,can_carry:base?.can_carry===true,count:1};
  }
  const arr=current[({weapon:'weapons',armor:'armor',shield:'shields',equipment:'equipment'})[target]];
  if(!Array.isArray(arr))return alert('Utrustningsregistret är inte tillgängligt.');
  const index=arr.push(item)-1;
  save();
  if(target==='equipment')renderEquipment();
  else renderWeapons();
  await window.editCharacterItemPower(target,index,-1);
 }
 window.aleaCharacterMagicCreate={open,create,updateBase,masters};
 window.openCreateCharacterMagicItem=open;
})();
