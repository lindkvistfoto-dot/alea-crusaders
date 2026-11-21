import {describe,it,expect} from 'vitest';
import {chamber} from '../features/art-first/chamber.js';
import {followPath} from '../features/art-first/motion.js';
import {createWorld,applyCommand,projectWorld} from '../features/crypt/world.js';
import {contains} from '../features/map/kartakademin-geometry.js';
import {geometry,hexCenter,route,perception} from '../features/crypt/scene.js';
const gm={role:'gm',die:()=>6}, member={role:'player',actorId:'lyra',die:()=>6};
function act(s,input,who=gm){return applyCommand(s,{...input,id:crypto.randomUUID(),expectedRevision:who.role==='gm'?s.revision:s.publicRevision},who);}
function room(){const [x,y]=hexCenter(chamber,[376,748]);return createWorld({map:chamber,guardPosition:{x,y}});}
describe('Art First chamber on the crypt encounter',()=>{
  it('light follows the diagonal chest, barrels and north-east wall on both sides of the old sample boundary',()=>{
    const s=room(), g=geometry(chamber), gmView=projectWorld(s,'gm'), player=projectWorld(s,member);
    for(const [x0,y0,w,h] of [[540,420,90,96],[565,270,70,110],[510,190,95,96]]){
      let recovered=0, clipped=0;
      for(let y=y0+.271;y<y0+h;y+=2)for(let x=x0+.413;x<x0+w;x+=2){
        const tile=gmView.floor.find(t=>x>=t.x && x<t.x+t.width && y>=t.y && y<t.y+t.height);
        const drawn=!!tile && (!tile.parts || tile.parts.some(flat=>{
          const vertices=[];
          for(let i=0;i<flat.length;i+=2)vertices.push([flat[i],flat[i+1]]);
          return contains(vertices,[x,y]);
        }));
        expect(drawn).toBe(g.onFloor([x,y]));
        const old=g.onFloor([Math.floor(x/10)*10+5,Math.floor(y/10)*10+5]);
        if(drawn && !old)recovered++;
        if(!drawn && old)clipped++;
      }
      expect(recovered).toBeGreaterThan(0);expect(clipped).toBeGreaterThan(0);
    }
    for(const t of player.floor.filter(t=>t.parts)){
      expect(gmView.floor.find(g=>g.x===t.x && g.y===t.y)?.parts).toEqual(t.parts);
      expect(t.visibility).toBe('visible');
    }
    expect(gmView.floor.some(t=>t.parts && t.visibility==='hidden' &&
      !player.floor.some(p=>p.x===t.x && p.y===t.y))).toBe(true);
  });
  it('snaps every foot, emits a traversable path and retains positions and wounds across modes',()=>{
    let s=room();
    for(const a of s.actors)expect([a.x,a.y]).toEqual(hexCenter(chamber,[a.x,a.y]));
    const a=s.actors.find(a=>a.id==='evalin');
    const prev=[a.x,a.y];s=act(s,{type:'move',actorId:'evalin',x:a.x-55,y:a.y+2});
    const path=s.steps.evalin.path;
    expect(path[0]).toEqual(prev);expect(followPath(path,160,54).x).toBeCloseTo(prev[0]-27);
    expect(route(s,s.actors[1],[360,248])).toBeNull();
    s=act(s,{type:'startCombat'});const before=structuredClone(s.actors);
    s=act(s,{type:'endCombat'});expect(s.actors).toEqual(before);
  });
  it('keeps hidden sentry moves private and rechecks a requested crossing',()=>{
    let s=room();const prior=projectWorld(s,member);
    expect(prior.actors.some(a=>a.id==='guard')).toBe(false);
    s=act(s,{type:'guard',x:351,y:702});expect(projectWorld(s,member)).toEqual(prior);
    s=act(s,{type:'door',open:true});const p=projectWorld(s,member);
    expect(p.actors.find(a=>a.id==='guard').seenBy).toContain('lyra');
    expect(p.actors.find(a=>a.id==='guard').seenBy).not.toContain('evalin');
    s=act(s,{type:'move',actorId:'lyra',x:378,y:748},member);
    expect(s.pending).toHaveLength(1);s=act(s,{type:'approve',requestId:s.pending[0].id});
    expect(s.actors.find(a=>a.id==='lyra').y).toBeGreaterThan(chamber.door.y);
    s=act(s,{type:'search',actorId:'lyra'},member);expect(s.journal.at(-1).roll).toBe(6);
  });
  it('changes actual perception with fixed lights and keeps remembered floor',()=>{
    let s=room();s=act(s,{type:'torch',on:false});const before=perception(s).current.size;
    s=act(s,{type:'lamps',lamp:'all',on:false});expect(perception(s).current.size).toBeLessThan(before);
    expect(projectWorld(s,member).floor.some(t=>t.visibility==='memory')).toBe(true);
    expect(()=>act(s,{type:'lamps',lamp:2,on:true},member)).toThrow();
    s=act(s,{type:'lamps',lamp:2,on:true});expect(s.lamps.filter(Boolean)).toHaveLength(1);
  });
});
