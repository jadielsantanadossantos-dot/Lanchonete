// ============================================
// SUPABASE REALTIME CLIENT - Broadcast
// Substitui Socket.io para funcionar na Vercel (serverless)
// Requer: @supabase/supabase-js carregado globalmente
// ============================================

let supabaseClient = null;
let initPromise = null;
const listeners = new Map();
const channels = new Map();
const EVENTS = ['novo-pedido', 'pedido-atualizado', 'pix-confirmado', 'motoboy-atribuido', 'comanda-atualizada', 'mesa-atualizada'];

async function loadConfig() {
  const res = await fetch('/api/config/public');
  if (!res.ok) throw new Error('Falha ao carregar configuração realtime');
  const cfg = await res.json();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Realtime não configurado no servidor');
  return cfg;
}

function notifyListeners(event, data) {
  const eventListeners = listeners.get(event) || [];
  eventListeners.forEach(callback => {
    try {
      callback(data);
    } catch (e) {
      console.error(`Erro no listener ${event}:`, e);
    }
  });
}

function ensureTopic(topic) {
  if (channels.has(topic)) return;
  if (!supabaseClient) {
    // aguarda init
    initRealtime().then(() => ensureTopic(topic)).catch(()=>{});
    return;
  }
  const ch = supabaseClient.channel(topic, { config: { broadcast: { self: false } } });
  EVENTS.forEach(ev => {
    ch.on('broadcast', { event: ev }, ({ payload }) => notifyListeners(ev, payload));
  });
  ch.subscribe(status => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      // Silenciar avisos de CHANNEL_ERROR/TIMED_OUT em ambiente local sem Supabase Realtime ativo
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        console.warn(`Realtime canal ${topic}:`, status);
      } else {
        console.error(`Realtime canal ${topic}:`, status);
      }
      channels.delete(topic);
      setTimeout(() => ensureTopic(topic), 3000);
    }
  });
  channels.set(topic, ch);
}

function initRealtime() {
  if (!initPromise) {
    initPromise = (async () => {
      const cfg = await loadConfig();
      supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
      ensureTopic('admin');
      ensureTopic('garcom');
      console.log('Supabase Realtime conectado');
    })().catch(e => {
      console.error('Erro ao inicializar Realtime:', e);
      initPromise = null;
      // retry em 5s
      setTimeout(() => initRealtime().catch(()=>{}), 5000);
      throw e;
    });
  }
  return initPromise;
}

function subscribe(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);

  return () => {
    const arr = listeners.get(event) || [];
    const idx = arr.indexOf(callback);
    if (idx !== -1) arr.splice(idx, 1);
  };
}

function unsubscribe(event, callback) {
  const arr = listeners.get(event) || [];
  const idx = arr.indexOf(callback);
  if (idx !== -1) arr.splice(idx, 1);
}

function joinMesa(mesaId) {
  initRealtime().then(() => ensureTopic(`mesa-${mesaId}`));
}

function leaveMesa(mesaId) {
  const topic = `mesa-${mesaId}`;
  const ch = channels.get(topic);
  if (ch && supabaseClient) {
    supabaseClient.removeChannel(ch);
    channels.delete(topic);
  }
}

function leavePedido(pedidoId) {
  const topic = `pedido-${pedidoId}`;
  const ch = channels.get(topic);
  if (ch && supabaseClient) {
    supabaseClient.removeChannel(ch);
    channels.delete(topic);
  }
}

function joinAdmin() {
  initRealtime().then(() => ensureTopic('admin'));
}

function joinGarcom() {
  initRealtime().then(() => ensureTopic('garcom'));
}

function joinPedido(pedidoId) {
  initRealtime().then(() => ensureTopic(`pedido-${pedidoId}`));
}

// ============================================
// PAINEL CLIENTE (app.js)
// ============================================

function subscribePixConfirmado(pedidoId, callback) {
  const handler = (data) => {
    if (data.id === pedidoId) callback(data);
  };
  return subscribe('pix-confirmado', handler);
}

function subscribePedidoStatus(pedidoId, callback) {
  joinPedido(pedidoId);
  const handler = (data) => {
    if (String(data.id) === String(pedidoId)) callback(data);
  };
  const unsub = subscribe('pedido-atualizado', handler);
  return () => {
    unsub();
    leavePedido(pedidoId);
  };
}

// ============================================
// PAINEL GARÇOM (garcom.js)
// ============================================

function subscribeComandaMesa(mesaId, callback) {
  joinMesa(mesaId);
  const handler = (data) => {
    if (data.mesaId === mesaId) callback({ eventType: 'UPDATE' });
  };
  return subscribe('comanda-atualizada', handler);
}

function subscribeMesasStatus(callback) {
  joinGarcom();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('mesa-atualizada', handler);
}

function subscribeNovoPedidoGarcom(callback) {
  joinGarcom();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('novo-pedido', handler);
}

// ============================================
// PAINEL ADMIN (admin.js)
// ============================================

function subscribeNovoPedidoAdmin(callback) {
  joinAdmin();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('novo-pedido', handler);
}

function subscribePedidosAdmin(callback) {
  joinAdmin();
  const unsub1 = subscribe('novo-pedido', (data) => callback({ eventType: 'INSERT', new: data }));
  const unsub2 = subscribe('pedido-atualizado', (data) => callback({ eventType: 'UPDATE', new: data }));
  const unsub3 = subscribe('pix-confirmado', (data) => callback({ eventType: 'UPDATE', new: { ...data, pix_confirmado: true } }));
  return () => { unsub1(); unsub2(); unsub3(); };
}

function subscribeComandaAdmin(callback) {
  joinAdmin();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('comanda-atualizada', handler);
}

// ============================================
// COMUM
// ============================================

function cleanupRealtime() {
  if (supabaseClient) {
    channels.forEach(ch => supabaseClient.removeChannel(ch));
    channels.clear();
    supabaseClient = null;
    initPromise = null;
  }
  listeners.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupRealtime);
  window.addEventListener('pagehide', cleanupRealtime);

  window.Realtime = {
    init: initRealtime,
    subscribePixConfirmado,
    subscribePedidoStatus,
    joinPedido,
    leavePedido,
    subscribeComandaMesa,
    subscribeMesasStatus,
    subscribeNovoPedidoGarcom,
    subscribeNovoPedidoAdmin,
    subscribePedidosAdmin,
    subscribeComandaAdmin,
    cleanup: cleanupRealtime
  };
}
