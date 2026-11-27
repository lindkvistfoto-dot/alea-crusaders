import {RealtimeClient} from '@supabase/realtime-js';

// One private channel per campaign member. The topic binds updates to its owner.
export function connectPartyPresence(campaign, self, ids, changed) {
  const socket = new RealtimeClient(SUPABASE_URL.replace(/^https:/,'wss:')+'/realtime/v1', {
    params:{apikey:SUPABASE_KEY}, accessToken:async()=>supabaseSession?.access_token || null
  });
  const pages = new Map();
  let active = true;
  let ownChannel;
  let page = '';
  function track() {
    if (ownChannel && page) void ownChannel.track({page});
  }
  for (const id of ids) {
    const channel = socket.channel('party:'+campaign+':'+id, {config:{private:true}});
    channel.on('presence', {event:'sync'}, () => {
      if (!active) return;
      pages.set(id,Object.values(channel.presenceState()).flat().map(entry=>entry.page));
      changed();
    }).subscribe(status=>{
      if (!active) return;
      if (status==='SUBSCRIBED') {
        if (id===self) { ownChannel=channel; track(); }
      } else {
        if (id===self) ownChannel=null;
        pages.delete(id);
        changed();
      }
    });
  }
  return {
    pages,
    move(next) { if (next && page!==next) { page=next; track(); } },
    refreshToken() { void socket.setAuth().catch(()=>{}); },
    close() {
      active=false;
      void socket.removeAllChannels().finally(()=>socket.disconnect());
    }
  };
}
