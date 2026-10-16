import {describe,it,expect} from 'vitest';
import {arcaneGalleryImageIds,arcaneGalleryChooseSelection} from '../features/material/arcane-gallery.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
describe('Arcane Gallery image history',()=>{
 it('handles no images',()=>{expect(arcaneGalleryImageIds([])).toEqual([]);});
 it('handles a single image',()=>{expect(arcaneGalleryImageIds([{material_id:id(1)}])).toEqual([id(1)]);});
 it('keeps five pictures in chronological presentation order',()=>{
  expect(arcaneGalleryImageIds([5,4,3,2,1].map(n=>({material_id:id(n)})))).toEqual([1,2,3,4,5].map(id));
 });
 it('supports more than five and deduplicates repeat presentations',()=>{
  expect(arcaneGalleryImageIds([8,3,7,6,5,4,3,2,1].map(n=>({material_id:id(n)})))).toEqual([1,2,4,5,6,7,3,8].map(id));
 });
 it('rejects invalid identifiers',()=>{
  expect(arcaneGalleryImageIds([{material_id:'../../other'},{material_id:id(2)},null])).toEqual([id(2)]);
 });
});

describe('Arcane Gallery navigation and selection',()=>{
 const rows=[1,2,3,4,5,6].map(n=>({id:id(n)}));
 it('follows a newly shared picture while respecting a manual choice on later refreshes',()=>{
  expect(arcaneGalleryChooseSelection(rows,id(2),id(6),id(5))).toBe(id(6));
  expect(arcaneGalleryChooseSelection(rows,id(2),id(6),id(6))).toBe(id(2));
 });
 it('selects latest accessible picture if the previous one is archived or revoked',()=>{
  expect(arcaneGalleryChooseSelection(rows,id(9),id(6),id(6))).toBe(id(6));
  expect(arcaneGalleryChooseSelection(rows,id(9),'','')).toBe(id(6));
  expect(arcaneGalleryChooseSelection([],id(1),'','')).toBe('');
 });
 it('works with just one picture or with no active live presentation',()=>{
  expect(arcaneGalleryChooseSelection([{id:id(3)}],'','','')).toBe(id(3));
  expect(arcaneGalleryChooseSelection(rows,id(3),'','')).toBe(id(3));
 });
});
