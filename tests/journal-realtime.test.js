import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {journalSignalConfig,createJournalRealtime} from '../features/journal/realtime.js';

const CAMPAIGN='4aac1669-87f0-4d09-a06f-d9bf809e647e';
const OTHER='4aac1669-87f0-4d09-a06f-d9bf809e647f';

describe('campaign journal realtime',()=>{
 it('subscribes only to INSERT events in the active campaign',()=>{
  expect(journalSignalConfig(CAMPAIGN)).toEqual({
   event:'INSERT',schema:'public',table:'campaign_journal_entries',filter:'campaign_id=eq.'+CAMPAIGN
  });
  expect(()=>journalSignalConfig('other')).toThrow();
 });
 it('refreshes only for authorized campaign events with an id',()=>{
  let user=true,token='jwt',id=CAMPAIGN,refreshes=0;
  const client=createJournalRealtime({
   getCampaign:()=>id,getToken:()=>token,isAuthenticated:()=>user,
   supabaseUrl:'https://example.supabase.co',publishableKey:'publishable',
   onRefresh:()=>{refreshes++}
  });
  client.state.scope=CAMPAIGN;
  client.state.connected=true;
  expect(client.applySignal({campaign_id:OTHER,id:'abc'})).toBe(false);
  expect(client.applySignal({campaign_id:CAMPAIGN})).toBe(false);
  expect(client.applySignal({campaign_id:CAMPAIGN,id:'abc'})).toBe(true);
  expect(refreshes).toBe(1);
  user=false;
  expect(client.applySignal({campaign_id:CAMPAIGN,id:'def'})).toBe(false);
  user=true;token='';
  expect(client.applySignal({campaign_id:CAMPAIGN,id:'def'})).toBe(false);
 });
});

describe('compact clickable journal entries',()=>{
 const source=readFileSync(new URL('../features/journal/journal.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../features/journal/journal.css',import.meta.url),'utf8');
 const start=source.indexOf('function jRow('),end=source.indexOf('\nlet journalSync;',start);
 const render=new Function('jKind','jOutcome','jEsc','jTime','jState',
  source.slice(start,end)+'; return jRow;')(
  {combat:['⚔','Strid'],note:['📜','Journal']},
  {success:'Lyckat'},
  value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  value=>String(value),{openRowId:''}
 );
 const entry={id:'row-abc',event_type:'combat',title:'Attack mot skelett',
  message:'Resultat: träff. 12 KP skada.',outcome:'success',actor_name:'Astrid',
  player_visible:true,created_at:'2026-10-09T21:00:00Z'};
 it('renders a compact feed button that opens the right journal entry',()=>{
  const row=render(entry,true);
  expect(row).toContain('data-journal-open="row-abc"');
  expect(row).not.toContain('Resultat: träff');
  expect(row).toContain('Attack mot skelett');
  expect(row).toContain('Lyckat');
  expect(row).toContain('aria-label="Öppna i journalen');
  expect(source).toContain("jGet('journalLatest').addEventListener('click'");
 });
 it('keeps full text hidden until the entry is expanded',()=>{
  const row=render(entry);
  expect(row).toContain('data-journal-toggle="row-abc"');
  expect(row).toContain('aria-expanded="false"');
  expect(row).toContain('id="journal-detail-row-abc" class="journal-row-details" hidden');
  expect(row).toContain('Resultat: träff. 12 KP skada.');
  const open=new Function('jKind','jOutcome','jEsc','jTime','jState',
    source.slice(start,end)+';return jRow;')(
    {combat:['⚔','Strid']},{success:'Lyckat'},x=>String(x??''),x=>String(x),{openRowId:'row-abc'});
  const expanded=open(entry);
  expect(expanded).toContain('aria-expanded="true"');
  expect(expanded).not.toContain('class="journal-row-details" hidden');
  expect(expanded).toContain('Resultat: träff. 12 KP skada.');
 });
 it('escapes event content and preserves campaign/realtime refresh',()=>{
  expect(render({...entry,title:'<img src=x onerror=alert(1)>',message:'<script>bad</script>'}))
   .not.toContain('<script>');
  expect(source).toContain("jState.openRowId='';jRender()");
  expect(source).toContain("jGet('journalAll').addEventListener('click'");
  expect(source).toContain('filtered.map(r=>jRow(r,false))');
  expect(source).toContain("jState.openRowId=jState.openRowId===id?'':id");
  expect(source).toContain("onRefresh:jRefresh");
  expect(css).toContain('.journal-row-trigger{');
  expect(css).toContain('.journal-row-details[hidden]{display:none}');
 });
});
