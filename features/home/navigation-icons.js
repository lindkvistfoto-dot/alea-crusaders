/* v0.35.118: activate 512px bronze artwork according to the displayed page.
 * The browser renders images directly from HTML; JS changes state only.
 * No low-resolution background sprites, no pixel-position assumptions. */
(function(){
  'use strict';
  const header=document.querySelector('.alea-app-header');
  const nav=document.querySelector('.alea-app-header .alea-toolstrip');
  const main=document.querySelector('main');
  if(!header||!nav||!main)return;
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
    combatNavBtn:()=>visible('combatPage'),
    mapNavBtn:()=>visible('mapPage'),
    diceNavBtn:()=>visible('dicePage'),
    journalNavBtn:()=>visible('journalPage'),
    adminNavBtn:()=>visible('admin'),
    landingHomeNavBtn:()=>visible('landing')
  };
  // Every icon routes to exactly one page; Guild and Alchemy share a view.
  const routes={
    aleaBannerHomeLink:'landing',landingHomeNavBtn:'landing',
    landingCharactersNavBtn:'home',materialNavBtn:'legolasPanel',
    combatNavBtn:'combatPage',mapNavBtn:'mapPage',diceNavBtn:'dicePage',
    shopNavBtn:'shopPage',alchemyNavBtn:'shopPage',innNavBtn:'innPage',
    academyNavBtn:'academyPage',journalNavBtn:'journalPage',adminNavBtn:'admin'
  };
  let lastNavigation='';
  function selectedRoute(){
    if(current.materialNavBtn())return 'materialNavBtn';
    if(lastNavigation&&current[lastNavigation]?.())return lastNavigation;
    return ['journalNavBtn','adminNavBtn','academyNavBtn','innNavBtn',
      'alchemyNavBtn','shopNavBtn','combatNavBtn','mapNavBtn','diceNavBtn',
      'landingCharactersNavBtn','landingHomeNavBtn'].find(id=>current[id]())||'';
  }

  function refresh(){
    const active=selectedRoute();
    for(const [id,test] of Object.entries(current)){
      const button=document.getElementById(id);
      if(!button)continue;
      const state=id===active?'page':'false';
      if(button.getAttribute('aria-current')!==state)button.setAttribute('aria-current',state);
    }
    const banner=document.getElementById('aleaBannerHomeLink');
    if(banner)banner.setAttribute('aria-current',active==='landingHomeNavBtn'?'page':'false');
    const hub=document.getElementById('mobileHubMenu');
    if(hub){
      for(const id of ['shopNavBtn','alchemyNavBtn','innNavBtn','academyNavBtn','journalNavBtn']){
        const button=hub.querySelector('button[data-mobile-target="'+id+'"]');
        if(button)button.dataset.navActive=String(id===active);
      }
    }
  }
  const watched=new Map();
  const observer=new MutationObserver(()=>{
    observeNewPages();
    refresh();
  });
  function observeNewPages(){
    for(const id of ['shopPage','innPage','academyPage','legolasPanel','legolasViewer','home','view','combatPage','mapPage','dicePage','journalPage','admin','landing']){
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
  observer.observe(main,{childList:true});
  observeNewPages();
  refresh();
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('.alea-toolstrip,.landing-route-nav'))return;
    queueMicrotask(refresh);
    requestAnimationFrame(refresh);
  },true);
  // Preserve native onclick handlers: normalize only after the destination opens.
  // This also closes stale journal and shop sections left by older page callbacks.
  function isolatePage(buttonId){
    const pageId=routes[buttonId];
    if(!pageId||buttonId==='materialNavBtn'||!visible(pageId)){refresh();return}
    if(buttonId!=='journalNavBtn')window.aleaJournalClose?.(false);
    for(const section of main.querySelectorAll(':scope > section[id]')){
      if(section.id!==pageId)section.classList.add('hidden');
    }
    document.body.classList.toggle('shop-open',pageId==='shopPage');
    document.body.classList.toggle('inn-open',pageId==='innPage');
    document.body.classList.toggle('academy-open',pageId==='academyPage');
    refresh();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button,a');
    if(!button||!header.contains(button)||!Object.hasOwn(routes,button.id))return;
    if(button.id!=='materialNavBtn')window.legolasClosePanel?.();
    lastNavigation=button.id==='aleaBannerHomeLink'?'landingHomeNavBtn':button.id;
    queueMicrotask(()=>isolatePage(button.id));
    requestAnimationFrame(()=>isolatePage(button.id));
  });
  // The shared header never moves into a page. Size Material's overlay below
  // its actual responsive bottom edge, including the mobile collapsed state.
  function syncHeaderEdge(){
    const bottom=header.classList.contains('hidden')?0:header.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--alea-header-bottom',Math.max(0,Math.ceil(bottom))+'px');
  }
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncHeaderEdge).observe(header);
  window.addEventListener('resize',syncHeaderEdge);
  window.addEventListener('scroll',syncHeaderEdge,{passive:true});
  syncHeaderEdge();
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
