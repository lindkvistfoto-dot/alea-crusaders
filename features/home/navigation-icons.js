/* v0.35.116: activate 512px bronze artwork according to the displayed page.
 * The browser renders images directly from HTML; JS changes state only.
 * No low-resolution background sprites, no pixel-position assumptions. */
(function(){
  'use strict';
  const nav=document.querySelector('.alea-app-header .alea-toolstrip');
  if(!nav)return;
  const visible=id=>{
    const element=document.getElementById(id);
    return !!element&&!element.classList.contains('hidden');
  };
  const alchemyOpen=()=>{
    const shop=document.getElementById('shopPage');
    return !!shop&&!shop.classList.contains('hidden')&&shop.classList.contains('shop-alchemy');
  };
  const current={
    shopNavBtn:()=>visible('shopPage')&&!alchemyOpen(),
    alchemyNavBtn:()=>alchemyOpen(),
    innNavBtn:()=>visible('innPage'),
    academyNavBtn:()=>visible('academyPage'),
    materialNavBtn:()=>visible('legolasPanel')||visible('legolasViewer'),
    landingCharactersNavBtn:()=>visible('home')||visible('view'),
    combatNavBtn:()=>visible('combatPage')
  };

  function refresh(){
    for(const [id,test] of Object.entries(current)){
      const button=document.getElementById(id);
      if(!button)continue;
      const state=test()?'page':'false';
      if(button.getAttribute('aria-current')!==state)button.setAttribute('aria-current',state);
    }
    const hub=document.getElementById('mobileHubMenu');
    if(hub){
      for(const id of ['shopNavBtn','alchemyNavBtn','innNavBtn','academyNavBtn']){
        const button=hub.querySelector('button[data-mobile-target="'+id+'"]');
        if(button)button.dataset.navActive=String(current[id]());
      }
    }
  }
  const watched=new Map();
  const observer=new MutationObserver(()=>{
    observeNewPages();
    refresh();
  });
  function observeNewPages(){
    for(const id of ['shopPage','innPage','academyPage','legolasPanel','legolasViewer','home','view','combatPage']){
      const el=document.getElementById(id);
      if(!el||watched.get(id)===el)continue;
      watched.set(id,el);
      observer.observe(el,{attributes:true,attributeFilter:['class']});
    }
  }
  // Material is mounted asynchronously. Watching direct children only keeps
  // the observer light and reacts to its late-mounted button/panel.
  observer.observe(nav,{childList:true});
  observer.observe(document.body,{childList:true});
  observeNewPages();
  refresh();
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('.alea-toolstrip,.landing-route-nav'))return;
    queueMicrotask(refresh);
    requestAnimationFrame(refresh);
  },true);
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
