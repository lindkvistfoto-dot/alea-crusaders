// The DEV broadcast relay requires no tables. It carries the same sealed packet as the local channel.
import {galadrielSocketUrl} from '../material/realtime.js';

export function openCryptWire(topics, receive, onNetwork, {
  config = globalThis.ALEA_SUPABASE_CONFIG,
  makeSocket = url => new WebSocket(url),
  makeChannel = name => typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null,
} = {}) {
  const local = new Map();
  const joined = new Set();
  const joins = new Map();
  let socket, retry, heartbeat, joinTimeout, closed = false, ref = 0, delay = 1000;
  for (const topic of topics) {
    const channel = makeChannel(topic);
    if (channel) {
      channel.onmessage = event => receive(topic, event.data);
      local.set(topic, channel);
    }
  }

  function frame(topic, event, payload) {
    const id = String(++ref);
    socket.send(JSON.stringify({topic, event, payload, ref:id, join_ref:event === 'phx_join' ? id : joins.get(topic) ?? null}));
    return id;
  }
  function offline() {
    clearTimeout(joinTimeout);
    clearInterval(heartbeat);
    const old = socket;
    socket = null;
    if (old) {
      old.onopen = old.onclose = old.onmessage = old.onerror = null;
      try { old.close(); } catch { /* A handshake may already have failed. */ }
    }
    joins.clear();
    joined.clear();
    if (closed) return;
    onNetwork(false);
    clearTimeout(retry);
    retry = setTimeout(connect, delay);
    delay = Math.min(30_000, delay * 2);
  }
  function connect() {
    if (closed || config?.name !== 'development' || !config.url || !config.key) return;
    try { socket = makeSocket(galadrielSocketUrl(config.url, config.key)); }
    catch { offline(); return; }
    joinTimeout = setTimeout(offline, 12_000);
    socket.onopen = () => {
      for (const topic of topics) {
        const name = 'realtime:' + topic;
        const id = frame(name, 'phx_join', {config:{broadcast:{ack:true,self:false},presence:{enabled:false},postgres_changes:[],private:false}});
        joins.set(name, id);
      }
      heartbeat = setInterval(() => { if (socket?.readyState === 1) frame('phoenix','heartbeat',{}); }, 20_000);
    };
    socket.onmessage = event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || !joins.has(msg.topic)) return;
      if (msg.event === 'phx_reply' && msg.ref === joins.get(msg.topic)) {
        if (msg.payload?.status !== 'ok') { offline(); return; }
        joined.add(msg.topic);
        if (joined.size === topics.length) {
          clearTimeout(joinTimeout);
          delay = 1000;
          onNetwork(true);
        }
      } else if (msg.event === 'broadcast' && joined.has(msg.topic) && msg.payload?.event === 'frame') {
        receive(msg.topic.slice('realtime:'.length), msg.payload.payload);
      } else if (msg.event === 'phx_error' || msg.event === 'phx_close') {
        offline();
      }
    };
    socket.onclose = socket.onerror = offline;
  }
  connect();

  return {
    send(topic, packet) {
      if (closed) return;
      local.get(topic)?.postMessage(packet);
      const name = 'realtime:' + topic;
      if (socket?.readyState === 1 && joined.has(name)) frame(name, 'broadcast', {type:'broadcast',event:'frame',payload:packet});
    },
    close() {
      closed = true;
      clearTimeout(retry);
      offline();
      for (const channel of local.values()) channel.close();
    },
  };
}
