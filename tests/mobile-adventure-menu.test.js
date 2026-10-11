import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const css=read('features/home/topbar.css');
const script=read('features/home/topbar.js');

function makeElement(initial=[]){
  const classes=new Set(initial),listeners={};
  return {
    classes,
    attrs:{},
    listeners,
    classList:{
      add:(name)=>classes.add(name),
      remove:(name)=>classes.delete(name),
      contains:(name)=>classes.has(name),
      toggle:(name,on)=>on?classes.add(name):classes.delete(name)
    },
    addEventListener:(name,handler)=>{listeners[name]=handler},
    setAttribute(name,value){this.attrs[name]=value},
    focus(){this.focused=true},
    contains(target){return target===this},
    fire(name,event={}){listeners[name]?.(event)}
  };
}
function setup(){
  const header=makeElement(),hub=makeElement(),menu=makeElement(['hidden']),item=makeElement();
  const original=makeElement();let clicks=0;original.click=()=>{clicks++};
  item.dataset={mobileTarget:'shopNavBtn'};
  item.closest=selector=>selector==='button[data-mobile-target]'?item:null;
  menu.contains=target=>target===menu||target===item;
  menu.querySelector=selector=>selector==='button'?item:null;
  const docEvents={},winEvents={},media={matches:true};
  const doc={
    documentElement:{scrollTop:0},
    querySelector:selector=>selector==='.alea-app-header'?header:null,
    getElementById:id=>({mobileHubNavBtn:hub,mobileHubMenu:menu,shopNavBtn:original})[id]||null,
    addEventListener:(event,callback)=>{docEvents[event]=callback}
  };
  const win={
    matchMedia:()=>media,
    scrollY:0,
    addEventListener:(event,callback)=>{(winEvents[event]??=[]).push(callback)}
  };
  runInNewContext(script,{document:doc,window:win});
  return {hub,menu,item,original,media,docEvents,winEvents,get clicks(){return clicks}};
}

describe('Mobile adventure shortcut',()=>{
  it('keeps desktop tools intact, adds a compact mobile-only menu with all four destinations',()=>{
    const strip=html.split('<nav class="alea-toolstrip"')[1].split('</nav>')[0];
    expect(strip).toContain('id="mobileHubNavBtn"');
    expect(strip).toContain('id="mobileHubMenu"');
    expect(strip).toContain('aria-expanded="false"');
    for(const [id,label] of [
      ['shopNavBtn','Targans Gille'],
      ['alchemyNavBtn','Alkemi'],
      ['innNavBtn','Värdshus'],
      ['journalNavBtn','Krönika']
    ]){
      expect(strip).toContain('data-mobile-target="'+id+'"');
      expect(strip).toContain(label);
    }
    for(const id of ['shopNavBtn','alchemyNavBtn','innNavBtn']){
      expect(strip).toContain('id="'+id+'"');
    }
    expect(read('features/journal/journal.js')).toContain('id="journalNavBtn"');
    expect(css).toContain('.alea-app-header .alea-toolstrip>#mobileHubNavBtn');
    expect(css).toContain('.alea-app-header .alea-toolstrip>.mobile-hub-menu:not(.hidden)');
    for(const id of ['shopNavBtn','alchemyNavBtn','innNavBtn','journalNavBtn']){
      expect(css).toContain('#'+id);
    }
    expect(css).toContain('@media(max-width:700px)');
  });

  it('opens, routes to original destination and closes after selection',()=>{
    const ui=setup();
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    ui.hub.fire('click');
    expect(ui.menu.classList.contains('hidden')).toBe(false);
    expect(ui.hub.attrs['aria-expanded']).toBe('true');
    expect(ui.item.focused).toBe(true);
    ui.menu.fire('click',{target:ui.item});
    expect(ui.clicks).toBe(1);
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    expect(ui.hub.attrs['aria-expanded']).toBe('false');
  });

  it('supports toggle, outside dismissal, Escape, scrolling and leaving mobile layout',()=>{
    const ui=setup();
    ui.hub.fire('click');
    ui.hub.fire('click');
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    ui.hub.fire('click');
    ui.docEvents.pointerdown({target:{}});
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    ui.hub.fire('click');
    let prevented=false;
    ui.docEvents.keydown({key:'Escape',preventDefault(){prevented=true}});
    expect(prevented).toBe(true);
    expect(ui.hub.focused).toBe(true);
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    ui.hub.fire('click');
    for(const cb of ui.winEvents.scroll)cb();
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    ui.hub.fire('click');
    ui.media.matches=false;
    for(const cb of ui.winEvents.resize)cb();
    expect(ui.menu.classList.contains('hidden')).toBe(true);
    expect(ui.hub.attrs['aria-expanded']).toBe('false');
  });
});
