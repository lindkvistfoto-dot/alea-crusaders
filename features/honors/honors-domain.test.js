import { describe, expect, it } from 'vitest';
import { validateHonorDefinition, publicHonorProjection, grantHonor, revokeHonor, activeGrant, honorCategory } from './honors-domain.js';
const medal = { id:'m1', name:'Spindelkonungens pyramid', type:'adventure', adventure_id:'a1', visibility:'public', grant_mode:'manual', status:'active' };
describe('Arcane Honors domain', () => {
  it('validates medal definitions and supports quick draft registration', () => {
    expect(validateHonorDefinition(medal)).toEqual([]);
    expect(validateHonorDefinition({ ...medal, adventure_id:'' })).toContain('adventure_id required');
    const draft={name:'Nytt hedersmärke',type:'honor',category:'badge',status:'draft',grant_mode:'manual',visibility:'public'};
    expect(validateHonorDefinition(draft)).toEqual([]);
    expect(honorCategory({type:'adventure'})).toBe('medal');
  });
  it('requires drafts to stay manual and not player visible', () => {
    expect(validateHonorDefinition({name:'Draft',type:'honor',category:'award',status:'draft',grant_mode:'automatic',visibility:'public'})).toContain('drafts must be manual');
    expect(publicHonorProjection({ ...medal, status:'draft' })).toBeNull();
  });
  it('does not reveal secret awards', () => {
    expect(publicHonorProjection({ ...medal, visibility:'secret' })).toBeNull();
    expect(publicHonorProjection({ ...medal, visibility:'secret' }, {hasGrant:true}).name).toBe(medal.name);
  });
  it('does not leak silhouette details', () => {
    expect(publicHonorProjection({ ...medal, visibility:'silhouette' })).toEqual({id:'m1',visibility:'silhouette',earned:false});
  });
  it('grants once and tracks revocation', () => {
    const input={honorId:'m1',characterId:'astrid',grantedBy:'gm',id:'g1',eventId:'e1'};
    const first=grantHonor([],input);
    expect(first.created).toBe(true);
    expect(grantHonor(first.grants,{...input,id:'g2'}).created).toBe(false);
    const revoked=revokeHonor(first.grants,'g1',{revokedBy:'gm',reason:'mistake'});
    expect(activeGrant(revoked,'m1','astrid')).toBeNull();
    expect(grantHonor(revoked,{...input,id:'g3'}).created).toBe(false);
  });
});
