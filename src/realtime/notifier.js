// ============================================
// REALTIME NOTIFIER
// Socket.io quando o servidor roda como processo persistente (VPS/Shard).
// Fallback: Supabase Broadcast REST (Vercel serverless), se configurado.
// ============================================

let io = null;
let avisoSemRealtime = false;

function init(socketServer) {
  io = socketServer;
  console.log('[realtime] Socket.io inicializado');
}

async function broadcastSupabase(topic, event, payload, retries = 2) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!avisoSemRealtime) {
      avisoSemRealtime = true;
      console.warn('[realtime] Socket.io nao inicializado e Supabase nao configurado; notificacoes desabilitadas');
    }
    return;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({ messages: [{ topic, event, payload }] }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 202) return;
      console.error(`[realtime] broadcast falhou (${event}) tentativa ${attempt + 1}: HTTP ${res.status}`);
      if (attempt === retries) return;
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e.name === 'AbortError';
      console.error(`[realtime] broadcast erro (${event}) tentativa ${attempt + 1}:`, isAbort ? 'timeout 5s' : e.message);
      if (attempt === retries) return;
    }
    await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
  }
}

function emitToRoom(room, event, payload) {
  if (io) {
    io.to(room).emit(event, payload);
    return Promise.resolve();
  }
  return broadcastSupabase(room, event, payload);
}

module.exports = {
  init,
  emitToAdmin: (event, data) => emitToRoom('admin', event, data),
  emitToGarcom: (event, data) => emitToRoom('garcom', event, data),
  emitToMesa: (mesaId, event, data) => emitToRoom(`mesa-${mesaId}`, event, data),
  emitToPedido: (pedidoId, event, data) => emitToRoom(`pedido-${pedidoId}`, event, data)
};
