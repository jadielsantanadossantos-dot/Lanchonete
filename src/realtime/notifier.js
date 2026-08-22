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

async function broadcast(topic, event, payload) {
  const { url, key } = getConfig();
  if (!url || !key) {
    console.warn(`Realtime desabilitado (sem SUPABASE_URL/SERVICE_ROLE_KEY): ${event}`);
    return;
  }
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload }]
      })
    });
    if (!res.ok && res.status !== 202) {
      console.error(`Realtime broadcast falhou (${event}): HTTP ${res.status}`);
    }
  } catch (e) {
    console.error(`Realtime broadcast erro (${event}):`, e.message);
  }
}

module.exports = {
  emitToAdmin: (event, data) => broadcast('admin', event, data),
  emitToGarcom: (event, data) => broadcast('garcom', event, data),
  emitToMesa: (mesaId, event, data) => broadcast(`mesa-${mesaId}`, event, data)
};
