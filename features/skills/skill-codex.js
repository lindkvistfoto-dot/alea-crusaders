/* ARCANE SKILL CODEX — a read-only presentation layer for registered skills.
 * Reuses the existing #skillModal; weapon/equipment modals retain their old layout.
 * Artwork is loaded as authenticated Blobs from the same private buckets as admin.
 */
(function(){
 'use strict';
 const SKILL_BUCKET='alea-skill-art';
 const HERMES_BUCKET='alea-hermes-public';
 const HERMES_ICON=/^hermes\/skill\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{64}\.webp$/;
 const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const urls=new Set();
 let generation=0;
 function modal(){return document.getElementById('skillModal')}
 function reset(){
  generation++;
  for(const url of urls)URL.revokeObjectURL(url);
  urls.clear();
  const root=modal();
  if(!root)return;
  root.classList.remove('skill-codex-active');
  root.querySelector('[data-skill-codex-icon]')?.remove();
 }
 function stat(label,value){
  return '<div class="skill-codex-stat"><span class="skill-codex-stat-label">'+safe(label)+'</span>'+
   '<strong class="skill-codex-stat-value">'+safe(value==null||value===''?'—':value)+'</strong></div>';
 }
 function validArt(row,kind){
  const path=row?.[kind==='icon'?'icon_path':'illustration_path'];
  if(typeof path!=='string'||!path)return '';
  if(!window.aleaSkillArt?.validPath?.(path,String(row.id||''),kind))return '';
  return path;
 }
 async function loadArt(row,kind,path,token){
  const host=modal()?.querySelector(kind==='icon'?'[data-skill-codex-icon]':'[data-skill-codex-hero]');
  if(!host||!path||typeof mapStorageFetch!=='function')return;
  const bucket=kind==='icon'&&HERMES_ICON.test(path)?HERMES_BUCKET:SKILL_BUCKET;
  let url='';
  try{
   const response=await mapStorageFetch('object/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'GET'});
   if(!response.ok)throw Error('Kunde inte läsa färdighetsbild ('+response.status+')');
   const blob=await response.blob();
   const accepted=kind==='icon'?['image/png','image/webp']:['image/png','image/jpeg','image/webp'];
   if(!blob.size||!accepted.includes(blob.type))throw Error('Felaktigt bildformat');
   url=URL.createObjectURL(blob);
   const currentHost=modal()?.querySelector(kind==='icon'?'[data-skill-codex-icon]':'[data-skill-codex-hero]');
   if(token!==generation||currentHost!==host||!modal()?.classList.contains('skill-codex-active')){
    URL.revokeObjectURL(url);return;
   }
   const img=document.createElement('img');
   img.alt=kind==='icon'?'Färdighetsikon för '+(row?.name||'färdigheten'):'Illustration av '+(row?.name||'färdigheten');
   img.decoding='async';
   img.src=url;
   host.querySelector('.skill-codex-hero-fallback')?.remove();
   host.replaceChildren(img);
   host.classList.remove('is-empty');
   if(kind==='illustration')host.classList.add('has-art');
   urls.add(url);
  }catch(error){
   if(url)URL.revokeObjectURL(url);
   if(token===generation)console.warn('ARCANE SKILL CODEX:',error.message||error);
  }
 }
 function render(row,fallbackName){
  reset();
  const root=modal(),title=document.getElementById('skillModalTitle'),body=document.getElementById('skillModalBody');
  if(!root||!title||!body)return;
  const skill=row||{};
  const name=skill.name||fallbackName||'Färdighet';
  title.textContent=name;
  const header=title.closest('.modalhead');
  const icon=document.createElement('span');
  icon.className='skill-codex-icon is-empty';
  icon.dataset.skillCodexIcon='';
  icon.setAttribute('role','img');
  icon.setAttribute('aria-label','Färdighetsikon');
  icon.textContent='✦';
  header?.insertBefore(icon,title);
  const description=skill.description||'Ingen beskrivning är inlagd.';
  body.innerHTML='<div class="skill-codex-hero" data-skill-codex-hero>'+
    '<div class="skill-codex-hero-fallback">Illustration kommer snart</div></div>'+
    '<div class="skill-codex-stats">'+
     stat('Typ',skill.type)+
     stat('Grundegenskap',skill.grundegenskap||skill.base_attribute)+
     stat('Kostnad',skill.cost)+
     stat('BC',skill.bc)+
    '</div>'+
    '<section class="skill-codex-description" aria-label="Färdighetsbeskrivning"><h3>Beskrivning</h3><p>'+safe(description)+'</p></section>';
  root.classList.add('skill-codex-active');
  root.classList.remove('hidden');
  const token=generation;
  const iconPath=validArt(skill,'icon'),illustrationPath=validArt(skill,'illustration');
  if(iconPath)void loadArt(skill,'icon',iconPath,token);
  if(illustrationPath)void loadArt(skill,'illustration',illustrationPath,token);
 }
 const originalRule=window.showRuleSkillById;
 const originalInfo=window.showSkillInfo;
 const originalClose=window.closeSkillInfo;
 const originalWeapon=window.showWeaponInfo;
 if(typeof originalRule==='function'){
  window.showRuleSkillById=function(id,fallbackName){
   const result=originalRule.apply(this,arguments);
   const row=typeof ruleSkills!=='undefined'?ruleSkills.find(x=>String(x.id)===String(id)):null;
   render(row||{description:'Ingen regelbeskrivning kunde hämtas från färdighetsregistret.'},fallbackName);
   return result;
  };
 }
 if(typeof originalInfo==='function'){
  window.showSkillInfo=async function(index){
   const result=await originalInfo.apply(this,arguments);
   const skill=typeof current!=='undefined'?current?.skills?.[index]:null;
   const row=typeof findRuleSkill==='function'?findRuleSkill(skill):null;
   render(row||{name:skill?.name,description:'Färdigheten finns inte längre i det centrala regelregistret.'});
   return result;
  };
 }
 if(typeof originalClose==='function'){
  window.closeSkillInfo=function(){reset();return originalClose.apply(this,arguments)};
 }
 if(typeof originalWeapon==='function'){
  window.showWeaponInfo=function(){reset();return originalWeapon.apply(this,arguments)};
 }
 window.aleaSkillCodex={render,reset,validArt};
})();
