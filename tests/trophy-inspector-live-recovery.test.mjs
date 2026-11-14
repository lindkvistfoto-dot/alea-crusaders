import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('LIVE Trophy Inspector recovery',()=>{
  const room=read('features/trophy-room/room.js');
  const css=read('features/trophy-room/room.css');

  it('adds a separate award/badge dialog with keyboard, backdrop and focus restoration',()=>{
    expect(room).toContain("d.id='arcaneHonorInspector'");
    expect(room).toContain("if(e.target===d)d.close()");
    expect(room).toContain('honorFocus?.focus?.()');
    expect(room).toContain("d.addEventListener('cancel'");
    expect(room).toContain("e.key==='Enter'||e.key===' '");
    expect(room).toContain("kind==='award'?'Utmärkelse':'Badge'");
  });

  it('loads the shared Trophy Room scene after authenticated startup',()=>{
    expect(room).toContain('async function loadTrophyRoomImage()');
    expect(room).toContain("!root.activeUser?.()")
    expect(room).toContain('void loadTrophyRoomImage()');
  });

  it('uses actual persisted badge progress and clamps it to zero through three',()=>{
    expect(room).toContain('earned_gold_stars');
    expect(room).toContain('earnedGoldStars(grantByHonor.get(String(d.id))?.earned_gold_stars)');
    expect(room).not.toContain('tier_criteria?.gold_stars');
    const helper=room.match(/const earnedGoldStars=value=>\{([^}]*)\}/);
    expect(helper).not.toBeNull();
    const normalize=new Function('value','clamp',helper[1]);
    for(const [input,expected] of [[0,0],[1,1],[2,2],[3,3],[-1,0],[4,3],['nope',0]]){
      expect(normalize(input,(n,min,max)=>Math.max(min,Math.min(max,n)))).toBe(expected);
    }
  });

  it('reads only safe public projections and never uses preview badge variants',()=>{
    expect(room).toContain('arcane_trophy_public_grants');
    expect(room).toContain('arcane_trophy_public_definitions');
    expect(room).toContain('arcane_trophy_public_variants');
    expect(room).toContain('const selected=d.published_variant_id');
    expect(room).not.toContain('preview_variant_id||');
  });

  it('offers the granting SL an explicit achieved level and positions the award and badge presentations',()=>{
    const admin=read('features/honors/honors-admin.js');
    const entry=read('features/honors/honors-entry.js');
    expect(admin).toContain('Uppnådda guldstjärnor');
    expect(admin).toContain('<option value="0">0 stjärnor</option>');
    expect(admin).toContain('<option value="3">3 stjärnor</option>');
    expect(entry).toContain('earned_gold_stars:stars');
    expect(room).toContain("kind==='award'?'green':'blue'");
    expect(css).toContain('translateY(8%)');
    expect(css).toContain('arcane-honor-inspector-stars');
  });
});
