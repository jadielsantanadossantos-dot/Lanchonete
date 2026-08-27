// ============================================
// REALTIME NOTIFIER - Supabase Broadcast REST
// Substitui Socket.io para compatibilidade com Vercel serverless
// Docs: https://supabase.com/docs/guides/realtime/broadcast
// ============================================

function getConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function broadcast(topic, event, payload, retries = 2) {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.warn(`Realtime desabilitado (sem SUPABASE_URL/SERVICE_ROLE_KEY): ${event}`);
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
      console.error(`Realtime broadcast falhou (${event}) tentativa ${attempt + 1}: HTTP ${res.status}`);
      if (attempt === retries) return;
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e.name === 'AbortError';
      console.error(`Realtime broadcast erro (${event}) tentativa ${attempt + 1}:`, isAbort ? 'timeout 5s' : e.message);
      if (attempt === retries) return;
    }
    // backoff exponencial simples
    await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
  }
}

module.exports = {
  emitToAdmin: (event, data) => broadcast('admin', event, data),
  emitToGarcom: (event, data) => broadcast('garcom', event, data),
  emitToMesa: (mesaId, event, data) => broadcast(`mesa-${mesaId}`, event, data),
  emitToPedido: (pedidoId, event, data) => broadcast(`pedido-${pedidoId}`, event, data)
};
