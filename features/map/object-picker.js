import {objectCategories,filterObjectLibrary} from './object-categories.js';

const pageSize=24;
const compact=()=>matchMedia('(max-width: 760px)').matches;
const option=(label,value)=>new Option(label,value);

export function createObjectPicker({map,opener,canEdit,loadCatalog,prepare,available,pick,edit,drag,endDrag,showMap}) {
  const dialog=document.createElement('dialog');
  dialog.className='living-picker living-objects';
  const titleId='object-picker-'+crypto.randomUUID();
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML='<header><h2>Objektbibliotek</h2><button type="button" class="btn" data-close aria-label="Stäng objektbiblioteket">Stäng</button></header>'+
    '<label>Sök objekt<input type="search" data-search placeholder="Namn eller kategori"></label>'+
    '<div class="living-library-filters"><label>Samling<select data-collection></select></label><label>Kategori<select data-category></select></label></div>'+
    '<div class="living-results" data-results></div><footer><button type="button" class="btn" data-prev>Föregående</button>'+
    '<span aria-live="polite" data-count></span><button type="button" class="btn" data-next>Nästa</button></footer>';
  const get=selector=>dialog.querySelector(selector);
  get('h2').id=titleId;
  const search=get('[data-search]'),scope=get('[data-collection]'),category=get('[data-category]'),results=get('[data-results]');
  scope.append(option('Alla tillgängliga','all'),option('Gemensamma objekt','shared'),option('Aktuell kampanj','campaign'));
  category.append(option('Alla kategorier',''),...objectCategories.map(c=>option(c,c)));
  let metadata=null,listing=null,page=0,version=0,disposed=false,dragging=false,armed=null,sectionItems=new Map();
  const storageKey='alea-object-recent:'+map.campaign_id+':'+(supabaseSession?.user?.id||'');
  let recent=[];
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(Array.isArray(saved))recent=saved.filter(id=>typeof id==='string').slice(0,6);}catch{}
  function remember(id){
    recent=[id,...recent.filter(x=>x!==id)].slice(0,6);
    try{localStorage.setItem(storageKey,JSON.stringify(recent));}catch{}
  }
  function hide(){
    version++;
    if(dialog.open)dialog.close();
    opener.setAttribute('aria-expanded','false');
  }
  function card(d){
    const wrapper=document.createElement('div');wrapper.className='living-card';
    const btn=document.createElement('button');btn.type='button';btn.dataset.definition=d.id;
    btn.disabled=true;btn.draggable=false;btn.setAttribute('aria-pressed',String(d.id===armed));
    const img=document.createElement('img');img.alt='';img.hidden=true;img.draggable=false;
    const label=document.createElement('span'),name=document.createElement('strong'),info=document.createElement('small');
    name.textContent=d.name;
    info.textContent=d.width_m&&d.depth_m&&d.height_m?[d.width_m,d.depth_m].map(n=>Number(n).toLocaleString('sv-SE')).join(' × ')+' m':'Mått saknas';
    label.append(name,info);btn.append(img,label);wrapper.append(btn);
    if(canEdit){
      const pen=document.createElement('button');pen.type='button';pen.dataset.template=d.id;pen.textContent='✎';
      pen.setAttribute('aria-label','Redigera mall '+d.name);wrapper.append(pen);
    }
    return wrapper;
  }
  function render(resetScroll=false){
    const revision=++version;
    if(!metadata||!dialog.open)return;
    const top=resetScroll?0:results.scrollTop;
    const matches=filterObjectLibrary(metadata,map.campaign_id,scope.value,category.value,search.value);
    const prioritized=!search.value.trim()&&!category.value?recent.map(id=>matches.find(d=>d.id===id)).filter(Boolean):[];
    const recentIds=new Set(prioritized.map(d=>d.id));
    const ordered=[...prioritized,...matches.filter(d=>!recentIds.has(d.id))];
    page=Math.min(page,Math.max(0,Math.ceil(ordered.length/pageSize)-1));
    const start=page*pageSize,items=ordered.slice(start,start+pageSize);
    results.replaceChildren();sectionItems=new Map(items.map(d=>[d.id,d]));
    const group=(title,items)=>{
      if(!items.length)return;
      if(title){const heading=document.createElement('h3');heading.textContent=title;results.append(heading);}
      const grid=document.createElement('div');grid.className='living-catalog';grid.append(...items.map(card));results.append(grid);
    };
    if(page===0)group('Senast använda',prioritized);
    group(page===0&&prioritized.length?'Fler objekt':'',items.filter(d=>!recentIds.has(d.id)));
    if(!items.length)results.textContent='Inga objekt matchar urvalet.';
    get('[data-count]').textContent=items.length?(start+1)+'–'+(start+items.length)+' av '+ordered.length:'0 objekt';
    get('[data-prev]').disabled=page===0;get('[data-next]').disabled=start+items.length>=ordered.length;
    results.scrollTop=top;
    void prepare(items,(d)=>{
      if(revision!==version||disposed)return;
      const btn=results.querySelector('[data-definition="'+CSS.escape(d.id)+'"]');
      if(!btn)return;
      const img=btn.querySelector('img');
      if(d.url){img.src=d.url;img.hidden=false;}
      sectionItems.set(d.id,d);btn.disabled=!available(d);btn.draggable=!btn.disabled;
      if(!d.url||!d.bounds)btn.querySelector('small').textContent='Bild saknas';
      else if(!btn.disabled)return;
      else if(d.width_m&&d.depth_m&&d.height_m)btn.querySelector('small').textContent='Kalibrera kartan';
    },()=>revision===version&&!disposed).catch(()=>{if(revision===version)get('[data-count]').textContent='Kunde inte läsa objektbilder.';});
  }
  async function open(){
    if(disposed)return;
    if(!dialog.isConnected)document.body.append(dialog);
    if(!dialog.open){
      if(compact())dialog.showModal();
      else{dialog.show();showMap();}
    }
    opener.setAttribute('aria-expanded','true');search.focus({preventScroll:true});
    if(metadata){render();return;}
    results.textContent='Hämtar objekt…';
    const current=listing??=loadCatalog();
    try{
      const rows=await current;
      if(listing!==current||disposed)return;
      metadata=rows;render();
    }catch{
      if(listing===current&&!disposed){results.textContent='Biblioteket kunde inte hämtas.';const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Försök igen';retry.onclick=open;results.append(retry);}
    }finally{if(listing===current)listing=null;}
  }
  function invalidate(){
    listing=null;metadata=null;version++;
    if(dialog.open)void open();
  }
  opener.onclick=open;opener.setAttribute('aria-haspopup','dialog');opener.setAttribute('aria-expanded','false');
  get('[data-close]').onclick=hide;
  dialog.addEventListener('close',()=>opener.setAttribute('aria-expanded','false'));
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();hide();opener.focus();}});
  function filter(){page=0;render(true);}
  search.oninput=filter;category.onchange=filter;scope.onchange=filter;
  get('[data-prev]').onclick=()=>{page--;render(true);};
  get('[data-next]').onclick=()=>{page++;render(true);};
  results.onclick=e=>{
    const btn=e.target.closest('button');if(!btn||btn.disabled)return;
    if(btn.dataset.template){hide();edit(sectionItems.get(btn.dataset.template));return;}
    if(btn.dataset.definition){if(compact())hide();pick(btn.dataset.definition);}
  };
  results.ondragstart=e=>{
    const btn=e.target.closest('[data-definition]');
    if(!btn||btn.disabled||!e.dataTransfer){e.preventDefault();return;}
    dragging=true;drag(btn.dataset.definition,e.dataTransfer);
  };
  results.ondragend=()=>{if(dragging){dragging=false;endDrag();}};
  return {open,hide,invalidate,remember,
    setArmed(id){
      if(id===armed)return;
      armed=id;
      for(const button of results.querySelectorAll('[data-definition]'))button.setAttribute('aria-pressed',String(button.dataset.definition===id));
    },
    update(){if(dialog.open&&!dragging)render();},
    chooseCampaign(){scope.value='campaign';category.value='';search.value='';page=0;},
    destroy(){disposed=true;version++;hide();dialog.remove();opener.onclick=null;}
  };
}
