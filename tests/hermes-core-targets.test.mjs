import {describe,it,expect} from 'vitest';
import {resolveTrophyImageTarget} from '../features/hermes-core/targets.js';
describe('Troferummet image targets',()=>{
 it.each(['award','badge','medal'])('%s resolves to definition',category=>{
  expect(resolveTrophyImageTarget({category,id:'honor-id'}).kind).toBe('definition');
 });
 it('relief variants use relief target',()=>{
  expect(resolveTrophyImageTarget({category:'relief',id:'variant-id'}).kind).toBe('relief');
 });
 it.each(['badge_frame','background','system_image'])('%s resolves to system',category=>{
  expect(resolveTrophyImageTarget({category,id:'arcane-lion-badge-gold'}).kind).toBe('system');
 });
 it('rejects arbitrary categories',()=>{
  expect(()=>resolveTrophyImageTarget({category:'sql_table',id:'x'})).toThrow('Unknown');
 });
});
