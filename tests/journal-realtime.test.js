import {describe,it,expect} from 'vitest';
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
