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
 function availableTemplates(){
  return (typeof activeUser==='function'&&activeUser()?.admin)
   ?(window.aleaMagicArtifacts?.all?.()||[]).filter(x=>x.active!==false)
   :[];
 }
 function applyTemplate(){
  const template=availableTemplates().find(x=>String(x.id)===String($('magicCreateTemplate')?.value));
  if(!template)return;
  let kind=template.item_type;
  if(kind==='wand')kind='staff';
  if(!Object.hasOwn(kinds,kind))kind='other';
  $('magicCreateType').value=kind;updateBase();
  if(template.base_kind&&template.base_item_id){
   const base=$('magicCreateBase');
   if(base&&[...base.options].some(x=>x.value===String(template.base_item_id)))base.value=String(template.base_item_id);
  }
  $('magicCreateName').value=template.name||'';
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
   window.aleaEquipmentCatalog?.load?.()||Promise.resolve(),
   (typeof activeUser==='function'&&activeUser()?.admin?
    window.aleaMagicArtifacts?.load?.():null)||Promise.resolve(),
   (typeof activeUser==='function'&&activeUser()?.admin?
    window.aleaMagicProperties?.load?.():null)||Promise.resolve(),
   typeof loadRuleMagicRegistry==='function'?loadRuleMagicRegistry():Promise.resolve()
  ]);
  $('skillModalTitle').textContent='Skapa magiskt föremål';
  $('skillModalBody').innerHTML=
   '<div class="rule-editor-grid character-magic-create">'+
    '<p class="wide muted">Skapa ett unikt exemplar för rollpersonen. Välj grundföremål och namn. Därefter konfigureras en eller flera magiska egenskaper utan specialkod för föremålet.</p>'+
    (availableTemplates().length?
     '<label class="wide">Återanvänd artefaktmall (valfritt)<select id="magicCreateTemplate" onchange="window.aleaCharacterMagicCreate.applyTemplate()">'+
      '<option value="">— Bygg från grunden —</option>'+
      availableTemplates().map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label>':'')+
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
  const template=availableTemplates().find(x=>String(x.id)===String($('magicCreateTemplate')?.value))||null;
  if(!name||name.length>160)return alert('Ange ett unikt föremålsnamn.');
  if(['weapon','armor','shield'].includes(type)&&!base)return alert('Välj grundföremål i registret.');
  const id=newEquipItemId(target);
  let item={equipId:id,name,isMagical:true,magicPowers:[]};
  if(template){
   const assigned=window.aleaMagicProperties?.powersFor?.(template.id)||[];
   item.magicPowers=assigned.filter(x=>x.active!==false).map(p=>{
    const definition=window.aleaMagicProperties?.definitionFor?.(p.property_id);
    const spell=typeof ruleSpells!=='undefined'?ruleSpells.find(s=>String(s.id)===String(p.spell_id)):null;
    return {
     id:newEquipItemId('power'),
     property_key:definition?.property_key||'special_power',
     property_name:definition?.name||'Magisk egenskap',
     kind:definition?.kind||'special',
     spell_id:p.spell_id||null,spell_key:spell?.spell_key||null,spell_name:spell?.name||null,
     effect_grade:p.effect_grade||1,effect_multiplier:p.effect_multiplier||1,
     cast_mode:p.cast_mode||'fixed',fixed_fv:p.fixed_fv??5,
     recharge_rule:p.recharge_rule||'none',
     psy_source:p.psy_source||'artifact',activation:p.activation||'action',
     max_charges:template.max_charges??null,
     charges_remaining:template.max_charges??null,charge_cost:p.charge_cost||0,
     uses_per_day:p.uses_per_day??null,uses_today:0,last_used_day:null,
     manual_locked:false,
     target_attribute:p.target_attribute||'',bonus_value:p.bonus_value||0,
     target_text:p.target_text||'',duration_text:p.duration_text||'',details:p.details||''
    };
   })
  }
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
  if(item.magicPowers.length)window.openCharacterItemPowers(target,index);
  else await window.editCharacterItemPower(target,index,-1);
 }
 window.aleaCharacterMagicCreate={open,create,updateBase,applyTemplate,masters};
 window.openCreateCharacterMagicItem=open;
})();
