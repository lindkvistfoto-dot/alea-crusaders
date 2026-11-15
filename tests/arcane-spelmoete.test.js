import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../supabase/migrations/20261112222237_arcane_spelmoete_day_time.sql');
const panel=read('../features/chronicle/sessions.js');
const app=read('../legacy/app.js');

describe('ARCANE Spelmöte',()=>{
 it('persists sessions and participants with campaign authorization and one active session',()=>{
  expect(migration).toContain('create table if not exists public.game_sessions');
  expect(migration).toContain('create table if not exists public.game_session_participants');
  expect(migration).toContain('where status in (\'active\',\'paused\')');
  expect(migration).toContain('enable row level security');
  expect(migration).toContain('private.is_campaign_gm(campaign_id)');
  expect(panel).toContain("dbJson('game_sessions?");
  expect(panel).toContain("dbJson('game_session_participants?");
 });
 it('keeps the five independent phases in the existing campaign state',()=>{
  for(const label of ['Soluppgång','Förmiddag','Eftermiddag','Skymning','Natt'])expect(panel).toContain(label);
  expect(migration).toContain("array['dawn','morning','afternoon','evening','night']");
  expect(migration).toContain("where time_of_day='midday'");
  expect(panel).toContain('setCampaignTimeOfDay(');
  expect(panel).toContain('Dygnsfasen är ett fristående tillstånd');
 });
 it('provides separate day and rest actions with the existing rest thresholds',()=>{
  expect(panel).toContain("rpc/set_campaign_day_number");
  expect(panel).toContain("rpc/apply_campaign_rest");
  expect(migration).toContain("rr.category='Älvfolk'");
  expect(migration).toContain("v_threshold:=case");
  expect(migration).toContain("'PSY',least(v_psy_max,v_psy+v_full_hours)");
  expect(migration).not.toMatch(/apply_campaign_rest[\s\S]{0,900}?set\s+day_number\s*=/i);
 });
 it('shows the shared panel from the header and persists a real start and end time',()=>{
  expect(panel).toContain("window.openCampaignDay=openPanel");
  expect(panel).toContain("window.openGameSessionPanel=openGameSessionPanel");
  expect(panel).toContain('started_at:start.toISOString()');
  expect(panel).toContain("status:'closed',ended_at:new Date().toISOString()");
  expect(panel).toContain('summary:$id(\'gameSessionSummary\')?.value.trim()||null');
  expect(panel).toContain('Tidigare spelmöten');
 });
});
