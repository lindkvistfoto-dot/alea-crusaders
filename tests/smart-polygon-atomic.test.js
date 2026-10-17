import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261017130000_smart_polygon_atomic_shapes.sql',import.meta.url),'utf8');
describe('atomic shared-vertex persistence',()=>{
 it('saves all affected polygons through one RPC instead of sequential PATCH calls',()=>{
  const fragment=app.slice(app.indexOf('async function mapAreaNodeEnd()'),app.indexOf('async function showMapAreaHoles()'));
  expect(fragment).toContain("rpc/update_map_polygon_shapes_atomic");
  expect(fragment).not.toContain("for(let m of modified)await dbJson('campaign_map_areas");
 });
 it('checks optimistic before-shapes and RLS before any UPDATE',()=>{
  expect(sql).toContain('security invoker');
  expect(sql).toContain('private.is_campaign_gm(v_map.campaign_id)');
  expect(sql).toContain('a.shape_data=v_expected');
  expect(sql.indexOf('a.shape_data=v_expected')).toBeLessThan(sql.indexOf("set shape_type='polygon'"));
 });
 it('RPC is callable only by authenticated role',()=>{
  expect(sql).toContain('revoke all on function public.update_map_polygon_shapes_atomic(uuid,jsonb) from public, anon');
  expect(sql).toContain('grant execute on function public.update_map_polygon_shapes_atomic(uuid,jsonb) to authenticated');
 });
});
