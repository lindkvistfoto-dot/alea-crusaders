import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const component=read('features/character/arcane-profile-component.js');
const styles=read('features/character/arcane-profile-component.css');
const legacy=read('legacy/app.js');
const FIELDS=['name','ras','yrke','kon','alder','langd','vikt','combat','stand'];

function testHarness(){
  class E{
    constructor(tag='div'){this.tagName=tag;this.className='';this.children=[];this.dataset={};this.attrs={};this.handler=()=>42;}
    get classList(){const el=this;return {
      contains:k=>el.className.split(/\s+/).includes(k),
      add:k=>{if(!el.className.split(/\s+/).includes(k))el.className+=' '+k;},
      [Symbol.iterator]:function*(){yield* el.className.split(/\s+/);}
    }}
    setAttribute(k,v){this.attrs[k]=v}
    appendChild(x){this.children.push(x);return x}
    append(...xs){this.children.push(...xs)}
    replaceChildren(...xs){this.children=xs}
    querySelector(s){return s===':scope > .arcane-profile-structure'
      ?this.children.find(x=>x.classList.contains('arcane-profile-structure'))||null:null;}
  }
  const host=new E();
  const makeFields=()=>FIELDS.map(k=>{const e=new E();e.className='field arcane-field-'+k+(k==='name'?' name':'');return e;});
  const before=makeFields();
  host.replaceChildren(...before);
  let observer=null;
  class Observer{constructor(fn){this.callback=fn;observer=this}observe(){}}
  const document={readyState:'complete',getElementById:id=>id==='identity'?host:null,createElement:tag=>new E(tag)};
  const window={};
  runInNewContext(component,{document,window,MutationObserver:Observer});
  return {host,before,observer,window,makeFields};
}

describe('ARCANE character profile v8 — structural component',()=>{
  it('links exactly one profile component CSS and runs the JS after legacy render',()=>{
    expect(html).toContain('features/character/arcane-profile-component.css?v=20261019-8');
    expect(html).toContain('features/character/arcane-profile-component.js?v=20261019-8');
    expect(html.indexOf('arcane-profile-component.css')).toBeGreaterThan(html.indexOf('arcane-system.css'));
    expect(html.indexOf('arcane-profile-component.js')).toBeGreaterThan(html.indexOf('legacy/app.js'));
    expect(html).not.toMatch(/href="[^"]*arcane-layout-v[567]\.css/);
  });
  it('has one consistent two-column layout with a single declared frame height',()=>{
    expect(styles).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(styles).toContain('grid-template-rows:auto repeat(4,var(--ac-card-height))');
    expect(styles).toContain('--ac-panel-gap:clamp(');
    expect(styles).toContain('--ac-icon-width:clamp(');
    expect(styles).toContain('.arcane-profile-field-divider');
    expect(styles).not.toContain('nth-child(');
    expect(styles).not.toMatch(/\.svg['")]/);
  });
  it('moves live field nodes — without cloning inputs or changing callbacks',()=>{
    const {host,before,window}=testHarness();
    expect(window.aleaArcaneProfile.isMounted()).toBe(true);
    expect(host.children.length).toBe(1);
    const container=host.children[0];
    expect(container.children.length).toBe(9);
    expect(container.children[0].children[0]).toBe(before[0]);
    const rawOrder=['ras','yrke','kon','alder','langd','vikt','combat','stand'];
    rawOrder.forEach((key,i)=>{
      const card=container.children[i+1];
      expect(card.dataset.field).toBe(key);
      const moved=card.children[2].children[0];
      expect(moved).toBe(before[FIELDS.indexOf(key)]);
      expect(moved.handler()).toBe(42);
      expect(card.children[0].children[0].src).toMatch(/^\.\/assets\/arcane\/system\/v1\/icon-.*\.avif$/);
    });
  });
  it('is idempotent and safely handles later legacy re-renders',()=>{
    const {host,before,observer,window,makeFields}=testHarness();
    const stable=host.children[0];
    observer.callback();
    expect(host.children[0]).toBe(stable);
    const second=makeFields();
    host.replaceChildren(...second);
    observer.callback();
    expect(window.aleaArcaneProfile.isMounted()).toBe(true);
    expect(host.children[0]).not.toBe(stable);
    expect(host.children[0].children[1].children[2].children[0]).toBe(second[1]);
    expect(host.children[0].children.length).toBe(9);
  });
  it('preserves the original authenticated form logic and portrait default',()=>{
    expect(legacy).toContain('setIdentity(');
    expect(legacy).toContain('characterCombatIconFieldHtml(current)');
    expect(legacy).toContain('getPortraitSrc(c)');
    expect(component).toContain('content.appendChild(byName.get(key))');
    expect(component).not.toContain('cloneNode(');
  });
});
